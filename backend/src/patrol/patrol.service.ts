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
import puppeteer, { Browser } from 'puppeteer'
import { PDFDocument } from 'pdf-lib'
import { ZipArchive } from 'archiver'
import { ReportTemplateService } from '../report-template/report-template.service'
import type { ReportTemplateField } from '../report-template/report-fields'

@Injectable()
export class PatrolService {
  constructor(
    private prisma: PrismaService,
    private reportTemplateService: ReportTemplateService,
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
        route: { include: { checkpoints: true } },
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

    return this.prisma.$transaction(async (tx) => {
      const completedJob = await tx.patrolJob.update({
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

      return completedJob
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
    const layout = await this.reportTemplateService.getFieldOrder()
    const html = this.buildReportHtml(job, layout)

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
    const layout = await this.reportTemplateService.getFieldOrder()

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    try {
      const reports: { jobId: string; fileName: string; pdf: Buffer }[] = []

      for (const jobId of uniqueIds) {
        const job = await this.fetchJobForReport(user, jobId)
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
  ) {
    const uniqueIds = Array.from(new Set(jobIds))
    const jobs = await Promise.all(
      uniqueIds.map((id) => this.fetchJobForReport(user, id)),
    )

    if (jobs.length === 0) {
      throw new NotFoundException('No reports found for the given jobs')
    }

    const html = this.buildSummaryHtml(jobs)

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
  ) {
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
            ${singleSite ? '' : `<td>${j.route.site.name}</td>`}
            <td>${j.route.name}</td>
            <td>${j.operator.fullName}</td>
            <td>${fmt(j.completedAt)}</td>
            <td>${j.route.checkpoints.length}</td>
            <td class="${issues > 0 ? 'issue-cell' : ''}">${issues}</td>
          </tr>`
      })
      .join('')

    const siteRows = bySite
      .map(
        (s) => `
          <tr>
            <td>${s.siteName}</td>
            <td>${s.patrols}</td>
            <td>${s.checkpoints}</td>
            <td class="${s.issues > 0 ? 'issue-cell' : ''}">${s.issues}</td>
          </tr>`,
      )
      .join('')

    const routeRows = byRoute
      .map(
        (r) => `
          <tr>
            <td>${r.routeName}</td>
            <td>${r.patrols}</td>
            <td>${r.checkpoints}</td>
            <td class="${r.issues > 0 ? 'issue-cell' : ''}">${r.issues}</td>
          </tr>`,
      )
      .join('')

    const operatorRows = byOperator
      .map(
        (o) => `
          <tr>
            <td>${o.name}</td>
            <td>${o.patrols}</td>
            <td class="${o.issues > 0 ? 'issue-cell' : ''}">${o.issues}</td>
          </tr>`,
      )
      .join('')

    let logoTag = ''
    try {
      const logoB64 = fs
        .readFileSync(join(process.cwd(), 'assets', 'logo.png'))
        .toString('base64')
      logoTag = `<img class="logo" src="data:image/png;base64,${logoB64}" />`
    } catch {
      logoTag = ''
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

    return `
      <html><head><style>
        * { font-family: Arial, sans-serif; box-sizing: border-box; }
        body { margin: 0; padding: 32px; color: #011f4b; }
        .header { position: relative; border-bottom: 3px solid #011f4b; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { margin: 0 0 4px; font-size: 24px; }
        .header .sub { color: #5f7488; font-size: 13px; }
        .header .logo { position: absolute; top: 0; right: 0; height: 54px; width: auto; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0 28px; }
        .stat-card { border: 1px solid #d8e2ec; border-radius: 10px; padding: 14px; text-align: center; }
        .stat-card .num { font-size: 22px; font-weight: bold; color: #011f4b; }
        .stat-card .lbl { font-size: 11px; color: #5f7488; text-transform: uppercase; margin-top: 4px; }
        .stat-card.issues .num { color: ${totalIssues > 0 ? '#cf5b5b' : '#2e9e6b'}; }
        h2 { font-size: 15px; margin: 28px 0 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; background: #f4f7fa; padding: 8px 10px; border-bottom: 1px solid #d8e2ec; font-size: 11px; text-transform: uppercase; color: #5f7488; }
        td { padding: 8px 10px; border-bottom: 1px solid #eef2f6; }
        .issue-cell { color: #cf5b5b; font-weight: bold; }
        .meta-line { font-size: 12px; color: #5f7488; margin-bottom: 4px; }
        .charts-row { display: flex; gap: 16px; margin: 20px 0 28px; }
        .chart-card { border: 1px solid #d8e2ec; border-radius: 10px; padding: 16px; }
        .chart-card h3 { margin: 0 0 12px; font-size: 12px; color: #5f7488; text-transform: uppercase; letter-spacing: 0.4px; }
        .chart-card.donut { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 0 0 200px; }
        .chart-card.bars { flex: 1; }
        .chart-legend { display: flex; gap: 16px; margin-top: 12px; font-size: 11px; color: #5f7488; }
        .chart-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .chart-legend .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
        .chart-card.full { flex: 1 1 100%; }
        .shift-stats { display: flex; gap: 24px; margin-top: 10px; font-size: 11.5px; color: #5f7488; }
        .shift-stats strong { color: #011f4b; }
      </style></head><body>
        <div class="header">
          ${logoTag}
          <h1>${singleSite ? `${siteNames[0]} — Patrol Summary` : 'Patrol Summary Report'}</h1>
          <div class="sub">Virtual Patrol · Generated ${new Date().toLocaleString()}</div>
        </div>

        ${singleSite ? '' : `<div class="meta-line">Sites: ${siteNames.join(', ')}</div>`}
        <div class="meta-line">Operators: ${operatorNames.join(', ')}</div>
        ${
          earliestDate && latestDate
            ? `<div class="meta-line">Period: ${earliestDate.toLocaleDateString()} – ${latestDate.toLocaleDateString()}</div>`
            : ''
        }

        <div class="stat-grid">
          <div class="stat-card">
            <div class="num">${totalPatrols}</div>
            <div class="lbl">Patrols</div>
          </div>
          <div class="stat-card">
            <div class="num">${completedCount}</div>
            <div class="lbl">Completed</div>
          </div>
          <div class="stat-card">
            <div class="num">${totalCheckpoints}</div>
            <div class="lbl">Checkpoints</div>
          </div>
          <div class="stat-card issues">
            <div class="num">${totalIssues}</div>
            <div class="lbl">Issues Flagged</div>
          </div>
        </div>

        <div class="charts-row">
          <div class="chart-card donut">
            <h3>Checkpoint Outcomes</h3>
            ${donutSvg}
            <div class="chart-legend">
              <span><span class="dot" style="background:#2e9e6b"></span>Clear (${clearResults})</span>
              <span><span class="dot" style="background:#cf5b5b"></span>Issues (${totalIssues})</span>
            </div>
          </div>
          <div class="chart-card bars">
            <h3>Issues by ${singleSite ? 'Route' : 'Site'}</h3>
            ${barSvg}
          </div>
        </div>

        <div class="charts-row">
          <div class="chart-card full">
            <h3>Issues Over Time</h3>
            ${trendSvg}
          </div>
        </div>

        <div class="charts-row">
          <div class="chart-card bars full">
            <h3>Issues by Shift</h3>
            ${shiftSvg}
            <div class="shift-stats">
              <span><strong>Night (8PM–8AM):</strong> ${shiftTally.night.issues} of ${shiftTally.night.total} checkpoints (${shiftRate(shiftTally.night)}%)</span>
              <span><strong>Morning (8AM–8PM):</strong> ${shiftTally.morning.issues} of ${shiftTally.morning.total} checkpoints (${shiftRate(shiftTally.morning)}%)</span>
            </div>
          </div>
        </div>

        ${
          singleSite
            ? `
        <h2>By Route</h2>
        <table>
          <thead>
            <tr><th>Route</th><th>Patrols</th><th>Checkpoints</th><th>Issues</th></tr>
          </thead>
          <tbody>${routeRows}</tbody>
        </table>

        <h2>By Operator</h2>
        <table>
          <thead>
            <tr><th>Operator</th><th>Patrols</th><th>Issues</th></tr>
          </thead>
          <tbody>${operatorRows}</tbody>
        </table>`
            : `
        <h2>By Site</h2>
        <table>
          <thead>
            <tr><th>Site</th><th>Patrols</th><th>Checkpoints</th><th>Issues</th></tr>
          </thead>
          <tbody>${siteRows}</tbody>
        </table>`
        }

        <h2>Included Patrols</h2>
        <table>
          <thead>
            <tr>
              ${singleSite ? '' : '<th>Site</th>'}
              <th>Route</th><th>Operator</th><th>Completed</th><th>Checkpoints</th><th>Issues</th>
            </tr>
          </thead>
          <tbody>${jobRows}</tbody>
        </table>
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

    const isOn = (key: string) =>
      layout.find((f) => f.key === key)?.enabled ?? true
    // position within the saved order, used so "screenshots" vs
    // "checklistItems" can be swapped left/right inside each checkpoint card
    const orderOf = (key: string) => {
      const i = layout.findIndex((f) => f.key === key)
      return i === -1 ? 999 : i
    }

    let logoTag = ''
    if (isOn('header')) {
      try {
        const logoB64 = fs
          .readFileSync(join(process.cwd(), 'assets', 'logo.png'))
          .toString('base64')
        logoTag = `<img class="logo" src="data:image/png;base64,${logoB64}" />`
      } catch {
        logoTag = ''
      }
    }

    // top summary block -- only the enabled meta fields, in the saved order
    const metaFieldHtml: Record<string, string> = {
      site: `<div><span class="label">Site</span><br>${job.route.site.name}</div>`,
      route: `<div><span class="label">Route</span><br>${job.route.name}</div>`,
      operator: `<div><span class="label">Operator</span><br>${job.operator.fullName}</div>`,
      status: `<div><span class="label">Status</span><br>${job.status}</div>`,
      startTime: `<div><span class="label">Start Time</span><br>${fmt(job.startedAt)}</div>`,
      endTime: `<div><span class="label">End Time</span><br>${fmt(job.completedAt)}</div>`,
      checkpointCount: `<div><span class="label">Checkpoints</span><br>${job.route.checkpoints.length}</div>`,
    }
    const metaHtml = layout
      .filter((f) => f.enabled && metaFieldHtml[f.key])
      .map((f) => metaFieldHtml[f.key])
      .join('')

    const shotOrder = orderOf('screenshots')
    const checklistOrder = orderOf('checklistItems')

    const sections = job.route.checkpoints
      .map((cp, i) => {
        const result = resultByCp.get(cp.id)
        const flagged = result && !result.allClear

        let shotBlock = ''
        if (isOn('screenshots')) {
          let imgTag = '<div class="noimg">No screenshot</div>'
          if (result?.screenshotPath) {
            const filePath = join(
              process.cwd(),
              'uploads',
              result.screenshotPath,
            )
            try {
              const b64 = fs.readFileSync(filePath).toString('base64')
              imgTag = `<img src="data:image/png;base64,${b64}" />`
            } catch {
              imgTag = '<div class="noimg">Screenshot unavailable</div>'
            }
          }
          shotBlock = `<div class="cp-shot" style="order:${shotOrder}">${imgTag}</div>`
        }

        let checkBlock = ''
        if (isOn('checklistItems')) {
          const state = (result?.checklistState as any[]) || []
          const items =
            state.length > 0
              ? state
                  .map(
                    (s) =>
                      `<li class="${s.checked ? 'ok' : 'fail'}">${
                        s.checked ? '✓' : '✗'
                      } ${s.label}</li>`,
                  )
                  .join('')
              : cp.checklistTemplate.items
                  .map((it) => `<li>• ${it.label}</li>`)
                  .join('')

          checkBlock = `
              <div class="cp-check" style="order:${checklistOrder}">
                <p class="cp-cl-name">${cp.checklistTemplate.name}</p>
                <ul>${items}</ul>
                ${
                  isOn('comments') && result?.comment
                    ? `<div class="cp-comment"><strong>Comment:</strong> ${result.comment}</div>`
                    : ''
                }
              </div>`
        } else if (isOn('comments') && result?.comment) {
          // checklist itself hidden, but comments were kept on -- still show
          // the note so it isn't silently lost
          checkBlock = `
              <div class="cp-check" style="order:${checklistOrder}">
                <div class="cp-comment"><strong>Comment:</strong> ${result.comment}</div>
              </div>`
        }

        return `
          <div class="cp ${flagged ? 'flagged' : ''}">
            <div class="cp-head">
              <span class="cp-num">${i + 1}</span>
              <div>
                <strong>${cp.camera.name}</strong>
                <span class="cp-loc">${cp.camera.location || ''}</span>
              </div>
              <span class="cp-status ${flagged ? 's-fail' : 's-ok'}">
                ${flagged ? 'ISSUE FLAGGED' : 'ALL CLEAR'}
              </span>
            </div>
            <div class="cp-body">
              ${shotBlock}
              ${checkBlock}
            </div>
          </div>`
      })
      .join('')

    const html = `
      <html><head><style>
        * { font-family: Arial, sans-serif; box-sizing: border-box; }
        body { margin: 0; padding: 32px; color: #011f4b; }
        .header { position: relative; border-bottom: 3px solid #011f4b; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { margin: 0 0 4px; font-size: 24px; }
        .header .sub { color: #5f7488; font-size: 13px; }
        .header .logo { position: absolute; top: 0; right: 0; height: 54px; width: auto; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 16px 0 24px; font-size: 13px; }
        .meta div { padding: 6px 0; border-bottom: 1px solid #e5e5e5; }
        .meta .label { color: #5f7488; font-size: 11px; text-transform: uppercase; }
        .issues-banner { background: ${issues.length ? '#fdeaea' : '#eafaf1'}; color: ${issues.length ? '#cf5b5b' : '#2e9e6b'}; padding: 12px 16px; border-radius: 8px; font-weight: bold; margin-bottom: 24px; }
        .cp { border: 1px solid #d8e2ec; border-radius: 10px; margin-bottom: 16px; overflow: hidden; page-break-inside: avoid; }
        .cp.flagged { border-color: #cf5b5b; }
        .cp-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #f4f7fa; border-bottom: 1px solid #d8e2ec; }
        .cp-num { width: 26px; height: 26px; background: #011f4b; color: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; }
        .cp-head strong { display: block; font-size: 14px; }
        .cp-loc { font-size: 11px; color: #5f7488; }
        .cp-status { margin-left: auto; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 12px; }
        .s-ok { background: #eafaf1; color: #2e9e6b; }
        .s-fail { background: #fdeaea; color: #cf5b5b; }
        .cp-body { display: flex; gap: 16px; padding: 16px; }
        .cp-shot img { width: 260px; border-radius: 8px; border: 1px solid #d8e2ec; }
        .noimg { width: 260px; height: 146px; background: #f4f7fa; border-radius: 8px; display: flex; align-items: center; justify-content: center; color:#5f7488; font-size: 12px; }
        .cp-check { flex: 1; }
        .cp-cl-name { font-weight: bold; margin: 0 0 8px; font-size: 13px; }
        .cp-check ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7; }
        .cp-check li.ok { color: #2e9e6b; }
        .cp-check li.fail { color: #cf5b5b; }
        .cp-comment { margin-top: 10px; padding: 8px 12px; background: #fdeaea; border-radius: 6px; font-size: 12px; }
      </style></head><body>
        ${
          isOn('header')
            ? `<div class="header">
          ${logoTag}
          <h1>Security Patrol Report</h1>
          <div class="sub">Virtual Patrol · Generated ${new Date().toLocaleString()}</div>
        </div>`
            : ''
        }
        ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ''}
        ${
          isOn('issuesBanner')
            ? `<div class="issues-banner">
          ${issues.length ? `⚠ ${issues.length} issue(s) flagged during this patrol` : '✓ All checkpoints cleared — no issues flagged'}
        </div>`
            : ''
        }
        ${sections}
      </body></html>`

    return html
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