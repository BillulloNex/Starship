import { describe, expect, it } from "vitest";
import { createConcurrencyLimiter } from "#/utils/limited-concurrency";

describe("createConcurrencyLimiter", () => {
  it("never runs more than max tasks at once", async () => {
    const withLimit = createConcurrencyLimiter(2);
    let inFlight = 0;
    let peak = 0;
    const started: number[] = [];

    const run = (id: number) =>
      withLimit(async () => {
        started.push(id);
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
        inFlight -= 1;
        return id;
      });

    const results = await Promise.all([run(1), run(2), run(3), run(4), run(5)]);

    expect(peak).toBeLessThanOrEqual(2);
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(started).toHaveLength(5);
  });

  it("releases the slot when work throws", async () => {
    const withLimit = createConcurrencyLimiter(1);

    await expect(
      withLimit(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(withLimit(async () => "ok")).resolves.toBe("ok");
  });
});
