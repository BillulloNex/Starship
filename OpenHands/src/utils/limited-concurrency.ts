/**
 * Run at most `max` async tasks at once. Extra callers wait for a slot.
 *
 * Used to keep the automations dashboard from opening one SQLite connection
 * per listed automation at the same time (pool size 5 + overflow 10).
 */
export function createConcurrencyLimiter(max: number) {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error("max must be a positive integer");
  }

  let inFlight = 0;
  const waiters: Array<() => void> = [];

  return async function withLimit<T>(work: () => Promise<T>): Promise<T> {
    while (inFlight >= max) {
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    }
    inFlight += 1;
    try {
      return await work();
    } finally {
      inFlight -= 1;
      waiters.shift()?.();
    }
  };
}
