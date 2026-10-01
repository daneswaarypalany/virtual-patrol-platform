import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  SUMMARY_REPORT_FIELD_DEFS,
  SUMMARY_REPORT_FIELD_KEYS,
  DEFAULT_SUMMARY_REPORT_FIELDS,
  SummaryReportTemplateField,
} from '../report-template/summary-report-fields'

const DEFAULT_KEY = 'default'

@Injectable()
export class SummaryTemplateService {
  constructor(private prisma: PrismaService) {}

  private async ensureDefault() {
    const existing = await this.prisma.summaryTemplate.findUnique({
      where: { key: DEFAULT_KEY },
    })
    if (!existing) {
      await this.prisma.summaryTemplate.create({
        data: {
          key: DEFAULT_KEY,
          name: 'Default Summary Template',
          fields: DEFAULT_SUMMARY_REPORT_FIELDS as unknown as Prisma.InputJsonValue,
        },
      })
    }
  }

  private mergeFields(saved: SummaryReportTemplateField[]) {
    const byKey = new Map(SUMMARY_REPORT_FIELD_DEFS.map((f) => [f.key, f]))
    return saved
      .filter((f) => byKey.has(f.key))
      .map((f) => ({
        ...byKey.get(f.key)!,
        enabled: f.enabled,
        height: f.height,
        width: f.width,
        row: f.row,
      }))
  }

  // Same 20–1000px / 10–100% bounds used by the single-patrol report
  // template, kept here since this controller doesn't run its fields
  // through a class-validator DTO.
  private clampSize(f: SummaryReportTemplateField): SummaryReportTemplateField {
    const clamp = (v: number, min: number, max: number) =>
      Math.min(max, Math.max(min, Math.round(v)))
    return {
      key: f.key,
      enabled: f.enabled,
      ...(typeof f.height === 'number'
        ? { height: clamp(f.height, 20, 1000) }
        : {}),
      ...(typeof f.width === 'number'
        ? { width: clamp(f.width, 10, 100) }
        : {}),
      ...(typeof f.row === 'number'
        ? { row: Math.max(0, Math.round(f.row)) }
        : {}),
    }
  }

  async listTemplates() {
    await this.ensureDefault()
    const rows = await this.prisma.summaryTemplate.findMany({
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isDefault: r.key === DEFAULT_KEY,
      updatedAt: r.updatedAt,
    }))
  }

  async getTemplateById(id?: string) {
    await this.ensureDefault()
    const row = id
      ? await this.prisma.summaryTemplate.findUnique({ where: { id } })
      : await this.prisma.summaryTemplate.findUnique({
          where: { key: DEFAULT_KEY },
        })
    if (!row) throw new NotFoundException('Summary template not found')
    const saved =
      (row.fields as unknown as SummaryReportTemplateField[] | undefined) ??
      DEFAULT_SUMMARY_REPORT_FIELDS
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      isDefault: row.key === DEFAULT_KEY,
      fields: this.mergeFields(saved),
      updatedAt: row.updatedAt,
    }
  }

  async createTemplate(name: string) {
    if (!name?.trim())
      throw new BadRequestException('Template name is required')
    const key = `stpl_${Date.now()}_${Math.round(Math.random() * 1e6)}`
    const row = await this.prisma.summaryTemplate.create({
      data: {
        key,
        name: name.trim(),
        fields:
          DEFAULT_SUMMARY_REPORT_FIELDS as unknown as Prisma.InputJsonValue,
      },
    })
    return this.getTemplateById(row.id)
  }

  async renameTemplate(id: string, name: string) {
    if (!name?.trim())
      throw new BadRequestException('Template name is required')
    await this.prisma.summaryTemplate.update({
      where: { id },
      data: { name: name.trim() },
    })
    return this.getTemplateById(id)
  }

  async updateTemplateById(
    id: string,
    fields: SummaryReportTemplateField[],
  ) {
    const givenKeys = fields.map((f) => f.key)
    const missing = SUMMARY_REPORT_FIELD_KEYS.filter(
      (k) => !givenKeys.includes(k),
    )
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required fields: ${missing.join(', ')}`,
      )
    }
    const clamped = fields.map((f) => this.clampSize(f))
    const jsonFields = clamped as unknown as Prisma.InputJsonValue
    await this.prisma.summaryTemplate.update({
      where: { id },
      data: { fields: jsonFields },
    })
    return this.getTemplateById(id)
  }

  async deleteTemplate(id: string) {
    const row = await this.prisma.summaryTemplate.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Summary template not found')
    if (row.key === DEFAULT_KEY)
      throw new BadRequestException(
        'Cannot delete the default summary template',
      )
    await this.prisma.summaryTemplate.delete({ where: { id } })
    return { deleted: true }
  }
}