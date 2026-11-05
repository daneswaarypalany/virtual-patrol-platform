import {
  decryptStreamUrl,
  encryptStreamUrl,
  getCameraStreamPath,
  isRtspUrl,
  normalizeStreamUrl,
  redactStreamUrl,
} from './stream-crypto';

describe('camera stream URL protection', () => {
  const previousKey = process.env.CAMERA_STREAM_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.CAMERA_STREAM_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.CAMERA_STREAM_ENCRYPTION_KEY;
    else process.env.CAMERA_STREAM_ENCRYPTION_KEY = previousKey;
  });

  it('encrypts stream URLs and decrypts them without changing their contents', () => {
    const source = 'rtsp://operator:secret@192.168.1.10:554/stream1';
    const encrypted = encryptStreamUrl(source);
    expect(encrypted).not.toContain('operator');
    expect(encrypted).not.toContain('secret');
    expect(decryptStreamUrl(encrypted)).toBe(source);
  });

  it('continues to read legacy plaintext values while migration is pending', () => {
    expect(decryptStreamUrl('rtsp://camera.local/stream')).toBe('rtsp://camera.local/stream');
  });

  it('normalizes only supported camera stream schemes', () => {
    expect(normalizeStreamUrl(' rtsp://camera.local/stream ')).toBe('rtsp://camera.local/stream');
    expect(() => normalizeStreamUrl('file:///etc/passwd')).toThrow();
  });

  it('identifies RTSP links and redacts embedded credentials', () => {
    expect(isRtspUrl('rtsps://camera.local/stream')).toBe(true);
    expect(redactStreamUrl('failed rtsp://admin:secret@camera.local/stream')).toBe(
      'failed rtsp://[redacted]@camera.local/stream',
    );
  });

  it('derives a MediaMTX-safe path from a camera UUID', () => {
    expect(getCameraStreamPath('550e8400-e29b-41d4-a716-446655440000')).toBe(
      'camera_550e8400e29b41d4a716446655440000',
    );
  });
});
