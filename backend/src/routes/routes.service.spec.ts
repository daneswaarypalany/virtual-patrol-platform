import { NotFoundException } from '@nestjs/common';
import { RoutesService } from './routes.service';

describe('RoutesService archive/delete behavior', () => {
  const prisma = {
    route: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    patrolJob: { count: jest.fn() },
  };
  const service = new RoutesService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('archives a route with patrol history and preserves its linked records', async () => {
    prisma.route.findUnique.mockResolvedValue({ id: 'route-1', archivedAt: null });
    prisma.patrolJob.count.mockResolvedValue(7);
    prisma.route.update.mockResolvedValue({ id: 'route-1', archivedAt: new Date() });

    const result = await service.remove('route-1');

    expect(prisma.route.update).toHaveBeenCalledWith({
      where: { id: 'route-1' },
      data: { archivedAt: expect.any(Date) },
    });
    expect(prisma.route.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ archived: true, preservedPatrolRecords: 7 });
  });

  it('permanently deletes a route with no patrol history', async () => {
    prisma.route.findUnique.mockResolvedValue({ id: 'route-2', archivedAt: null });
    prisma.patrolJob.count.mockResolvedValue(0);

    const result = await service.remove('route-2');

    expect(prisma.route.delete).toHaveBeenCalledWith({ where: { id: 'route-2' } });
    expect(prisma.route.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ archived: false });
  });

  it('returns not found for an unknown route', async () => {
    prisma.route.findUnique.mockResolvedValue(null);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.patrolJob.count).not.toHaveBeenCalled();
  });

  it('lists only routes that are not archived', async () => {
    prisma.route.findMany.mockResolvedValue([]);
    await service.findAll();
    expect(prisma.route.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archivedAt: null } }),
    );
  });
});
