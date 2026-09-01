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
import puppeteer from 'puppeteer'

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

          // A site can only have one record in ActivePatrol.
          // This is the database-level lock for active patrols.
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
        // A lock already exists. Determine whose patrol it is.
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

  async getJob(operatorId: string, jobId: string) {
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

    if (job.operatorId !== operatorId) {
      throw new ForbiddenException('Not your patrol job')
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
          screenshotPath: data.screenshotPath,
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

      // Draft patrols release the site for another operator.
      await tx.activePatrol.deleteMany({
        where: { jobId },
      })

      return updatedJob
    })
  }

  async complete(operatorId: string, jobId: string) {
    const job = await this.prisma.patrolJob.findUnique({
      where: { id: jobId },
    })

    if (!job) {
      throw new NotFoundException('Patrol job not found')
    }

    if (job.operatorId !== operatorId) {
      throw new ForbiddenException('Not your patrol job')
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

      // Completed patrols also release the site.
      await tx.activePatrol.deleteMany({
        where: { jobId },
      })

      return completedJob
    })
  }

  // ---------- Active patrol management (resume / admin override) ----------

  // Operator discards their own active patrol on a site (deletes job + lock)
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

  // Admin: list all active + draft patrols across all sites
  async listActivePatrols() {
    return this.prisma.patrolJob.findMany({
      where: { status: { in: ['IN_PROGRESS', 'DRAFT'] } },
      orderBy: { lastActivityAt: 'desc' },
      include: {
        operator: { select: { fullName: true, username: true } },
        route: { include: { site: { select: { name: true } } } },
        activePatrol: true,
        _count: { select: { results: true } },
      },
    })
  }

  // Admin: release the lock only (job stays, site freed)
  async adminReleaseLock(jobId: string) {
    await this.prisma.activePatrol.deleteMany({ where: { jobId } })
    return { released: true }
  }

  // Admin: fully delete the patrol job + all its data
  async adminDeletePatrol(jobId: string) {
    const job = await this.prisma.patrolJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundException('Patrol job not found')
    await this.prisma.checkpointResult.deleteMany({ where: { jobId } })
    await this.prisma.activePatrol.deleteMany({ where: { jobId } })
    await this.prisma.patrolJob.delete({ where: { id: jobId } })
    return { deleted: true }
  }

  // ---------- Module G: Reports ----------

  // List jobs — admins see all, operators see their own
  async listJobs(user: { id: string; role: string }) {
    const where = user.role === 'ADMIN' ? {} : { operatorId: user.id }
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

  // Generate a PDF report for a job (admins any, operators their own)
  async generateReport(user: { id: string; role: string }, jobId: string) {
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
    if (user.role !== 'ADMIN' && job.operatorId !== user.id) {
      throw new ForbiddenException('Not your patrol job')
    }

    const resultByCp = new Map(job.results.map((r) => [r.checkpointId, r]))
    const issues = job.results.filter((r) => !r.allClear)

    const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString() : '—')
    const durationMin =
      job.completedAt && job.startedAt
        ? Math.round(
            (new Date(job.completedAt).getTime() -
              new Date(job.startedAt).getTime()) /
              60000,
          )
        : null

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
        .header { border-bottom: 3px solid #011f4b; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { margin: 0 0 4px; font-size: 24px; }
        .header .sub { color: #5f7488; font-size: 13px; }
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
          <div><span class="label">Duration</span><br>${durationMin !== null ? durationMin + ' min' : '—'}</div>
          <div><span class="label">Checkpoints</span><br>${job.route.checkpoints.length}</div>
        </div>
        <div class="issues-banner">
          ${issues.length ? `⚠ ${issues.length} issue(s) flagged during this patrol` : '✓ All checkpoints cleared — no issues flagged'}
        </div>
        ${sections}
      </body></html>`

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16px', bottom: '16px', left: '16px', right: '16px' },
    })
    await browser.close()
    return pdf
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