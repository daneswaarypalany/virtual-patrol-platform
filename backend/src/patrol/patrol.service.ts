import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import * as fs from 'fs'
import { join } from 'path'
import type { Browser } from 'puppeteer'
import { PDFDocument } from 'pdf-lib'
import { ReportTemplateService } from '../report-template/report-template.service'
import type { ReportTemplateField } from '../report-template/report-fields'
import { SummaryReportTemplateService } from '../report-template/summary-report-template.service'
import type { SummaryReportTemplateField } from '../report-template/summary-report-fields'
import {
  LAYOUT_CSS,
  esc,
  groupIntoRows,
  renderBlock,
  renderRow,
} from '../report-template/layout-rows'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class PatrolService {
  constructor(
    private prisma: PrismaService,
    private reportTemplateService: ReportTemplateService,
    private summaryReportTemplateService: SummaryReportTemplateService,
    private notificationsService: NotificationsService,
  ) {}

  async mySites(operatorId: string) {
    const assignments = await this.prisma.operatorSiteAssignment.findMany({
      where: { userId: operatorId },
      include: { site: true },
    })

    return assignments
      .map((assignment) => assignment.site)
      .filter((site) => site.isActive)
  }

  async routesForSite(operatorId: string, siteId: string) {
    await this.assertAssigned(operatorId, siteId)

    return this.prisma.route.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { checkpoints: true },
        },
      },
    })
  }

  async start(operatorId: string, routeId: string) {
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      include: {
        site: true,
        checkpoints: {
          orderBy: { orderIndex: 'asc' },
          include: {
            camera: true,
            checklistTemplate: {
              include: {
                items: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
        },
      },
    })

    if (!route) {
      throw new NotFoundException('Route not found')
    }

    await this.assertAssigned(operatorId, route.siteId)

    try {
      const job = await this.prisma.$transaction(
        async (tx) => {
          const createdJob = await tx.patrolJob.create({
            data: {
              routeId,
              operatorId,
              status: 'IN_PROGRESS',
              lastActivityAt: new Date(),
            },
          })

          await tx.activePatrol.create({
            data: {
              siteId: route.siteId,
              jobId: createdJob.id,
            },
          })

          return createdJob
        },
        {
          isolationLevel: 'Serializable',
        },
      )

      // Best-effort: let the site's configured channels know a patrol has begun.
      this.notify(route.siteId, {
        eventType: 'PATROL_STARTED',
        siteId: route.siteId,
        title: `Patrol started — ${route.name}`,
        message: `A patrol has started on route "${route.name}" at ${route.site.name}.`,
        metadata: { jobId: job.id },
      })

      return { job, route }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const active = await this.prisma.activePatrol.findUnique({
          where: { siteId: route.siteId },
          include: { job: true },
        })

        if (active && active.job.operatorId === operatorId) {
          throw new ConflictException({
            code: 'OWN_ACTIVE_PATROL',
            message: 'You already have an active patrol on this site.',
            jobId: active.jobId,
          })
        }

        throw new ConflictException({
          code: 'OTHER_ACTIVE_PATROL',
          message:
            'A patrol is already active on this site by another operator.',
        })
      }

      throw error
    }
  }

  async getJob(user: { id: string; role: string }, jobId: string) {
    const job = await this.prisma.patrolJob.findUnique({
      where: { id: jobId },
      include: {
        route: {
          include: {
            site: true,
            checkpoints: {
              orderBy: { orderIndex: 'asc' },
              include: {
                camera: true,
                checklistTemplate: {
                  include: {
                    items: {
                      orderBy: { orderIndex: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        results: true,
      },
    })

    if (!job) {
      throw new NotFoundException('Patrol job not found')
    }

    if (user.role === 'OPERATOR' && job.operatorId !== user.id) {
      throw new ForbiddenException('Not your patrol job')
    }
    if (user.role === 'VIEWER') {
      const siteIds = await this.assignedSiteIds(user.id)
      if (!siteIds.includes(job.route.siteId)) {
        throw new ForbiddenException('This site is not assigned to you')
      }
    }

    return job
  }

  async saveCheckpoint(
    operatorId: string,
    jobId: string,
    data: {
      checkpointId: string
      allClear: boolean
      checklistState?: Prisma.InputJsonValue
      comment?: string
      screenshotPath?: string
    },
  ) {
    const job = await this.prisma.patrolJob.findUnique({
      where: { id: jobId },
    })

    if (!job) {
      throw new NotFoundException('Patrol job not found')
    }

    if (job.operatorId !== operatorId) {
      throw new ForbiddenException('Not your patrol job')
    }

    const checkpoint = await this.prisma.routeCheckpoint.findFirst({
      where: {
        id: data.checkpointId,
        routeId: job.routeId,
      },
      include: {
        camera: true,
        route: { include: { site: true } },
      },
    })

    if (!checkpoint) {
      throw new BadRequestException(
        'This checkpoint does not belong to this patrol route',
      )
    }

    if (!data.allClear && (!data.comment || !data.comment.trim())) {
      throw new BadRequestException(
        'A comment is required when an issue is flagged',
      )
    }

    const existing = await this.prisma.checkpointResult.findUnique({
      where: {
        jobId_checkpointId: {
          jobId,
          checkpointId: data.checkpointId,
        },
      },
    })

    if (!data.screenshotPath && !existing?.screenshotPath) {
      throw new BadRequestException(
        'A screenshot is required for every checkpoint',
      )
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.checkpointResult.upsert({
        where: {
          jobId_checkpointId: {
            jobId,
            checkpointId: data.checkpointId,
          },
        },
        create: {
          jobId,
          checkpointId: data.checkpointId,
          allClear: data.allClear,
          checklistState: data.checklistState,
          comment: data.comment,
          screenshotPath: data.screenshotPath,
        },
        update: {
          allClear: data.allClear,
          checklistState: data.checklistState,
          comment: data.comment,
          screenshotPath: data.screenshotPath ?? existing?.screenshotPath,
        },
      })

      await tx.patrolJob.update({
        where: { id: jobId },
        data: {
          lastCheckpointId: data.checkpointId,
          lastActivityAt: new Date(),
        },
      })

      return result
    }).then((result) => {
      // Real-time alert the moment an issue is flagged — don't wait for
      // the patrol to finish. Re-flagging the same checkpoint re-alerts too,
      // since the situation may have changed (new comment/screenshot).
      if (!data.allClear) {
        this.notify(checkpoint.route.siteId, {
          eventType: 'PATROL_ISSUES_FLAGGED',
          siteId: checkpoint.route.siteId,
          title: `Issue flagged — ${checkpoint.camera.name}`,
          message: `${checkpoint.camera.name} (${checkpoint.route.name}, ${checkpoint.route.site.name})\n${data.comment?.trim()}`,
          metadata: { jobId, checkpointId: data.checkpointId },
        })
      }
      return result
    })
  }

  async saveDraft(operatorId: string, jobId: string) {
    const job = await this.prisma.patrolJob.findUnique({
      where: { id: jobId },
    })

    if (!job) {
      throw new NotFoundException('Patrol job not found')
    }

    if (job.operatorId !== operatorId) {
      throw new ForbiddenException('Not your patrol job')
    }

    if (job.status === 'COMPLETED') {
      throw new BadRequestException('Completed patrols cannot be saved as drafts')
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.patrolJob.update({
        where: { id: jobId },
        data: {
          status: 'DRAFT',
          lastActivityAt: new Date(),
        },
      })

      await tx.activePatrol.deleteMany({
        where: { jobId },
      })

      return updatedJob
    })
  }

  async complete(operatorId: string, jobId: string) {
    const job = await this.prisma.patrolJob.findUnique({
      where: { id: jobId },
      include: {
        route: { include: { site: true, checkpoints: { include: { camera: true } } } },
        results: true,
      },
    })

    if (!job) {
      throw new NotFoundException('Patrol job not found')
    }

    if (job.operatorId !== operatorId) {
      throw new ForbiddenException('Not your patrol job')
    }

    const resultCheckpointIds = new Set(job.results.map((r) => r.checkpointId))
    const missing = job.route.checkpoints.filter(
      (cp) => !resultCheckpointIds.has(cp.id),
    )
    if (missing.length > 0) {
      throw new BadRequestException(
        'Every checkpoint needs a saved result with a screenshot before the patrol can be completed',
      )
    }

    const completedJob = await this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.patrolJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastActivityAt: new Date(),
        },
      })

      await tx.activePatrol.deleteMany({
        where: { jobId },
      })

      return updatedJob
    })

    // Let the site's configured channels know the patrol has finished,
    // with a recap of anything flagged. A failure here must never fail
    // the completion itself.
    this.notifyPatrolCompleted(job)

    return completedJob
  }

  private notifyPatrolCompleted(job: {
    id: string
    route: {
      name: string
      siteId: string
      site: { name: string }
      checkpoints: { id: string; camera: { name: string } }[]
    }
    results: { checkpointId: string; allClear: boolean; comment: string | null }[]
  }) {
    const checkpointById = new Map(job.route.checkpoints.map((cp) => [cp.id, cp]))
    const flagged = job.results.filter((r) => !r.allClear)

    const title =
      flagged.length === 0
        ? `Patrol completed — ${job.route.name}`
        : `Patrol completed — ${flagged.length} issue${flagged.length === 1 ? '' : 's'} flagged — ${job.route.name}`

    const message =
      flagged.length === 0
        ? `Patrol on route "${job.route.name}" at ${job.route.site.name} is complete. No issues flagged.`
        : flagged
            .map((r, i) => {
              const checkpointName = checkpointById.get(r.checkpointId)?.camera.name ?? 'Unknown checkpoint'
              const comment = r.comment?.trim() ? ` — ${r.comment.trim()}` : ''
              return `${i + 1}. ${checkpointName}${comment}`
            })
            .join('\n')

    this.notify(job.route.siteId, {
      eventType: 'PATROL_COMPLETED',
      siteId: job.route.siteId,
      title,
      message,
      metadata: { jobId: job.id, issueCount: flagged.length },
    })
  }

  // Fire-and-forget dispatch to a site's configured WhatsApp/Telegram/Email
  // channels. Never throws — a notification failure must never break the
  // patrol action (start/flag/complete) that triggered it.
  private notify(
    siteId: string,
    event: {
      eventType:
        | 'PATROL_STARTED'
        | 'PATROL_ISSUES_FLAGGED'
        | 'PATROL_COMPLETED'
        | 'PATROL_CANCELLED'
      siteId: string
      title: string
      message: string
      metadata?: Record<string, unknown>
    },
  ) {
    this.notificationsService.sendToSite(siteId, event).catch(() => {
      // Already logged inside NotificationsService per-channel; swallow here
      // so a notification outage never surfaces as a patrol-action failure.
    })
  }

  // ---------- Active patrol management ----------

  async discardMyPatrol(operatorId: string, siteId: string) {
    const active = await this.prisma.activePatrol.findUnique({
      where: { siteId },
      include: { job: true },
    })
    if (!active) return { discarded: false }
    if (active.job.operatorId !== operatorId) {
      throw new ForbiddenException('This patrol belongs to another operator')
    }
    await this.prisma.patrolJob.delete({ where: { id: active.jobId } })
    return { discarded: true }
  }

  async listActivePatrols(user: { id: string; role: string }) {
    let where: any = { status: { in: ['IN_PROGRESS', 'DRAFT'] } }
    if (user.role === 'OPERATOR') {
      where = { ...where, operatorId: user.id }
    } else if (user.role === 'VIEWER') {
      const siteIds = await this.assignedSiteIds(user.id)
      where = { ...where, route: { siteId: { in: siteIds } } }
    }
    // ADMIN → sees all active/draft patrols

    const jobs = await this.prisma.patrolJob.findMany({
      where,
      orderBy: { lastActivityAt: 'desc' },
      include: {
        operator: { select: { fullName: true, username: true } },
        route: {
          include: {
            site: { select: { name: true } },
            checkpoints: {
              orderBy: { orderIndex: 'asc' },
              include: { camera: { select: { name: true } } },
            },
          },
        },
        activePatrol: true,
        results: {
          orderBy: { completedAt: 'desc' },
          include: { checkpoint: { include: { camera: { select: { name: true } } } } },
        },
        _count: { select: { results: true } },
      },
    })

    return jobs.map((job) => {
      const totalCheckpoints = job.route.checkpoints.length
      const doneIds = new Set(job.results.map((r) => r.checkpointId))
      const lastResult = job.results[0] ?? null
      const nextCheckpoint =
        job.route.checkpoints.find((cp) => !doneIds.has(cp.id)) ?? null

      const { results, route, ...rest } = job
      return {
        ...rest,
        route: {
          name: route.name,
          site: route.site,
        },
        totalCheckpoints,
        lastCheckpoint: lastResult
          ? {
              name: lastResult.checkpoint.camera.name,
              orderIndex: lastResult.checkpoint.orderIndex,
              allClear: lastResult.allClear,
              completedAt: lastResult.completedAt,
            }
          : null,
        nextCheckpoint: nextCheckpoint
          ? {
              name: nextCheckpoint.camera.name,
              orderIndex: nextCheckpoint.orderIndex,
            }
          : null,
      }
    })
  }

  async adminReleaseLock(jobId: string) {
    await this.prisma.activePatrol.deleteMany({ where: { jobId } })
    return { released: true }
  }

  async adminDeletePatrol(jobId: string) {
    const job = await this.prisma.patrolJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundException('Patrol job not found')
    await this.prisma.checkpointResult.deleteMany({ where: { jobId } })
    await this.prisma.activePatrol.deleteMany({ where: { jobId } })
    await this.prisma.patrolJob.delete({ where: { id: jobId } })
    return { deleted: true }
  }

  // ---------- Module G: Reports ----------

  async listJobs(user: { id: string; role: string }) {
    let where: any = {}
    if (user.role === 'OPERATOR') {
      where = { operatorId: user.id }
    } else if (user.role === 'VIEWER') {
      const siteIds = await this.assignedSiteIds(user.id)
      where = { route: { siteId: { in: siteIds } } }
    }
    // ADMIN → {} (all)

    return this.prisma.patrolJob.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: {
        route: { include: { site: { select: { name: true } } } },
        operator: { select: { fullName: true } },
        _count: { select: { results: true } },
      },
    })
  }

  async generateReport(user: { id: string; role: string }, jobId: string) {
    const job = await this.fetchJobForReport(user, jobId)
    const layout = await this.reportTemplateService.getFieldOrder(
      job.route.site.reportTemplateId,
    )
    const html = this.buildReportHtml(job, layout)

 const { default: puppeteer } = await import('puppeteer')
 const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    try {
      return await this.renderHtmlToPdf(browser, html)
    } finally {
      await browser.close()
    }
  }

  // Generates multiple reports and packages them together, either as one
  // merged PDF (in the same order as jobIds) or a zip of individual PDFs.
  async generateBulkReport(
    user: { id: string; role: string },
    jobIds: string[],
    format: 'pdf' | 'zip',
  ) {
    // dedupe while preserving the order the caller asked for
    const uniqueIds = Array.from(new Set(jobIds))
    // each patrol is laid out with its own site's report template
    const layoutCache = new Map<string, ReportTemplateField[]>()

const { default: puppeteer } = await import('puppeteer')
const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    try {
      const reports: { jobId: string; fileName: string; pdf: Buffer }[] = []

      for (const jobId of uniqueIds) {
        const job = await this.fetchJobForReport(user, jobId)
        const tplId = job.route.site.reportTemplateId
        const cacheKey = tplId ?? 'default'
        let layout = layoutCache.get(cacheKey)
        if (!layout) {
          layout = await this.reportTemplateService.getFieldOrder(tplId)
          layoutCache.set(cacheKey, layout)
        }
        const html = this.buildReportHtml(job, layout)
        const pdf = await this.renderHtmlToPdf(browser, html)
        const safeRoute = job.route.name.replace(/[^a-z0-9-_]+/gi, '_')
        const dateStamp = job.completedAt
          ? new Date(job.completedAt).toISOString().slice(0, 10)
          : 'undated'
        reports.push({
          jobId,
          fileName: `${safeRoute}-${dateStamp}-${jobId.slice(0, 8)}.pdf`,
          pdf,
        })
      }

      if (reports.length === 0) {
        throw new NotFoundException('No reports found for the given jobs')
      }

      if (format === 'pdf') {
        const merged = await PDFDocument.create()
        for (const r of reports) {
          const src = await PDFDocument.load(r.pdf)
          const pages = await merged.copyPages(src, src.getPageIndices())
          pages.forEach((p) => merged.addPage(p))
        }
        const mergedBytes = await merged.save()
        return { buffer: Buffer.from(mergedBytes), contentType: 'application/pdf' }
      }

      // zip
      const { ZipArchive } = await import('archiver')
      const archive = new ZipArchive({ zlib: { level: 9 } })
      const chunks: Buffer[] = []
      const done = new Promise<Buffer>((resolve, reject) => {
        archive.on('data', (chunk: Buffer) => chunks.push(chunk))
        archive.on('end', () => resolve(Buffer.concat(chunks)))
        archive.on('warning', (err: any) => {
          if (err.code !== 'ENOENT') reject(err)
        })
        archive.on('error', reject)
      })

      const usedNames = new Set<string>()
      for (const r of reports) {
        let name = r.fileName
        let i = 2
        while (usedNames.has(name)) {
          name = r.fileName.replace(/\.pdf$/, `-${i}.pdf`)
          i++
        }
        usedNames.add(name)
        archive.append(r.pdf, { name })
      }

      await archive.finalize()
      const buffer = await done
      return { buffer, contentType: 'application/zip' }
    } finally {
      await browser.close()
    }
  }

  // Generates a single aggregated PDF covering multiple patrols: overall
  // stats, a per-site breakdown, and a table listing every included patrol
  // -- as opposed to generateBulkReport, which packages the *individual*
  // per-patrol reports together rather than summarizing across them.
  async generateSummaryReport(
    user: { id: string; role: string },
    jobIds: string[],
    templateId?: string,
  ) {
    const uniqueIds = Array.from(new Set(jobIds))
    const jobs = await Promise.all(
      uniqueIds.map((id) => this.fetchJobForReport(user, id)),
    )

    if (jobs.length === 0) {
      throw new NotFoundException('No reports found for the given jobs')
    }

    const layout = await this.summaryReportTemplateService.getFieldOrder(templateId)
    const html = this.buildSummaryHtml(jobs, layout)
    
    const { default: puppeteer } = await import('puppeteer')
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    try {
      const pdf = await this.renderHtmlToPdf(browser, html)
      return { buffer: pdf, contentType: 'application/pdf' }
    } finally {
      await browser.close()
    }
  }

  private escapeXml(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // Donut chart (pure SVG, no client libs needed since this is rendered
  // server-side by Puppeteer): share of checkpoints that came back clear
  // vs. flagged, across all the included patrols.
  private donutChart(clearCount: number, issueCount: number) {
    const total = clearCount + issueCount
    const size = 150
    const stroke = 20
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const clearPct = total ? clearCount / total : 1
    const clearDash = clearPct * c
    const issueDash = c - clearDash
    const pctLabel = total ? Math.round(clearPct * 100) : 100

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#eef2f6" stroke-width="${stroke}" />
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#2e9e6b" stroke-width="${stroke}"
          stroke-dasharray="${clearDash} ${c}" stroke-linecap="butt"
          transform="rotate(-90 ${size / 2} ${size / 2})" />
        ${
          issueCount > 0
            ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#cf5b5b" stroke-width="${stroke}"
          stroke-dasharray="${issueDash} ${c}" stroke-dashoffset="${-clearDash}" stroke-linecap="butt"
          transform="rotate(-90 ${size / 2} ${size / 2})" />`
            : ''
        }
        <text x="${size / 2}" y="${size / 2 - 3}" text-anchor="middle" font-size="24" font-weight="bold" fill="#011f4b">${pctLabel}%</text>
        <text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" font-size="9" fill="#5f7488" letter-spacing="0.5">CLEAR</text>
      </svg>`
  }

  // Horizontal bar chart (pure SVG): issues per group (site or route,
  // depending on context), so problem areas jump out visually instead of
  // being buried in the table below.
  private issuesBarChart(rows: { label: string; issues: number }[]) {
    if (rows.length === 0) {
      return '<p style="color:#5f7488;font-size:12px;">No data</p>'
    }
    const max = Math.max(1, ...rows.map((s) => s.issues))
    const rowH = 26
    const chartW = 380
    const labelW = 108
    const barMaxW = chartW - labelW - 36
    const height = rows.length * rowH + 6

    const bars = rows
      .map((s, i) => {
        const y = i * rowH
        const w = s.issues > 0 ? Math.max(4, (s.issues / max) * barMaxW) : 0
        const color = s.issues > 0 ? '#cf5b5b' : '#2e9e6b'
        const label = this.escapeXml(
          s.label.length > 16 ? `${s.label.slice(0, 15)}…` : s.label,
        )
        return `
          <text x="0" y="${y + 15}" font-size="10.5" fill="#011f4b">${label}</text>
          <rect x="${labelW}" y="${y + 3}" width="${barMaxW}" height="14" rx="3" fill="#f4f7fa" />
          <rect x="${labelW}" y="${y + 3}" width="${w}" height="14" rx="3" fill="${color}" />
          <text x="${labelW + barMaxW + 8}" y="${y + 15}" font-size="10.5" font-weight="bold" fill="#011f4b">${s.issues}</text>`
      })
      .join('')

    return `<svg width="${chartW}" height="${height}" viewBox="0 0 ${chartW} ${height}">${bars}</svg>`
  }

  // Line + area chart (pure SVG): issues per day across the included date
  // range, so upward/downward trends are visible instead of just a total.
  private trendLineChart(data: { date: string; issues: number; total: number }[]) {
    if (data.length === 0) {
      return '<p style="color:#5f7488;font-size:12px;">No data</p>'
    }
    const w = 620
    const h = 160
    const padL = 28
    const padR = 10
    const padT = 12
    const padB = 24
    const chartW = w - padL - padR
    const chartH = h - padT - padB
    const maxIssues = Math.max(1, ...data.map((d) => d.issues))
    const n = data.length

    const x = (i: number) => (n === 1 ? padL + chartW / 2 : padL + (i / (n - 1)) * chartW)
    const y = (v: number) => padT + chartH - (v / maxIssues) * chartH

    const points = data.map((d, i) => `${x(i)},${y(d.issues)}`).join(' ')
    const areaPoints = `${x(0)},${padT + chartH} ${points} ${x(n - 1)},${padT + chartH}`

    const labelIdxs = Array.from(
      new Set([0, Math.floor((n - 1) / 2), n - 1]),
    )
    const labels = labelIdxs
      .map((i) => {
        const d = new Date(data[i].date)
        const txt = d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
        return `<text x="${x(i)}" y="${h - 6}" font-size="9.5" fill="#5f7488" text-anchor="middle">${txt}</text>`
      })
      .join('')

    const dots = data
      .map((d, i) => `<circle cx="${x(i)}" cy="${y(d.issues)}" r="3" fill="#cf5b5b" />`)
      .join('')

    return `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <line x1="${padL}" y1="${padT}" x2="${padL + chartW}" y2="${padT}" stroke="#eef2f6" stroke-width="1" />
        <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#d8e2ec" stroke-width="1" />
        <text x="${padL - 6}" y="${padT + 4}" font-size="9" fill="#5f7488" text-anchor="end">${maxIssues}</text>
        <text x="${padL - 6}" y="${padT + chartH + 4}" font-size="9" fill="#5f7488" text-anchor="end">0</text>
        <polygon points="${areaPoints}" fill="#cf5b5b" fill-opacity="0.08" />
        <polyline points="${points}" fill="none" stroke="#cf5b5b" stroke-width="2" />
        ${dots}
        ${labels}
      </svg>`
  }

  private buildSummaryHtml(
    jobs: Awaited<ReturnType<PatrolService['fetchJobForReport']>>[],
    layout: SummaryReportTemplateField[],
  ) {
    const enabledKeys = layout.filter((f) => f.enabled).map((f) => f.key)
    const isOn = (key: string) => enabledKeys.includes(key)
    // Item options default to visible for older templates that predate these
    // controls. The template service normalizes options, but this fallback
    // also keeps direct/legacy layouts backward compatible.
    const isItemOn = (fieldKey: string, itemKey: string) =>
      layout.find((field) => field.key === fieldKey)?.options?.[itemKey] !== false
    const hasVisibleItems = (fieldKey: string) => {
      const field = layout.find((item) => item.key === fieldKey)
      return !field?.options || Object.values(field.options).some((value) => value !== false)
    }

    const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString() : '—')

    const totalPatrols = jobs.length
    const completedCount = jobs.filter((j) => j.status === 'COMPLETED').length
    const siteNames = Array.from(new Set(jobs.map((j) => j.route.site.name)))
    const operatorNames = Array.from(
      new Set(jobs.map((j) => j.operator.fullName)),
    )
    const totalCheckpoints = jobs.reduce(
      (sum, j) => sum + j.route.checkpoints.length,
      0,
    )
    const totalIssues = jobs.reduce(
      (sum, j) => sum + j.results.filter((r) => !r.allClear).length,
      0,
    )
    const totalResults = jobs.reduce((sum, j) => sum + j.results.length, 0)
    const clearResults = totalResults - totalIssues

    // When every included patrol is from the same site, the "by site"
    // breakdown is redundant (there's only one row) -- swap it for a
    // by-route breakdown instead, which is actually useful at that scope.
    const singleSite = siteNames.length === 1

    // per-site rollup: patrols, checkpoints, and issues for each site
    const bySite = siteNames.map((siteName) => {
      const siteJobs = jobs.filter((j) => j.route.site.name === siteName)
      return {
        siteName,
        patrols: siteJobs.length,
        checkpoints: siteJobs.reduce((s, j) => s + j.route.checkpoints.length, 0),
        issues: siteJobs.reduce(
          (s, j) => s + j.results.filter((r) => !r.allClear).length,
          0,
        ),
      }
    })

    // per-route rollup, used instead of bySite when singleSite is true
    const routeNames = Array.from(new Set(jobs.map((j) => j.route.name)))
    const byRoute = routeNames.map((routeName) => {
      const routeJobs = jobs.filter((j) => j.route.name === routeName)
      return {
        routeName,
        patrols: routeJobs.length,
        checkpoints: routeJobs.reduce((s, j) => s + j.route.checkpoints.length, 0),
        issues: routeJobs.reduce(
          (s, j) => s + j.results.filter((r) => !r.allClear).length,
          0,
        ),
      }
    })

    // per-operator rollup, shown alongside the route breakdown when
    // singleSite is true -- who patrolled this site and how it went
    const byOperator = operatorNames.map((name) => {
      const opJobs = jobs.filter((j) => j.operator.fullName === name)
      return {
        name,
        patrols: opJobs.length,
        issues: opJobs.reduce(
          (s, j) => s + j.results.filter((r) => !r.allClear).length,
          0,
        ),
      }
    })

    // issues-over-time trend, bucketed by day using each checkpoint's own
    // completedAt (finer-grained than the job's overall completedAt, so a
    // long patrol spanning midnight still lands its checkpoints correctly)
    const dayMap = new Map<string, { issues: number; total: number }>()
    for (const j of jobs) {
      for (const r of j.results) {
        const day = new Date(r.completedAt).toISOString().slice(0, 10)
        const entry = dayMap.get(day) ?? { issues: 0, total: 0 }
        entry.total += 1
        if (!r.allClear) entry.issues += 1
        dayMap.set(day, entry)
      }
    }
    const trendData = Array.from(dayMap.keys())
      .sort()
      .map((date) => ({ date, ...dayMap.get(date)! }))

    // shift breakdown -- night (8pm-8am) vs morning/day (8am-8pm), by each
    // checkpoint's own completedAt hour
    const shiftTally = {
      night: { issues: 0, total: 0 },
      morning: { issues: 0, total: 0 },
    }
    for (const j of jobs) {
      for (const r of j.results) {
        const hour = new Date(r.completedAt).getHours()
        const bucket = hour >= 20 || hour < 8 ? shiftTally.night : shiftTally.morning
        bucket.total += 1
        if (!r.allClear) bucket.issues += 1
      }
    }

    const earliestDate = jobs.reduce<Date | null>((min, j) => {
      const at = j.startedAt ? new Date(j.startedAt) : null
      if (!at) return min
      return !min || at < min ? at : min
    }, null)
    const latestDate = jobs.reduce<Date | null>((max, j) => {
      const at = j.completedAt ? new Date(j.completedAt) : null
      if (!at) return max
      return !max || at > max ? at : max
    }, null)

    const jobRows = [...jobs]
      .sort((a, b) => {
        const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
        const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
        return bt - at
      })
      .map((j) => {
        const issues = j.results.filter((r) => !r.allClear).length
        return `
          <tr>
            ${!singleSite && isItemOn('jobsTable', 'siteColumn') ? `<td>${esc(j.route.site.name)}</td>` : ''}
            ${isItemOn('jobsTable', 'routeColumn') ? `<td>${esc(j.route.name)}</td>` : ''}
            ${isItemOn('jobsTable', 'operatorColumn') ? `<td>${esc(j.operator.fullName)}</td>` : ''}
            ${isItemOn('jobsTable', 'completedColumn') ? `<td>${fmt(j.completedAt)}</td>` : ''}
            ${isItemOn('jobsTable', 'checkpointsColumn') ? `<td>${j.route.checkpoints.length}</td>` : ''}
            ${isItemOn('jobsTable', 'issuesColumn') ? `<td class="${issues > 0 ? 'issue-cell' : ''}">${issues}</td>` : ''}
          </tr>`
      })
      .join('')

    const siteRows = bySite
      .map(
        (s) => `
          <tr>
            ${isItemOn('routeTable', 'nameColumn') ? `<td>${esc(s.siteName)}</td>` : ''}
            ${isItemOn('routeTable', 'patrolsColumn') ? `<td>${s.patrols}</td>` : ''}
            ${isItemOn('routeTable', 'checkpointsColumn') ? `<td>${s.checkpoints}</td>` : ''}
            ${isItemOn('routeTable', 'issuesColumn') ? `<td class="${s.issues > 0 ? 'issue-cell' : ''}">${s.issues}</td>` : ''}
          </tr>`,
      )
      .join('')

    const routeRows = byRoute
      .map(
        (r) => `
          <tr>
            ${isItemOn('routeTable', 'nameColumn') ? `<td>${esc(r.routeName)}</td>` : ''}
            ${isItemOn('routeTable', 'patrolsColumn') ? `<td>${r.patrols}</td>` : ''}
            ${isItemOn('routeTable', 'checkpointsColumn') ? `<td>${r.checkpoints}</td>` : ''}
            ${isItemOn('routeTable', 'issuesColumn') ? `<td class="${r.issues > 0 ? 'issue-cell' : ''}">${r.issues}</td>` : ''}
          </tr>`,
      )
      .join('')

    const operatorRows = byOperator
      .map(
        (o) => `
          <tr>
            ${isItemOn('operatorTable', 'operatorColumn') ? `<td>${esc(o.name)}</td>` : ''}
            ${isItemOn('operatorTable', 'patrolsColumn') ? `<td>${o.patrols}</td>` : ''}
            ${isItemOn('operatorTable', 'issuesColumn') ? `<td class="${o.issues > 0 ? 'issue-cell' : ''}">${o.issues}</td>` : ''}
          </tr>`,
      )
      .join('')

    let logoTag = ''
    if (isOn('header') && isItemOn('header', 'organizationLogo')) {
      try {
        const logoB64 = fs
          .readFileSync(join(process.cwd(), 'assets', 'logo.png'))
          .toString('base64')
        logoTag = `<img class="logo" src="data:image/png;base64,${logoB64}" />`
      } catch {
        logoTag = ''
      }
    }

    const donutSvg = this.donutChart(clearResults, totalIssues)
    const barSvg = singleSite
      ? this.issuesBarChart(byRoute.map((r) => ({ label: r.routeName, issues: r.issues })))
      : this.issuesBarChart(bySite.map((s) => ({ label: s.siteName, issues: s.issues })))
    const trendSvg = this.trendLineChart(trendData)
    const shiftSvg = this.issuesBarChart([
      { label: 'Night Shift', issues: shiftTally.night.issues },
      { label: 'Morning Shift', issues: shiftTally.morning.issues },
    ])
    const shiftRate = (b: { issues: number; total: number }) =>
      b.total ? Math.round((b.issues / b.total) * 100) : 0

    // ---- Assemble the body from the summary report builder's layout: one
    // renderer per component, placed in the builder's rows with its saved
    // width/height. Real data only -- everything below comes from `jobs`.
    const headerHasTitle = isItemOn('header', 'reportTitle')
    const headerHasGeneratedTime = isItemOn('header', 'generatedTime')
    const showSitesMeta =
      isItemOn('header', 'sitesCovered') && (!singleSite || !headerHasTitle)
    const headerHasMetadata =
      showSitesMeta ||
      isItemOn('header', 'operatorsCovered') ||
      (!!earliestDate && !!latestDate && isItemOn('header', 'reportPeriod'))
    const headerLogoOnly = !!logoTag && !headerHasTitle && !headerHasGeneratedTime && !headerHasMetadata
    const headerHtml = `<div class="header${headerLogoOnly ? ' logo-only' : ''}">
          ${logoTag}
          ${headerHasTitle ? `<h1>${singleSite && isItemOn('header', 'sitesCovered') ? `${esc(siteNames[0])} — Patrol Summary` : 'Patrol Summary Report'}</h1>` : ''}
          ${isItemOn('header', 'generatedTime') ? `<div class="sub">Virtual Patrol · Generated ${new Date().toLocaleString()}</div>` : ''}
          <div class="hmeta">
            ${showSitesMeta ? `<div class="meta-line">Sites: ${esc(siteNames.join(', '))}</div>` : ''}
            ${isItemOn('header', 'operatorsCovered') ? `<div class="meta-line">Operators: ${esc(operatorNames.join(', '))}</div>` : ''}
            ${earliestDate && latestDate && isItemOn('header', 'reportPeriod') ? `<div class="meta-line">Period: ${earliestDate.toLocaleDateString()} – ${latestDate.toLocaleDateString()}</div>` : ''}
          </div>
        </div>`

    const statCardItems = [
      isItemOn('statGrid', 'patrols') ? `<div class="stat-card"><div class="num">${totalPatrols}</div><div class="lbl">Patrols</div></div>` : '',
      isItemOn('statGrid', 'completed') ? `<div class="stat-card"><div class="num">${completedCount}</div><div class="lbl">Completed</div></div>` : '',
      isItemOn('statGrid', 'checkpoints') ? `<div class="stat-card"><div class="num">${totalCheckpoints}</div><div class="lbl">Checkpoints</div></div>` : '',
      isItemOn('statGrid', 'issuesFlagged') ? `<div class="stat-card issues"><div class="num">${totalIssues}</div><div class="lbl">Issues Flagged</div></div>` : '',
    ].filter(Boolean)
    const statCards = statCardItems.join('')
    const statGridHtml = statCards
      ? `<div class="stat-grid" style="grid-template-columns:repeat(${statCardItems.length},minmax(0,1fr))">${statCards}</div>`
      : ''

    const outcomeLegendItems = [
      isItemOn('outcomesChart', 'clearLegend') ? `<span><span class="dot" style="background:#2e9e6b"></span>Clear (${clearResults})</span>` : '',
      isItemOn('outcomesChart', 'issuesLegend') ? `<span><span class="dot" style="background:#cf5b5b"></span>Issues (${totalIssues})</span>` : '',
    ].filter(Boolean).join('')
    const outcomesInner = `${isItemOn('outcomesChart', 'chartTitle') ? '<h3>Checkpoint Outcomes</h3>' : ''}${isItemOn('outcomesChart', 'chartVisual') ? donutSvg : ''}${outcomeLegendItems ? `<div class="chart-legend">${outcomeLegendItems}</div>` : ''}`
    const outcomesHtml = outcomesInner ? `<div class="chart-card donut">${outcomesInner}</div>` : ''
    const issuesInner = `${isItemOn('issuesChart', 'chartTitle') ? `<h3>Issues by ${singleSite ? 'Route' : 'Site'}</h3>` : ''}${isItemOn('issuesChart', 'chartVisual') ? barSvg : ''}`
    const issuesHtml = issuesInner ? `<div class="chart-card">${issuesInner}</div>` : ''
    const trendInner = `${isItemOn('trendChart', 'chartTitle') ? '<h3>Issues Over Time</h3>' : ''}${isItemOn('trendChart', 'chartVisual') ? trendSvg : ''}`
    const trendHtml = trendInner ? `<div class="chart-card">${trendInner}</div>` : ''
    const shiftStats = [
      isItemOn('shiftChart', 'nightShiftStats') ? `<span><strong>Night (8PM–8AM):</strong> ${shiftTally.night.issues} of ${shiftTally.night.total} checkpoints (${shiftRate(shiftTally.night)}%)</span>` : '',
      isItemOn('shiftChart', 'morningShiftStats') ? `<span><strong>Morning (8AM–8PM):</strong> ${shiftTally.morning.issues} of ${shiftTally.morning.total} checkpoints (${shiftRate(shiftTally.morning)}%)</span>` : '',
    ].filter(Boolean).join('')
    const shiftInner = `${isItemOn('shiftChart', 'chartTitle') ? '<h3>Issues by Shift</h3>' : ''}${isItemOn('shiftChart', 'chartVisual') ? shiftSvg : ''}${shiftStats ? `<div class="shift-stats">${shiftStats}</div>` : ''}`
    const shiftHtml = shiftInner ? `<div class="chart-card">${shiftInner}</div>` : ''

    const routeTableHeaders = [
      isItemOn('routeTable', 'nameColumn') ? `<th>${singleSite ? 'Route' : 'Site'}</th>` : '',
      isItemOn('routeTable', 'patrolsColumn') ? '<th>Patrols</th>' : '',
      isItemOn('routeTable', 'checkpointsColumn') ? '<th>Checkpoints</th>' : '',
      isItemOn('routeTable', 'issuesColumn') ? '<th>Issues</th>' : '',
    ].join('')
    const routeTableTitle = singleSite ? 'By Route' : 'By Site'
    const routeTableHtml = hasVisibleItems('routeTable')
      ? `<div>${isItemOn('routeTable', 'tableTitle') ? `<h2>${routeTableTitle}</h2>` : ''}<table><thead><tr>${routeTableHeaders}</tr></thead><tbody>${singleSite ? routeRows : siteRows}</tbody></table></div>`
      : ''

    const operatorTableHeaders = [
      isItemOn('operatorTable', 'operatorColumn') ? '<th>Operator</th>' : '',
      isItemOn('operatorTable', 'patrolsColumn') ? '<th>Patrols</th>' : '',
      isItemOn('operatorTable', 'issuesColumn') ? '<th>Issues</th>' : '',
    ].join('')
    const operatorTableHtml = hasVisibleItems('operatorTable')
      ? `<div>${isItemOn('operatorTable', 'tableTitle') ? '<h2>By Operator</h2>' : ''}<table><thead><tr>${operatorTableHeaders}</tr></thead><tbody>${operatorRows}</tbody></table></div>`
      : ''

    const jobsTableHeaders = [
      !singleSite && isItemOn('jobsTable', 'siteColumn') ? '<th>Site</th>' : '',
      isItemOn('jobsTable', 'routeColumn') ? '<th>Route</th>' : '',
      isItemOn('jobsTable', 'operatorColumn') ? '<th>Operator</th>' : '',
      isItemOn('jobsTable', 'completedColumn') ? '<th>Completed</th>' : '',
      isItemOn('jobsTable', 'checkpointsColumn') ? '<th>Checkpoints</th>' : '',
      isItemOn('jobsTable', 'issuesColumn') ? '<th>Issues</th>' : '',
    ].join('')
    const jobsTableHtml = hasVisibleItems('jobsTable')
      ? `<div>${isItemOn('jobsTable', 'tableTitle') ? '<h2>Included Patrols</h2>' : ''}<table><thead><tr>${jobsTableHeaders}</tr></thead><tbody>${jobRows}</tbody></table></div>`
      : ''

    const componentHtml: Record<string, string> = {
      header: hasVisibleItems('header') ? headerHtml : '',
      statGrid: statGridHtml,
      outcomesChart: outcomesHtml,
      issuesChart: issuesHtml,
      trendChart: trendHtml,
      shiftChart: shiftHtml,
      routeTable: routeTableHtml,
      operatorTable: operatorTableHtml,
      jobsTable: jobsTableHtml,
    }

    const bodyHtml = groupIntoRows(layout)
      .map((row) =>
        renderRow(row, (f) =>
          f.key.startsWith('block-') ? renderBlock(f) : (componentHtml[f.key] ?? ''),
        ),
      )
      .join('\n')

    return `
      <html><head><style>
        * { font-family: Arial, sans-serif; box-sizing: border-box; }
        body { margin: 0; padding: 32px; color: #011f4b; }
        ${LAYOUT_CSS}
        .header { position: relative; border-bottom: 3px solid #011f4b; padding-bottom: 16px; }
        .header.logo-only { min-height: 70px; }
        .header h1 { margin: 0 0 4px; font-size: 24px; }
        .header .sub { color: #5f7488; font-size: 13px; }
        .header .logo { position: absolute; top: 0; right: 0; height: 54px; width: auto; }
        .hmeta { margin-top: 10px; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .stat-card { border: 1px solid #d8e2ec; border-radius: 10px; padding: 14px; text-align: center; }
        .stat-card .num { font-size: 22px; font-weight: bold; color: #011f4b; }
        .stat-card .lbl { font-size: 11px; color: #5f7488; text-transform: uppercase; margin-top: 4px; }
        .stat-card.issues .num { color: ${totalIssues > 0 ? '#cf5b5b' : '#2e9e6b'}; }
        h2 { font-size: 15px; margin: 0 0 10px; break-after: avoid; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; background: #f4f7fa; padding: 8px 10px; border-bottom: 1px solid #d8e2ec; font-size: 11px; text-transform: uppercase; color: #5f7488; }
        td { padding: 8px 10px; border-bottom: 1px solid #eef2f6; }
        .issue-cell { color: #cf5b5b; font-weight: bold; }
        .meta-line { font-size: 12px; color: #5f7488; margin-bottom: 4px; }
        .chart-card { border: 1px solid #d8e2ec; border-radius: 10px; padding: 16px; }
        .chart-card svg { max-width: 100%; height: auto; }
        .chart-card h3 { margin: 0 0 12px; font-size: 12px; color: #5f7488; text-transform: uppercase; letter-spacing: 0.4px; }
        .chart-card.donut { display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .chart-legend { display: flex; gap: 16px; margin-top: 12px; font-size: 11px; color: #5f7488; }
        .chart-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .chart-legend .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
        .shift-stats { display: flex; gap: 24px; margin-top: 10px; font-size: 11.5px; color: #5f7488; }
        .shift-stats strong { color: #011f4b; }
      </style></head><body>
        ${bodyHtml}
      </body></html>`
  }

  private async renderHtmlToPdf(browser: Browser, html: string) {
    const page = await browser.newPage()
    try {
      await page.setContent(html, { waitUntil: 'load' })
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16px', bottom: '16px', left: '16px', right: '16px' },
      })
      return Buffer.from(pdf)
    } finally {
      await page.close()
    }
  }

  private async fetchJobForReport(
    user: { id: string; role: string },
    jobId: string,
  ) {
    const job = await this.prisma.patrolJob.findUnique({
      where: { id: jobId },
      include: {
        operator: { select: { fullName: true, username: true } },
        route: {
          include: {
            site: true,
            checkpoints: {
              orderBy: { orderIndex: 'asc' },
              include: {
                camera: true,
                checklistTemplate: { include: { items: true } },
              },
            },
          },
        },
        results: true,
      },
    })

    if (!job) {
      throw new NotFoundException('Patrol job not found')
    }
    if (user.role === 'OPERATOR' && job.operatorId !== user.id) {
      throw new ForbiddenException('Not your patrol job')
    }
    if (user.role === 'VIEWER') {
      const siteIds = await this.assignedSiteIds(user.id)
      if (!siteIds.includes(job.route.siteId)) {
        throw new ForbiddenException('This site is not assigned to you')
      }
    }

    return job
  }

  private buildReportHtml(
    job: Awaited<ReturnType<PatrolService['fetchJobForReport']>>,
    layout: ReportTemplateField[],
  ) {
    const resultByCp = new Map(job.results.map((r) => [r.checkpointId, r]))
    const issues = job.results.filter((r) => !r.allClear)
    const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString() : '—')

    // Components that belong to a single checkpoint. Everything else renders
    // once. Rows made of per-checkpoint components form a "band" that the
    // report repeats for every real checkpoint on the route.
    const CP_KEYS = ['checkpointCard', 'evidence', 'checklist', 'issueStatus']
    const isCpRow = (row: ReportTemplateField[]) =>
      row.some((f) => CP_KEYS.includes(f.key))

    const optionEnabled = (field: ReportTemplateField, key: string) =>
      field.options?.[key] !== false

    // ---- once-per-report component renderers ----
    const headerHtml = (field: ReportTemplateField) => {
      const content: string[] = []
      let includedLogo = false
      const includeTitle = optionEnabled(field, 'reportTitle')
      const includeGeneratedTime = optionEnabled(field, 'generatedTime')
      if (optionEnabled(field, 'organizationLogo')) {
        try {
          const logoB64 = fs
            .readFileSync(join(process.cwd(), 'assets', 'logo.png'))
            .toString('base64')
          content.push(`<img class="logo" src="data:image/png;base64,${logoB64}" />`)
          includedLogo = true
        } catch {
          // A missing logo should not prevent the rest of the report rendering.
        }
      }
      if (includeTitle) {
        content.push('<h1>Security Patrol Report</h1>')
      }
      if (includeGeneratedTime) {
        content.push(`<div class="sub">Virtual Patrol · Generated ${new Date().toLocaleString()}</div>`)
      }
      if (content.length === 0) return ''
      const logoOnly = includedLogo && !includeTitle && !includeGeneratedTime
      return `<div class="header${logoOnly ? ' logo-only' : ''}">${content.join('')}</div>`
    }

    const patrolSummaryHtml = (field: ReportTemplateField) => {
      const meta: string[] = []
      if (optionEnabled(field, 'site')) {
        meta.push(`<div><span class="label">Site</span><br>${esc(job.route.site.name)}</div>`)
      }
      if (optionEnabled(field, 'route')) {
        meta.push(`<div><span class="label">Route</span><br>${esc(job.route.name)}</div>`)
      }
      if (optionEnabled(field, 'operator')) {
        meta.push(`<div><span class="label">Operator</span><br>${esc(job.operator.fullName)}</div>`)
      }
      if (optionEnabled(field, 'status')) {
        meta.push(`<div><span class="label">Status</span><br>${esc(job.status)}</div>`)
      }
      if (optionEnabled(field, 'startTime')) {
        meta.push(`<div><span class="label">Start Time</span><br>${fmt(job.startedAt)}</div>`)
      }
      if (optionEnabled(field, 'endTime')) {
        meta.push(`<div><span class="label">End Time</span><br>${fmt(job.completedAt)}</div>`)
      }
      if (optionEnabled(field, 'checkpointCount')) {
        meta.push(`<div><span class="label">Checkpoints</span><br>${job.route.checkpoints.length}</div>`)
      }
      const metaHtml = meta.length ? `<div class="meta">${meta.join('')}</div>` : ''
      const issuesHtml = optionEnabled(field, 'issuesBanner')
        ? `<div class="issues-banner">${issues.length ? `⚠ ${issues.length} issue(s) flagged during this patrol` : '✓ All checkpoints cleared — no issues flagged'}</div>`
        : ''
      if (!metaHtml && !issuesHtml) return ''
      return `<div>${metaHtml}${issuesHtml}</div>`
    }

    // ---- per-checkpoint components ----
    const checkpointHtml = (
      f: ReportTemplateField,
      cp: (typeof job.route.checkpoints)[number],
      i: number,
    ) => {
      const result = resultByCp.get(cp.id)
      const flagged = !!result && !result.allClear
      switch (f.key) {
        case 'checkpointCard': {
          const pieces: string[] = []
          if (optionEnabled(f, 'checkpointNumber')) {
            pieces.push(`<span class="cp-num">${i + 1}</span>`)
          }
          if (optionEnabled(f, 'cameraName') || optionEnabled(f, 'location')) {
            pieces.push(`<div>
              ${optionEnabled(f, 'cameraName') ? `<strong>${esc(cp.camera.name)}</strong>` : ''}
              ${optionEnabled(f, 'location') ? `<span class="cp-loc">${esc(cp.camera.location || '')}</span>` : ''}
            </div>`)
          }
          if (optionEnabled(f, 'resultStatus')) {
            pieces.push(`<span class="cp-status ${flagged ? 's-fail' : 's-ok'}">${flagged ? 'ISSUE FLAGGED' : 'ALL CLEAR'}</span>`)
          }
          return pieces.length ? `<div class="cp-head">${pieces.join('')}</div>` : ''
        }
        case 'evidence': {
          if (!optionEnabled(f, 'screenshot')) return ''
          let imgTag = '<div class="noimg">No screenshot</div>'
          if (result?.screenshotPath) {
            
            const UPLOADS_DIR = process.env.VERCEL
            ? join("/tmp", "uploads")
            : join(process.cwd(), "uploads");
            
            const filePath = join(UPLOADS_DIR, result.screenshotPath);
            try {
              const b64 = fs.readFileSync(filePath).toString('base64')
              imgTag = `<img src="data:image/png;base64,${b64}" />`
            } catch {
              imgTag = '<div class="noimg">Screenshot unavailable</div>'
            }
          }
          return `<div class="cp-shot">${imgTag}</div>`
        }
        case 'checklist': {
          const showName = optionEnabled(f, 'checklistName')
          const showResults = optionEnabled(f, 'checklistResults')
          if (!showName && !showResults) return ''
          const state = (result?.checklistState as any[]) || []
          const items =
            state.length > 0
              ? state
                  .map(
                    (st) =>
                      `<li class="${st.checked ? 'ok' : 'fail'}">${
                        st.checked ? '✓' : '✗'
                      } ${esc(st.label)}</li>`,
                  )
                  .join('')
              : cp.checklistTemplate.items
                  .map((it) => `<li>• ${esc(it.label)}</li>`)
                  .join('')
          return `<div class="cp-check">
                ${showName ? `<p class="cp-cl-name">${esc(cp.checklistTemplate.name)}</p>` : ''}
                ${showResults ? `<ul>${items}</ul>` : ''}
              </div>`
        }
        case 'issueStatus': {
          const showIssue = optionEnabled(f, 'issueFlag')
          const showComment = optionEnabled(f, 'operatorComment') && !!result?.comment
          if (!showIssue && !showComment) return ''
          return `<div class="cp-issue ${flagged ? 'bad' : 'ok'}">
                ${showIssue ? `<strong>${flagged ? '⚠ Issue flagged' : '✓ No issue flagged'}</strong>` : ''}
                ${showComment ? `<div class="cp-comment"><strong>Comment:</strong> ${esc(result?.comment)}</div>` : ''}
              </div>`
        }
        default:
          return ''
      }
    }

    const onceHtml = (f: ReportTemplateField) =>
      f.key === 'header'
        ? headerHtml(f)
        : f.key === 'patrolSummary'
          ? patrolSummaryHtml(f)
          : ''

    // ---- assemble in the builder's order: rows, bands repeated per checkpoint ----
    // Checkpoint evidence and checklist are always paired side-by-side in the PDF,
    // even if a saved builder layout put those two components on separate rows.
    // The generated PDF groups no more than two checkpoint cards per page.
    const rows = groupIntoRows(layout)
    const parts: string[] = []
    let checkpointPageCounter = 0
    const mediaKeys = ['evidence', 'checklist']

    for (let r = 0; r < rows.length; ) {
      if (!isCpRow(rows[r])) {
        parts.push(renderRow(rows[r], onceHtml))
        r++
        continue
      }

      let end = r
      while (end < rows.length && isCpRow(rows[end])) end++
      const band = rows.slice(r, end)
      const checkpointFields = band.flat().filter((f) => CP_KEYS.includes(f.key))
      const evidenceField = checkpointFields.find((f) => f.key === 'evidence')
      const checklistField = checkpointFields.find((f) => f.key === 'checklist')
      const checkpointCards: string[] = []

      job.route.checkpoints.forEach((cp, i) => {
        const res = resultByCp.get(cp.id)
        const flagged = !!res && !res.allClear
        let mediaRowRendered = false

        const inner = band
          .map((row) => {
            const cpItems = row.filter((f) => CP_KEYS.includes(f.key))
            if (!cpItems.length) return ''

            const rowHasMedia = cpItems.some((f) => mediaKeys.includes(f.key))
            if (!rowHasMedia) {
              const html = renderRow(cpItems, (f) => checkpointHtml(f, cp, i))
              if (!html) return ''
              const headOnly = cpItems.every((f) => f.key === 'checkpointCard')
              return `<div class="${headOnly ? 'cp-headrow' : 'cp-pad'}">${html}</div>`
            }

            // Render the evidence/checklist pair once, at the first position either
            // component appears in the saved layout. Any other components that share
            // that row keep their normal rendering.
            const otherItems = cpItems.filter((f) => !mediaKeys.includes(f.key))
            const otherHtml = otherItems.length
              ? renderRow(otherItems, (f) => checkpointHtml(f, cp, i))
              : ''
            const otherWrapperClass =
              otherItems.length > 0 && otherItems.every((f) => f.key === 'checkpointCard')
                ? 'cp-headrow'
                : 'cp-pad'
            if (mediaRowRendered) {
              return otherHtml
                ? `<div class="${otherWrapperClass}">${otherHtml}</div>`
                : ''
            }
            mediaRowRendered = true

            const pairedFields = [
              ...(evidenceField
                ? [{ ...evidenceField, width: checklistField ? 40 : 100 }]
                : []),
              ...(checklistField
                ? [{ ...checklistField, width: evidenceField ? 60 : 100 }]
                : []),
            ]
            const mediaHtml = renderRow(pairedFields, (f) => checkpointHtml(f, cp, i))
              .replace('class="lr"', 'class="lr cp-media-row"')
            return `${otherHtml ? `<div class="${otherWrapperClass}">${otherHtml}</div>` : ''}${mediaHtml ? `<div class="cp-pad cp-media-pad">${mediaHtml}</div>` : ''}`
          })
          .join('')

        if (inner) checkpointCards.push(`<div class="cp ${flagged ? 'flagged' : ''}">${inner}</div>`)
      })

      // Each wrapper contains at most two screenshot/checklist checkpoint cards.
      // Explicitly start later wrappers on new PDF pages to enforce the limit.
      for (let i = 0; i < checkpointCards.length; i += 2) {
        const pageClass = checkpointPageCounter++ === 0 ? 'cp-page' : 'cp-page cp-page-next'
        parts.push(`<div class="${pageClass}">${checkpointCards.slice(i, i + 2).join('\n')}</div>`)
      }
      r = end
    }

    return `
      <html><head><style>
        * { font-family: Arial, sans-serif; box-sizing: border-box; }
        body { margin: 0; padding: 32px; color: #011f4b; }
        ${LAYOUT_CSS}
        .header { position: relative; border-bottom: 3px solid #011f4b; padding-bottom: 16px; }
        .header h1 { margin: 0 0 4px; font-size: 24px; }
        .header .sub { color: #5f7488; font-size: 13px; }
        .header .logo { position: absolute; top: 0; right: 0; height: 54px; width: auto; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 0 0 16px; font-size: 13px; }
        .meta div { padding: 6px 0; border-bottom: 1px solid #e5e5e5; }
        .meta .label { color: #5f7488; font-size: 11px; text-transform: uppercase; }
        .issues-banner { background: ${issues.length ? '#fdeaea' : '#eafaf1'}; color: ${issues.length ? '#cf5b5b' : '#2e9e6b'}; padding: 12px 16px; border-radius: 8px; font-weight: bold; }
        .cp-page { break-inside: avoid; page-break-inside: avoid; }
        .cp-page-next { break-before: page; page-break-before: always; }
        .cp { border: 1px solid #d8e2ec; border-radius: 10px; margin-bottom: 16px; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
        .cp.flagged { border-color: #cf5b5b; }
        .cp .lr { margin-bottom: 0; }
        .cp-pad { padding: 16px; min-width: 0; }
        .cp-pad + .cp-pad { padding-top: 0; }
        .cp-headrow .lr { margin: 0; }
        .cp-headrow .li { padding: 0; }
        .cp-media-row { align-items: stretch; }
        .cp-media-row .li { min-width: 0; }
        .cp-media-row .li-in { min-height: 100%; }
        .cp-shot { min-width: 0; display: flex; align-items: flex-start; }
        .cp-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #f4f7fa; border-bottom: 1px solid #d8e2ec; }
        .cp-num { width: 26px; height: 26px; background: #011f4b; color: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; }
        .cp-head strong { display: block; font-size: 14px; }
        .cp-loc { font-size: 11px; color: #5f7488; }
        .cp-status { margin-left: auto; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 12px; }
        .s-ok { background: #eafaf1; color: #2e9e6b; }
        .s-fail { background: #fdeaea; color: #cf5b5b; }
        .cp-shot img { display: block; width: 100%; max-height: 280px; object-fit: contain; object-position: top center; border-radius: 8px; border: 1px solid #d8e2ec; }
        .noimg { width: 100%; min-height: 146px; background: #f4f7fa; border-radius: 8px; display: flex; align-items: center; justify-content: center; color:#5f7488; font-size: 12px; }
        .cp-cl-name { font-weight: bold; margin: 0 0 8px; font-size: 13px; }
        .cp-check ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7; }
        .cp-check li.ok { color: #2e9e6b; }
        .cp-check li.fail { color: #cf5b5b; }
        .cp-issue { font-size: 12px; padding: 8px 12px; border-radius: 6px; }
        .cp-issue.ok { background: #eafaf1; color: #2e9e6b; }
        .cp-issue.bad { background: #fdeaea; color: #cf5b5b; }
        .cp-comment { margin-top: 6px; color: #011f4b; }
      </style></head><body>
        ${parts.join('\n')}
      </body></html>`
  }

  private async assignedSiteIds(userId: string) {
    const assignments = await this.prisma.operatorSiteAssignment.findMany({
      where: { userId },
      select: { siteId: true },
    })
    return assignments.map((a) => a.siteId)
  }

  private async assertAssigned(operatorId: string, siteId: string) {
    const assignment = await this.prisma.operatorSiteAssignment.findFirst({
      where: {
        userId: operatorId,
        siteId,
      },
    })

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this site')
    }
  }
}