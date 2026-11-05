import test from 'node:test';
import assert from 'node:assert/strict';

import { MediaMtxClient } from '../src/mediamtx.mjs';

function response(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

test(
  'adds a MediaMTX path and waits until the RTSP source is ready',
  async () => {
    const originalFetch = globalThis.fetch;

    const calls = [];
    let pathChecks = 0;

    globalThis.fetch = async (url, options = {}) => {
      const parsed = new URL(url);

      calls.push({
        url: parsed.pathname,
        method: options.method || 'GET',
        body: options.body,
      });

      if (
        parsed.pathname.startsWith('/v3/config/paths/get/')
      ) {
        return response(404);
      }

      if (
        parsed.pathname.startsWith('/v3/config/paths/add/')
      ) {
        return response(200);
      }

      if (
        parsed.pathname.startsWith('/v3/paths/get/')
      ) {
        pathChecks++;
        return response(200, {
          ready: pathChecks > 1,
        });
      }

      return response(404);
    };

    try {
      const client = new MediaMtxClient(
        'http://127.0.0.1:9997'
      );

      await client.upsertPath(
        'camera_1234567890abcdef',
        'rtsp://192.168.10.10:554/live'
      );

      const add = calls.find((call) =>
        call.url.startsWith('/v3/config/paths/add/')
      );

      assert.ok(add);

      const payload = JSON.parse(add.body);

      assert.equal(payload.sourceOnDemand, false);
      assert.equal(payload.rtspTransport, 'tcp');
      assert.equal(pathChecks, 2);

    } finally {
      globalThis.fetch = originalFetch;
    }
  }
);

test(
  'updates an existing path rather than creating a duplicate',
  async () => {
    const originalFetch = globalThis.fetch;

    const calls = [];

    globalThis.fetch = async (url, options = {}) => {
      const parsed = new URL(url);

      calls.push({
        url: parsed.pathname,
        method: options.method || 'GET',
      });

      if (
        parsed.pathname.startsWith('/v3/config/paths/get/')
      ) {
        return response(200);
      }

      if (
        parsed.pathname.startsWith('/v3/config/paths/patch/')
      ) {
        return response(200);
      }

      if (
        parsed.pathname.startsWith('/v3/paths/get/')
      ) {
        return response(200, {
          ready: true,
        });
      }

      return response(404);
    };

    try {
      const client = new MediaMtxClient(
        'http://127.0.0.1:9997'
      );

      await client.upsertPath(
        'camera_1234567890abcdef',
        'rtsp://192.168.10.10:554/live'
      );

      assert.ok(
        calls.some(
          (call) =>
            call.method === 'PATCH' &&
            call.url.startsWith('/v3/config/paths/patch/')
        )
      );

      assert.equal(
        calls.some((call) => call.method === 'POST'),
        false
      );

    } finally {
      globalThis.fetch = originalFetch;
    }
  }
);