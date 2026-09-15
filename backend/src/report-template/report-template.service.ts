import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateReportTemplateDto } from './dto/report-template.dto';
import {
  DEFAULT_REPORT_FIELDS,
  REPORT_FIELD_DEFS,
  REPORT_FIELD_KEYS,
  ReportTemplateField,
} from './report-fields';

const TEMPLATE_KEY = 'default';

@Injectable()
export class ReportTemplateService {
  constructor(private prisma: PrismaService) {}

  // Returns the field defs (label/description/group) merged with the saved
  // order/enabled state, so the frontend never has to hardcode labels.
  async getTemplate() {
    const row = await this.prisma.reportTemplate.findUnique({
      where: { key: TEMPLATE_KEY },
    });

    const fields = (row?.fields as ReportTemplateField[] | undefined) ??
      DEFAULT_REPORT_FIELDS;

    const byKey = new Map(REPORT_FIELD_DEFS.map((f) => [f.key, f]));

    return {
      fields: fields
        .filter((f) => byKey.has(f.key))
        .map((f) => ({ ...byKey.get(f.key)!, enabled: f.enabled })),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  // Returns just the ordered {key, enabled} list -- what patrol.service.ts
  // actually needs when rendering a report, without the label/description
  // fluff the frontend wants.
  async getFieldOrder(): Promise<ReportTemplateField[]> {
    const row = await this.prisma.reportTemplate.findUnique({
      where: { key: TEMPLATE_KEY },
    });
    const saved = row?.fields as ReportTemplateField[] | undefined;
    if (!saved) return DEFAULT_REPORT_FIELDS;

    // Guard against a stale saved list missing a field that was added to
    // REPORT_FIELD_DEFS after the template was last saved -- append any
    // missing ones at the end, enabled by default, rather than silently
    // dropping that section from every report forever.
    const knownKeys = new Set(saved.map((f) => f.key));
    const missing = REPORT_FIELD_DEFS.filter((f) => !knownKeys.has(f.key)).map(
      (f) => ({ key: f.key, enabled: true }),
    );
    return [...saved.filter((f) => REPORT_FIELD_KEYS.includes(f.key)), ...missing];
  }

  async updateTemplate(dto: UpdateReportTemplateDto) {
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

    const fields: ReportTemplateField[] = dto.fields.map((f) => ({
      key: f.key,
      enabled: f.enabled,
    }));
    // Cast: ReportTemplateField[] is plain JSON-safe data (string + boolean
    // fields only), but TypeScript can't structurally verify a named
    // interface satisfies Prisma's InputJsonObject index signature.
    const jsonFields = fields as unknown as Prisma.InputJsonValue;

    await this.prisma.reportTemplate.upsert({
      where: { key: TEMPLATE_KEY },
      create: { key: TEMPLATE_KEY, fields: jsonFields },
      update: { fields: jsonFields },
    });

    return this.getTemplate();
  }
}