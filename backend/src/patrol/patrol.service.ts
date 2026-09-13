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

@Injectable()
export class PatrolService {
  constructor(private prisma: PrismaService) {}

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
    const html = this.buildReportHtml(job)

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

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    try {
      const reports: { jobId: string; fileName: string; pdf: Buffer }[] = []

      for (const jobId of uniqueIds) {
        const job = await this.fetchJobForReport(user, jobId)
        const html = this.buildReportHtml(job)
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

  private buildReportHtml(job: Awaited<ReturnType<PatrolService['fetchJobForReport']>>) {
    const resultByCp = new Map(job.results.map((r) => [r.checkpointId, r]))
    const issues = job.results.filter((r) => !r.allClear)

    const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString() : '—')

    let logoTag = ''
    try {
      const logoB64 = fs
        .readFileSync(join(process.cwd(), 'assets', 'logo.png'))
        .toString('base64')
      logoTag = `<img class="logo" src="data:image/png;base64,${logoB64}" />`
    } catch {
      logoTag = ''
    }

    const sections = job.route.checkpoints
      .map((cp, i) => {
        const result = resultByCp.get(cp.id)
        const flagged = result && !result.allClear

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
              <div class="cp-shot">${imgTag}</div>
              <div class="cp-check">
                <p class="cp-cl-name">${cp.checklistTemplate.name}</p>
                <ul>${items}</ul>
                ${
                  result?.comment
                    ? `<div class="cp-comment"><strong>Comment:</strong> ${result.comment}</div>`
                    : ''
                }
              </div>
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
        <div class="header">
          ${logoTag}
          <h1>Security Patrol Report</h1>
          <div class="sub">Virtual Patrol · Generated ${new Date().toLocaleString()}</div>
        </div>
        <div class="meta">
          <div><span class="label">Site</span><br>${job.route.site.name}</div>
          <div><span class="label">Route</span><br>${job.route.name}</div>
          <div><span class="label">Operator</span><br>${job.operator.fullName}</div>
          <div><span class="label">Status</span><br>${job.status}</div>
          <div><span class="label">Start Time</span><br>${fmt(job.startedAt)}</div>
          <div><span class="label">End Time</span><br>${fmt(job.completedAt)}</div>
          <div><span class="label">Checkpoints</span><br>${job.route.checkpoints.length}</div>
        </div>
        <div class="issues-banner">
          ${issues.length ? `⚠ ${issues.length} issue(s) flagged during this patrol` : '✓ All checkpoints cleared — no issues flagged'}
        </div>
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