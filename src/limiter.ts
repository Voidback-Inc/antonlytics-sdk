/**
 * Client-side token-bucket rate limiter.
 * Queues excess calls instead of dropping them.
 *
 * @example
 * const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });
 * await limiter.acquire(); // blocks until a token is free
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly max: number;
  private readonly windowMs: number;
  private readonly queue: Array<() => void> = [];

  constructor({ maxRequests, windowMs }: { maxRequests: number; windowMs: number }) {
    this.max       = maxRequests;
    this.windowMs  = windowMs;
    this.tokens    = maxRequests;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this._refill();
    if (this.tokens > 0) { this.tokens--; return; }
    return new Promise<void>(resolve => {
      this.queue.push(resolve);
      setTimeout(() => this._refill(), this.windowMs - (Date.now() - this.lastRefill) + 1);
    });
  }

  private _refill(): void {
    const now = Date.now();
    if (now - this.lastRefill >= this.windowMs) {
      this.tokens    = this.max;
      this.lastRefill = now;
      while (this.tokens > 0 && this.queue.length > 0) {
        this.tokens--;
        this.queue.shift()!();
      }
    }
  }

  get available(): number { this._refill(); return this.tokens; }
  get pending():   number { return this.queue.length; }
}
