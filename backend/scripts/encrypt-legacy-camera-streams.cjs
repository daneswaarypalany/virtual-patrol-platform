require('dotenv/config');
const { createCipheriv, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function getKey() {
  const raw = process.env.CAMERA_STREAM_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('CAMERA_STREAM_ENCRYPTION_KEY is required');
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('CAMERA_STREAM_ENCRYPTION_KEY must encode 32 bytes');
  return key;
}

function encrypt(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
}

function streamPath(cameraId) {
  return `camera_${cameraId.replace(/[^a-zA-Z0-9]/g, '')}`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const key = getKey();
  try {
    const cameras = await prisma.camera.findMany({
      where: { streamUrl: { not: null }, streamUrlEncrypted: null },
      select: { id: true, siteId: true, streamUrl: true, streamVersion: true },
    });
    let migrated = 0;
    for (const camera of cameras) {
      const source = camera.streamUrl?.trim();
      if (!source) continue;
      const isRtsp = /^rtsps?:\/\//i.test(source);
      const nextVersion = camera.streamVersion + (isRtsp ? 1 : 0);
      await prisma.$transaction(async (tx) => {
        await tx.camera.update({
          where: { id: camera.id },
          data: {
            streamUrl: null,
            streamUrlEncrypted: encrypt(source, key),
            streamVersion: nextVersion,
          },
        });
        if (isRtsp) {
          await tx.cameraProvisioningJob.updateMany({
            where: { cameraId: camera.id, status: { in: ['PENDING', 'PROCESSING'] } },
            data: { status: 'CANCELLED', completedAt: new Date() },
          });
          await tx.cameraProvisioningJob.create({
            data: {
              cameraId: camera.id,
              siteId: camera.siteId,
              action: 'UPSERT',
              streamPath: streamPath(camera.id),
              version: nextVersion,
              status: 'PENDING',
            },
          });
        }
      });
      migrated += 1;
    }
    console.info(`Encrypted ${migrated} legacy camera stream URL(s). No stream URLs were printed.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Legacy camera stream migration failed');
  process.exitCode = 1;
});
