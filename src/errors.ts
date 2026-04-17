import type { AntoErrorDetails } from "./types.js";

/**
 * All errors thrown by the Antonlytics SDK are instances of `AntoError`.
 * You can check `error.code` for machine-readable categorisation and
 * `error.status` for the HTTP status code (0 for network / timeout errors).
 *
 * @example
 * import { AntoError, isAntoError } from "@antonlytics/sdk";
 *
 * try {
 *   await anto.ingest.track({ ... });
 * } catch (err) {
 *   if (isAntoError(err)) {
 *     console.error(err.code);    // "PLAN_LIMIT_REACHED", "UNAUTHORIZED", …
 *     console.error(err.status);  // 402, 401, …
 *   }
 * }
 */
export class AntoError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(params: AntoErrorDetails) {
    super(params.message);
    this.name    = "AntoError";
    this.status  = params.status;
    this.code    = params.code;
    this.details = params.details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AntoError);
    }
  }

  toJSON() {
    return {
      name:    this.name,
      message: this.message,
      status:  this.status,
      code:    this.code,
      details: this.details,
    };
  }
}

/** Type guard — narrows `unknown` to `AntoError`. */
export function isAntoError(err: unknown): err is AntoError {
  return err instanceof AntoError;
}

/** @internal — map HTTP status codes to readable error codes */
export function statusToCode(status: number): string {
  const map: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    402: "PLAN_LIMIT_REACHED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
  };
  return map[status] ?? "HTTP_ERROR";
}
