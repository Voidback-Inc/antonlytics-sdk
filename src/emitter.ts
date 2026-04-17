type Listener<T> = (payload: T) => void;

/**
 * Minimal typed event emitter used internally by the SDK for lifecycle hooks.
 * Exposed publicly so you can subscribe via `anto.on(event, listener)`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Emitter<Events extends Record<string, any>> {
  private _listeners = new Map<keyof Events, Set<Listener<any>>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(fn);
    return () => this.off(event, fn);
  }

  /** Subscribe once — auto-removes after first emission. */
  once<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    const wrapper: Listener<Events[K]> = (payload) => { fn(payload); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }

  /** Remove a listener. */
  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): void {
    this._listeners.get(event)?.delete(fn);
  }

  /** Remove all listeners, optionally for a specific event. */
  removeAll(event?: keyof Events): void {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
  }

  /** @internal */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this._listeners.get(event)?.forEach(fn => {
      try { fn(payload); }
      catch (e) { console.error(`[Antonlytics] Listener error for "${String(event)}":`, e); }
    });
  }
}

/**
 * Type alias for the bound emit function passed into modules.
 * Written as an explicit function signature to avoid indexed-access-type
 * errors during DTS generation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EmitFn<Events extends Record<string, any>> =
  <K extends keyof Events>(event: K, payload: Events[K]) => void;
