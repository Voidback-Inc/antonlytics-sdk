import { AntoError, statusToCode } from "./errors.js";
import type { SdkEvents } from "./types.js";
import type { Emitter } from "./emitter.js";
import type { RateLimiter } from "./limiter.js";

const RETRY_ON  = new Set([429, 500, 502, 503, 504]);
const SDK_VER   = "1.0.0";

export interface HttpConfig {
  apiKey:  string;
  baseUrl: string;
  timeout: number;
  retries: number;
  debug:   boolean;
  fetch:   (input: string, init?: RequestInit) => Promise<Response>;
}

export interface RequestOpts {
  method?:  "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?:    unknown;
  params?:  Record<string, string | number | boolean | null | undefined>;
  signal?:  AbortSignal;
}

export class HttpClient {
  private readonly base:        string;
  private readonly apiKey:      string;
  private readonly timeout:     number;
  private readonly retries:     number;
  private readonly debug:       boolean;
  private readonly _fetch: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly emitter?:    Emitter<SdkEvents>;
  private readonly limiter?:    RateLimiter;

  constructor(
    cfg: HttpConfig,
    emitter?: Emitter<SdkEvents>,
    limiter?: RateLimiter,
  ) {
    this.base    = cfg.baseUrl.replace(/\/$/, "");
    this.apiKey  = cfg.apiKey;
    this.timeout = cfg.timeout;
    this.retries = cfg.retries;
    this.debug   = cfg.debug;
    this._fetch  = cfg.fetch;
    this.emitter = emitter;
    this.limiter = limiter;
  }

  async request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const { method = "GET", body, params, signal } = opts;

    // Build URL
    const url = new URL(`${this.base}/api/v1${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type":   "application/json",
      "X-Api-Key":      this.apiKey,
      "X-Sdk-Version":  SDK_VER,
      "X-Sdk-Language": "javascript",
    };

    // Client-side rate limiting
    if (this.limiter) await this.limiter.acquire();

    this.emitter?.emit("request", { method, path, body });
    if (this.debug) console.debug(`[Antonlytics] → ${method} ${url.href}`, body ?? "");

    let attempt = 0;

    while (attempt <= this.retries) {
      const t0         = Date.now();
      const ctrl       = new AbortController();
      const tid        = setTimeout(() => ctrl.abort("timeout"), this.timeout);
      const combined   = signal ? mergeSignals([signal, ctrl.signal]) : ctrl.signal;

      try {
        const res = await this._fetch(url.href, {
          method,
          headers,
          body:   body !== undefined ? JSON.stringify(body) : undefined,
          signal: combined,
        });

        clearTimeout(tid);
        const ms = Date.now() - t0;

        // Retry transient errors
        if (RETRY_ON.has(res.status) && attempt < this.retries) {
          const backoff = 300 * 2 ** attempt;
          this.emitter?.emit("retry", { method, path, attempt: ++attempt, error: await this._parseError(res) });
          if (this.debug) console.debug(`[Antonlytics] Retry ${attempt}/${this.retries} in ${backoff}ms`);
          await sleep(backoff);
          continue;
        }

        if (!res.ok) {
          const err = await this._parseError(res);
          this.emitter?.emit("error", { method, path, error: err });
          throw err;
        }

        if (res.status === 204) {
          this.emitter?.emit("response", { method, path, status: 204, ms });
          return undefined as unknown as T;
        }

        const data = await res.json() as T;
        this.emitter?.emit("response", { method, path, status: res.status, ms });
        if (this.debug) console.debug(`[Antonlytics] ← ${res.status} ${path} (${ms}ms)`, data);
        return data;

      } catch (err) {
        clearTimeout(tid);
        if (err instanceof AntoError) throw err;

        const name = (err as Error).name;
        if (name === "AbortError" || String(err).includes("timeout")) {
          const e = new AntoError({ status: 0, code: "TIMEOUT", message: `Request timed out after ${this.timeout}ms` });
          this.emitter?.emit("error", { method, path, error: e });
          throw e;
        }

        if (attempt < this.retries) { attempt++; await sleep(300 * 2 ** attempt); continue; }

        const e = new AntoError({ status: 0, code: "NETWORK_ERROR", message: (err as Error).message ?? "Network error", details: err });
        this.emitter?.emit("error", { method, path, error: e });
        throw e;
      }
    }

    throw new AntoError({ status: 0, code: "UNKNOWN", message: "Unknown error" });
  }

  get<T>(path: string, params?: RequestOpts["params"])    { return this.request<T>(path, { method: "GET", params }); }
  post<T>(path: string, body?: unknown)                   { return this.request<T>(path, { method: "POST", body }); }
  patch<T>(path: string, body?: unknown)                  { return this.request<T>(path, { method: "PATCH", body }); }
  del<T>(path: string)                                    { return this.request<T>(path, { method: "DELETE" }); }

  private async _parseError(res: Response): Promise<AntoError> {
    let body: any = {};
    try { body = await res.json(); } catch { /* empty */ }
    return new AntoError({
      status:  res.status,
      code:    body?.code ?? body?.error?.code ?? statusToCode(res.status),
      message: body?.detail ?? body?.error?.detail ?? body?.message ?? res.statusText,
      details: body,
    });
  }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

function mergeSignals(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) { ctrl.abort(); break; }
    s.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}
