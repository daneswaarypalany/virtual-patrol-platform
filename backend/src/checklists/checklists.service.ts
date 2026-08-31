import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChecklistDto, UpdateChecklistDto } from './dto/checklist.dto';

@Injectable()
export class ChecklistsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.checklistTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { checkpoints: true } },
      },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.checklistTemplate.findUnique({
      where: { id },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Checklist template not found');
    return t;
  }

  create(dto: CreateChecklistDto) {
    return this.prisma.checklistTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        items: {
          create: dto.items.map((item, i) => ({
            label: item.label,
            orderIndex: i,
          })),
        },
      },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async update(id: string, dto: UpdateChecklistDto) {
    await this.findOne(id);

    if (dto.items) {
      await this.prisma.checklistItem.deleteMany({ where: { templateId: id } });
    }

    return this.prisma.checklistTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        ...(dto.items && {
          items: {
            create: dto.items.map((item, i) => ({
              label: item.label,
              orderIndex: i,
            })),
          },
        }),
      },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.checklistTemplate.delete({ where: { id } });
    return { message: 'Checklist template deleted' };
  }
}