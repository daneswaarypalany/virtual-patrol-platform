export class MediaMtxClient {
  constructor(baseUrl, requestTimeoutMs = 10_000) {
    this.baseUrl = new URL(baseUrl);
    this.requestTimeoutMs = requestTimeoutMs;

    const localHosts = new Set([
      '127.0.0.1',
      'localhost',
      '[::1]',
    ]);

    if (
      this.baseUrl.protocol !== 'http:' ||
      !localHosts.has(this.baseUrl.hostname) ||
      this.baseUrl.username ||
      this.baseUrl.password ||
      this.baseUrl.search ||
      this.baseUrl.hash ||
      (this.baseUrl.pathname !== '/' && this.baseUrl.pathname !== '')
    ) {
      throw new Error(
        'MEDIAMTX_API_URL must be a plain HTTP localhost origin only'
      );
    }
  }

  async request(path, options = {}) {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs
    );

    try {
      return await fetch(new URL(path, this.baseUrl), {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async upsertPath(path, source) {
    const safePath = encodeURIComponent(path);

    const payload = JSON.stringify({
      source,
      sourceOnDemand: false,
      rtspTransport: 'tcp',
    });

    const existing = await this.request(
      `/v3/config/paths/get/${safePath}`
    );

    let response;

    if (existing.ok) {
      response = await this.request(
        `/v3/config/paths/patch/${safePath}`,
        {
          method: 'PATCH',
          body: payload,
        }
      );

    } else if (existing.status === 404) {
      response = await this.request(
        `/v3/config/paths/add/${safePath}`,
        {
          method: 'POST',
          body: payload,
        }
      );

    } else {
      throw new Error(
        `MediaMTX could not inspect the camera path (HTTP ${existing.status})`
      );
    }

    if (!response.ok) {
      throw new Error(
        `MediaMTX rejected camera configuration (HTTP ${response.status})`
      );
    }

    await this.waitForPathReady(path);
  }

  async waitForPathReady(path, timeoutMs = 20_000) {
    const safePath = encodeURIComponent(path);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const response = await this.request(
        `/v3/paths/get/${safePath}`
      );

      if (response.ok) {
        const state = await response.json();

        if (state?.ready === true) {
          return;
        }

      } else if (response.status !== 404) {
        throw new Error(
          `MediaMTX could not verify camera readiness (HTTP ${response.status})`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(
      'MediaMTX did not receive a ready stream from this camera before timeout'
    );
  }

  async removePath(path) {
    const safePath = encodeURIComponent(path);

    const response = await this.request(
      `/v3/config/paths/delete/${safePath}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(
        `MediaMTX could not remove camera path (HTTP ${response.status})`
      );
    }
  }
}