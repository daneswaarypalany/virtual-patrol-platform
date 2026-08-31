import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

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
        throw new ConflictException(
          'A patrol is already active on this site. Complete or save it as a draft before starting another patrol.',
        )
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