import { setTimeout as sleep } from 'node:timers/promises';
import { MediaMtxClient } from './mediamtx.mjs';
import { validateRtspSource, validateStreamPath } from './security.mjs';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const apiBaseUrl = new URL(required('VIRTUAL_PATROL_API_URL'));

if (
  apiBaseUrl.protocol !== 'https:' &&
  !['localhost', '127.0.0.1'].includes(apiBaseUrl.hostname)
) {
  throw new Error('VIRTUAL_PATROL_API_URL must use HTTPS outside local development');
}

if (
  apiBaseUrl.username ||
  apiBaseUrl.password ||
  apiBaseUrl.search ||
  apiBaseUrl.hash
) {
  throw new Error('VIRTUAL_PATROL_API_URL must not contain credentials, query or fragment');
}

const apiBase = apiBaseUrl.origin.replace(/\/$/, '');
const token = required('VIRTUAL_PATROL_AGENT_TOKEN');

const hlsBase = new URL(required('MEDIAMTX_HLS_BASE_URL'));

if (
  !['http:', 'https:'].includes(hlsBase.protocol) ||
  hlsBase.username ||
  hlsBase.password ||
  hlsBase.search ||
  hlsBase.hash ||
  (hlsBase.pathname !== '/' && hlsBase.pathname !== '')
) {
  throw new Error('MEDIAMTX_HLS_BASE_URL must be an HTTP(S) origin without credentials, query or fragment');
}

const allowedHosts = (process.env.CAMERA_ALLOWED_HOSTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const allowedCidrs = (process.env.CAMERA_ALLOWED_CIDRS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (allowedHosts.length === 0 && allowedCidrs.length === 0) {
  throw new Error(
    'Set CAMERA_ALLOWED_CIDRS and/or CAMERA_ALLOWED_HOSTS to restrict camera destinations for this site'
  );
}

const pollInterval = Number(process.env.POLL_INTERVAL_MS || 5000);
const heartbeatInterval = Number(process.env.HEARTBEAT_INTERVAL_MS || 30000);
const requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 10000);

const mediamtx = new MediaMtxClient(
  process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997',
  requestTimeout
);

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeout);

  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Virtual Patrol API returned HTTP ${response.status}`);
    }

    return response.status === 204 ? null : response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function heartbeat() {
  await apiRequest('/camera-agent/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      playbackBaseUrl: hlsBase.origin,
    }),
  });
}

async function handleJob(job) {
  if (!job || typeof job.id !== 'string') return;

  let result = { status: 'APPLIED' };

  try {
    const streamPath = validateStreamPath(job.streamPath);

    if (job.action === 'UPSERT') {
      const parsed = validateRtspSource(
        job.source,
        allowedHosts,
        allowedCidrs
      );

      await mediamtx.upsertPath(streamPath, parsed.toString());

    } else if (job.action === 'REMOVE') {
      await mediamtx.removePath(streamPath);

    } else {
      throw new Error('Unsupported provisioning action');
    }

    console.info(`Applied camera provisioning job ${job.id} (${job.action}).`);

  } catch (error) {
    result = {
      status: 'FAILED',
      errorMessage:
        'Camera provisioning failed. Check the site agent logs for the non-sensitive error category.',
    };

    console.error(
      `Camera provisioning job ${job.id} failed: ${result.errorMessage}`
    );
  }

  await apiRequest(
    `/camera-agent/jobs/${encodeURIComponent(job.id)}/result`,
    {
      method: 'POST',
      body: JSON.stringify(result),
    }
  );
}

async function main() {
  console.info(
    'Virtual Patrol Camera Agent starting. RTSP URLs and credentials will not be logged.'
  );

  let lastHeartbeat = 0;

  while (true) {
    try {
      if (Date.now() - lastHeartbeat >= heartbeatInterval) {
        await heartbeat();
        lastHeartbeat = Date.now();
      }

      const response = await apiRequest('/camera-agent/jobs/next');

      if (response?.job) {
        await handleJob(response.job);
      } else {
        await sleep(pollInterval);
      }

    } catch (error) {
      console.error(
        `Agent connection problem: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );

      await sleep(Math.max(pollInterval, 5000));
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Agent startup failed'
  );

  process.exitCode = 1;
});