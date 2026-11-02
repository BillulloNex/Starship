import { describe, expect, it, vi } from "vitest";
import {
  mirrorEnvelopeToSentry,
  rewriteEnvelopeDsn,
  sentryEnvelopeUrl,
} from "../../scripts/sentry-fanout.mjs";

const SENTRY_DSN = "https://pubkey@o123.ingest.us.sentry.io/456";
const envelope = Buffer.from(
  `${JSON.stringify({ dsn: "https://gt@glitchtip.beenex.cloud/4", event_id: "abc" })}\n` +
    `{"type":"event"}\n{"message":"boom"}\n`,
);

describe("sentryEnvelopeUrl", () => {
  it("builds the ingest URL from the DSN", () => {
    expect(sentryEnvelopeUrl(SENTRY_DSN)).toBe(
      "https://o123.ingest.us.sentry.io/api/456/envelope/?sentry_key=pubkey&sentry_version=7",
    );
  });

  it("keeps a path prefix", () => {
    expect(sentryEnvelopeUrl("https://k@host.example/sentry/9")).toBe(
      "https://host.example/sentry/api/9/envelope/?sentry_key=k&sentry_version=7",
    );
  });

  it.each(["", "not a url", "https://host/9", "https://k@host/abc"])(
    "rejects %j",
    (dsn) => {
      expect(sentryEnvelopeUrl(dsn)).toBeNull();
    },
  );
});

describe("rewriteEnvelopeDsn", () => {
  it("swaps only the header dsn", () => {
    const out = rewriteEnvelopeDsn(envelope, SENTRY_DSN)!.toString("utf8");
    const [header, ...rest] = out.split("\n");
    expect(JSON.parse(header)).toEqual({ dsn: SENTRY_DSN, event_id: "abc" });
    expect(rest.join("\n")).toBe('{"type":"event"}\n{"message":"boom"}\n');
  });

  it("rejects an envelope without a JSON header line", () => {
    expect(rewriteEnvelopeDsn(Buffer.from("nope"), SENTRY_DSN)).toBeNull();
    expect(rewriteEnvelopeDsn(Buffer.from("nope\n{}"), SENTRY_DSN)).toBeNull();
  });
});

describe("mirrorEnvelopeToSentry", () => {
  it("does nothing without SENTRY_DSN", () => {
    const fetchImpl = vi.fn();
    expect(mirrorEnvelopeToSentry(envelope, { env: {}, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the rewritten envelope to Sentry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null));
    await mirrorEnvelopeToSentry(envelope, {
      env: { SENTRY_DSN },
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(sentryEnvelopeUrl(SENTRY_DSN));
    expect(init.body.toString("utf8")).toContain(`"dsn":"${SENTRY_DSN}"`);
  });

  it("swallows upstream failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    await expect(
      mirrorEnvelopeToSentry(envelope, { env: { SENTRY_DSN }, fetchImpl }),
    ).resolves.toBeNull();
  });
});
