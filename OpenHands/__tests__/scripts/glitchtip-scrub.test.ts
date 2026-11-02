import { describe, expect, it } from "vitest";
import { scrubEvent } from "../../scripts/glitchtip-scrub.mjs";

type Crumb = { message?: string; data?: Record<string, string> };

describe("scrubEvent breadcrumbs", () => {
  // Regression: `event.breadcrumbs.values` on an array is Array.prototype.values,
  // which made beforeSend throw and dropped every server-side event.
  it("scrubs the SDK's plain-array breadcrumbs", () => {
    const event = scrubEvent({
      breadcrumbs: [{ message: "Bearer abc123" }],
    }) as { breadcrumbs: Crumb[] };
    expect(event.breadcrumbs).toEqual([{ message: "[REDACTED]" }]);
  });

  it("scrubs wire-format { values } breadcrumbs", () => {
    const event = scrubEvent({
      breadcrumbs: {
        values: [{ message: "x", data: { url: "?session_api_key=s" } }],
      },
    }) as { breadcrumbs: { values: Crumb[] } };
    expect(event.breadcrumbs.values[0].data?.url).not.toContain("=s");
  });
});
