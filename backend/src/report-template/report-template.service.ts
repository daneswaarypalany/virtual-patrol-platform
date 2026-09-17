import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateReportTemplateDto } from './dto/report-template.dto';
import {
  DEFAULT_REPORT_FIELDS,
  REPORT_FIELD_DEFS,
  REPORT_FIELD_KEYS,
  ReportTemplateField,
} from './report-fields';

const DEFAULT_KEY = 'default';

@Injectable()
export class ReportTemplateService {
  constructor(private prisma: PrismaService) {}

  // Ensure the built-in default template row exists
  private async ensureDefault() {
    const existing = await this.prisma.reportTemplate.findUnique({
      where: { key: DEFAULT_KEY },
    });
    if (!existing) {
      await this.prisma.reportTemplate.create({
        data: {
          key: DEFAULT_KEY,
          name: 'Default Template',
          fields: DEFAULT_REPORT_FIELDS as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  // merge saved field state with the defs (labels/descriptions/groups)
  private mergeFields(saved: ReportTemplateField[]) {
    const byKey = new Map(REPORT_FIELD_DEFS.map((f) => [f.key, f]));
    return saved
      .filter((f) => byKey.has(f.key))
      .map((f) => ({
        ...byKey.get(f.key)!,
        enabled: f.enabled,
        height: (f as any).height,
        width: (f as any).width,
      }));
  }

  // ---- List all templates (for the library page + pickers) ----
  async listTemplates() {
    await this.ensureDefault();
    const rows = await this.prisma.reportTemplate.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isDefault: r.key === DEFAULT_KEY,
      updatedAt: r.updatedAt,
    }));
  }

  // ---- Get one template's full field layout (by id, or the default) ----
  async getTemplateById(id?: string) {
    await this.ensureDefault();
    const row = id
      ? await this.prisma.reportTemplate.findUnique({ where: { id } })
      : await this.prisma.reportTemplate.findUnique({
          where: { key: DEFAULT_KEY },
        });

    if (!row) throw new NotFoundException('Template not found');

    const saved =
      (row.fields as unknown as ReportTemplateField[] | undefined) ??
      DEFAULT_REPORT_FIELDS;

    return {
      id: row.id,
      key: row.key,
      name: row.name,
      isDefault: row.key === DEFAULT_KEY,
      fields: this.mergeFields(saved),
      updatedAt: row.updatedAt,
    };
  }

  // Backward-compat: the old getTemplate() returns the default
  async getTemplate() {
    return this.getTemplateById(undefined);
  }

  // What patrol.service needs: ordered {key, enabled} for a given site's template
  async getFieldOrder(templateId?: string | null): Promise<ReportTemplateField[]> {
    await this.ensureDefault();
    const row = templateId
      ? await this.prisma.reportTemplate.findUnique({ where: { id: templateId } })
      : await this.prisma.reportTemplate.findUnique({
          where: { key: DEFAULT_KEY },
        });

    const saved = row?.fields as unknown as ReportTemplateField[] | undefined;
    if (!saved) return DEFAULT_REPORT_FIELDS;

    const knownKeys = new Set(saved.map((f) => f.key));
    const missing = REPORT_FIELD_DEFS.filter((f) => !knownKeys.has(f.key)).map(
      (f) => ({ key: f.key, enabled: true }),
    );
    return [
      ...saved.filter((f) => REPORT_FIELD_KEYS.includes(f.key)),
      ...missing,
    ];
  }

  // ---- Create a new named template (starts from defaults) ----
  async createTemplate(name: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('Template name is required');
    }
    const key = `tpl_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    const row = await this.prisma.reportTemplate.create({
      data: {
        key,
        name: name.trim(),
        fields: DEFAULT_REPORT_FIELDS as unknown as Prisma.InputJsonValue,
      },
    });
    return this.getTemplateById(row.id);
  }

  // ---- Rename ----
  async renameTemplate(id: string, name: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('Template name is required');
    }
    await this.prisma.reportTemplate.update({
      where: { id },
      data: { name: name.trim() },
    });
    return this.getTemplateById(id);
  }

  // ---- Save a template's fields (by id) ----
  async updateTemplateById(id: string, dto: UpdateReportTemplateDto) {
    const givenKeys = dto.fields.map((f) => f.key);
    const uniqueGivenKeys = new Set(givenKeys);

    if (uniqueGivenKeys.size !== givenKeys.length) {
      throw new BadRequestException('Duplicate field keys in report template');
    }
    const missing = REPORT_FIELD_KEYS.filter((k) => !uniqueGivenKeys.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Report template is missing required fields: ${missing.join(', ')}`,
      );
    }

    const fields = dto.fields.map((f) => ({
      key: f.key,
      enabled: f.enabled,
      ...(f.height !== undefined ? { height: f.height } : {}),
      ...(f.width !== undefined ? { width: f.width } : {}),
    }));
    const jsonFields = fields as unknown as Prisma.InputJsonValue;

    await this.prisma.reportTemplate.update({
      where: { id },
      data: { fields: jsonFields },
    });

    return this.getTemplateById(id);
  }

  // Backward-compat: old updateTemplate() saves the default
  async updateTemplate(dto: UpdateReportTemplateDto) {
    await this.ensureDefault();
    const def = await this.prisma.reportTemplate.findUnique({
      where: { key: DEFAULT_KEY },
    });
    return this.updateTemplateById(def!.id, dto);
  }

  // ---- Delete (cannot delete the default) ----
  async deleteTemplate(id: string) {
    const row = await this.prisma.reportTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Template not found');
    if (row.key === DEFAULT_KEY) {
      throw new BadRequestException('The default template cannot be deleted');
    }
    // sites referencing it fall back to null via onDelete: SetNull
    await this.prisma.reportTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}