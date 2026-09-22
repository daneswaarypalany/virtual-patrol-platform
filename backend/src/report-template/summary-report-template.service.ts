import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_SUMMARY_REPORT_FIELDS,
  SUMMARY_REPORT_FIELD_DEFS,
  SUMMARY_REPORT_FIELD_KEYS,
  SummaryReportTemplateField,
} from './summary-report-fields';

const DEFAULT_KEY = 'summary_default';

@Injectable()
export class SummaryReportTemplateService {
  constructor(private prisma: PrismaService) {}

  private async ensureDefault() {
    const existing = await this.prisma.summaryTemplate.findUnique({
      where: { key: DEFAULT_KEY },
    });
    if (!existing) {
      await this.prisma.summaryTemplate.create({
        data: {
          key: DEFAULT_KEY,
          name: 'Default Template',
          fields: DEFAULT_SUMMARY_REPORT_FIELDS as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  private mergeFields(saved: SummaryReportTemplateField[]) {
    const byKey = new Map(SUMMARY_REPORT_FIELD_DEFS.map((f) => [f.key, f]));
    return saved
      .filter((f) => byKey.has(f.key))
      .map((f) => ({ ...byKey.get(f.key)!, enabled: f.enabled }));
  }

  async listTemplates() {
    await this.ensureDefault();
    const rows = await this.prisma.summaryTemplate.findMany({
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

  async getTemplateById(id?: string) {
    await this.ensureDefault();
    const row = id
      ? await this.prisma.summaryTemplate.findUnique({ where: { id } })
      : await this.prisma.summaryTemplate.findUnique({
          where: { key: DEFAULT_KEY },
        });

    if (!row) throw new NotFoundException('Summary report template not found');

    const saved =
      (row.fields as unknown as SummaryReportTemplateField[] | undefined) ??
      DEFAULT_SUMMARY_REPORT_FIELDS;

    return {
      id: row.id,
      key: row.key,
      name: row.name,
      isDefault: row.key === DEFAULT_KEY,
      fields: this.mergeFields(saved),
      updatedAt: row.updatedAt,
    };
  }

  async getTemplate() {
    return this.getTemplateById(undefined);
  }

  async getFieldOrder(templateId?: string | null): Promise<SummaryReportTemplateField[]> {
    await this.ensureDefault();
    const row = templateId
      ? await this.prisma.summaryTemplate.findUnique({ where: { id: templateId } })
      : await this.prisma.summaryTemplate.findUnique({
          where: { key: DEFAULT_KEY },
        });

    const saved = row?.fields as unknown as SummaryReportTemplateField[] | undefined;
    if (!saved) return DEFAULT_SUMMARY_REPORT_FIELDS;

    const knownKeys = new Set(saved.map((f) => f.key));
    const missing = SUMMARY_REPORT_FIELD_DEFS.filter(
      (f) => !knownKeys.has(f.key),
    ).map((f) => ({ key: f.key, enabled: true }));
    return [
      ...saved.filter((f) => SUMMARY_REPORT_FIELD_KEYS.includes(f.key)),
      ...missing,
    ];
  }

  async createTemplate(name: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('Template name is required');
    }
    const key = `summary_tpl_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    const row = await this.prisma.summaryTemplate.create({
      data: {
        key,
        name: name.trim(),
        fields: DEFAULT_SUMMARY_REPORT_FIELDS as unknown as Prisma.InputJsonValue,
      },
    });
    return this.getTemplateById(row.id);
  }

  async renameTemplate(id: string, name: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('Template name is required');
    }
    await this.prisma.summaryTemplate.update({
      where: { id },
      data: { name: name.trim() },
    });
    return this.getTemplateById(id);
  }

  async updateTemplateById(id: string, fields: SummaryReportTemplateField[]) {
    const givenKeys = fields.map((f) => f.key);
    const uniqueGivenKeys = new Set(givenKeys);

    if (uniqueGivenKeys.size !== givenKeys.length) {
      throw new BadRequestException('Duplicate field keys in summary report template');
    }
    const missing = SUMMARY_REPORT_FIELD_KEYS.filter((k) => !uniqueGivenKeys.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Summary report template is missing required fields: ${missing.join(', ')}`,
      );
    }

    const jsonFields = fields.map((f) => ({
      key: f.key,
      enabled: f.enabled,
    })) as unknown as Prisma.InputJsonValue;

    await this.prisma.summaryTemplate.update({
      where: { id },
      data: { fields: jsonFields },
    });

    return this.getTemplateById(id);
  }

  async updateTemplate(fields: SummaryReportTemplateField[]) {
    await this.ensureDefault();
    const def = await this.prisma.summaryTemplate.findUnique({
      where: { key: DEFAULT_KEY },
    });
    return this.updateTemplateById(def!.id, fields);
  }

  async deleteTemplate(id: string) {
    const row = await this.prisma.summaryTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Summary report template not found');
    if (row.key === DEFAULT_KEY) {
      throw new BadRequestException('The default summary report template cannot be deleted');
    }
    await this.prisma.summaryTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}