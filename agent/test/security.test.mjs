import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateRtspSource,
  validateStreamPath,
} from '../src/security.mjs';

import {
  MediaMtxClient,
} from '../src/mediamtx.mjs';

test('accepts an allowlisted RTSP camera host', () => {
  const parsed = validateRtspSource(
    'rtsp://operator:secret@192.168.10.20:554/stream1',
    ['192.168.10.20']
  );

  assert.equal(parsed.protocol, 'rtsp:');
  assert.equal(parsed.hostname, '192.168.10.20');
});

test('accepts cameras inside an explicitly allowed site subnet', () => {
  const parsed = validateRtspSource(
    'rtsp://192.168.10.25:554/stream1',
    [],
    ['192.168.10.0/24']
  );

  assert.equal(parsed.hostname, '192.168.10.25');
});

test('accepts an exact allowlisted camera DNS name', () => {
  const parsed = validateRtspSource(
    'rtsps://front-gate.example.com:322/stream',
    ['front-gate.example.com']
  );

  assert.equal(parsed.protocol, 'rtsps:');
});

test('rejects non-RTSP protocols', () => {
  assert.throws(
    () =>
      validateRtspSource(
        'http://192.168.10.20/video',
        ['192.168.10.20']
      ),
    /Only RTSP and RTSPS/
  );
});

test('rejects hosts outside the site allowlist and network ranges', () => {
  assert.throws(
    () =>
      validateRtspSource(
        'rtsp://192.168.10.21/stream1',
        ['192.168.10.20']
      ),
    /outside this site agent allowed hosts and networks/
  );

  assert.throws(
    () =>
      validateRtspSource(
        'rtsp://192.168.11.21/stream1',
        [],
        ['192.168.10.0/24']
      ),
    /outside this site agent allowed hosts and networks/
  );
});

test(
  'rejects loopback, link-local and metadata destinations even if allowlisted',
  () => {
    for (const host of [
      '127.0.0.1',
      '169.254.169.254',
      'localhost',
      '[::1]',
      '[fe80::1]',
    ]) {
      assert.throws(
        () =>
          validateRtspSource(
            `rtsp://${host}/stream1`,
            [host]
          ),
        /not allowed/
      );
    }
  }
);

test('rejects malformed CIDR configuration', () => {
  assert.throws(
    () =>
      validateRtspSource(
        'rtsp://192.168.10.25/stream',
        [],
        ['192.168.10.0/99']
      ),
    /Invalid CAMERA_ALLOWED_CIDRS/
  );
});

test('accepts only generated camera stream path names', () => {
  assert.equal(
    validateStreamPath('camera_1234567890abcdef'),
    'camera_1234567890abcdef'
  );

  assert.throws(
    () => validateStreamPath('../api'),
    /invalid stream path/
  );
});

test('MediaMTX Control API is restricted to a localhost HTTP origin', () => {
  assert.doesNotThrow(
    () => new MediaMtxClient('http://127.0.0.1:9997')
  );

  assert.throws(
    () => new MediaMtxClient('http://192.168.1.50:9997'),
    /localhost/
  );

  assert.throws(
    () => new MediaMtxClient('https://127.0.0.1:9997'),
    /localhost origin only/
  );
});