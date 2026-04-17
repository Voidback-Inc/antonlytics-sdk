// Minimal fetch type declarations.
// We declare these ourselves so the SDK compiles without requiring the DOM lib,
// making it compatible with Node.js, Deno, and edge runtimes out of the box.

declare interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  signal?: AbortSignal | null;
}

declare type BodyInit = string | ArrayBuffer | FormData;

declare interface Response {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

declare interface Headers {
  get(name: string): string | null;
  set(name: string, value: string): void;
}

declare interface AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
}

declare class AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}
