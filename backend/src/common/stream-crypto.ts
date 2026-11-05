import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

const PREFIX = 'v1';

function getKey(): Buffer {
  const raw = process.env.CAMERA_STREAM_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new InternalServerErrorException(
      'Camera stream encryption is not configured on the server',
    );
  }

  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== 32) {
    throw new InternalServerErrorException(
      'CAMERA_STREAM_ENCRYPTION_KEY must encode exactly 32 bytes',
    );
  }
  return key;
}

export function encryptStreamUrl(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptStreamUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  // Legacy values are plaintext until the one-time migration script is run.
  if (!value.startsWith(`${PREFIX}:`)) return value;

  const [, ivValue, tagValue, payloadValue] = value.split(':');
  if (!ivValue || !tagValue || !payloadValue) {
    throw new InternalServerErrorException('Stored camera stream value is invalid');
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getKey(),
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(payloadValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new InternalServerErrorException(
      'Could not decrypt the stored camera stream URL; verify the encryption key',
    );
  }
}

export function normalizeStreamUrl(value: string): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException('Enter a valid RTSP, RTSPS, HTTP or HTTPS stream URL');
  }

  if (!['rtsp:', 'rtsps:', 'http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('Stream URL must use RTSP, RTSPS, HTTP or HTTPS');
  }
  if (!url.hostname || url.hostname.length > 253) {
    throw new BadRequestException('Stream URL must include a valid camera host');
  }
  if (url.hash) {
    throw new BadRequestException('Stream URLs must not contain fragments');
  }
  return trimmed;
}

export function isRtspUrl(value: string | null | undefined): boolean {
  return !!value && /^rtsps?:\/\//i.test(value);
}

export function getCameraStreamPath(cameraId: string): string {
  return `camera_${cameraId.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function redactStreamUrl(value: string): string {
  return value.replace(/(rtsps?:\/\/)[^@\s]+@/gi, '$1[redacted]@');
}
