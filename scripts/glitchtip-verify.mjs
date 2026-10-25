#!/usr/bin/env node

/**
 * GlitchTip E2E Verification Script — Phase 8
 *
 * Sends test events through all layers and verifies they're accepted.
 * Run after every deployment to confirm error reporting works.
 *
 * Usage: node scripts/glitchtip-verify.mjs [base-url]
 */

const BASE_URL = process.argv[2] || "https://ship.beenex.org";
const DSN = "https://f263a1c8ebe0485f965fb1eeff1a9afe@glitchtip.beenex.cloud/4";
const WEBHOOK_SECRET = process.env.GLITCHTIP_WEBHOOK_SECRET || "";

let pass = 0;
let fail = 0;

function check(name, expected, actual) {
  if (String(actual) === String(expected)) {
    console.log(`  ✅ ${name} (got ${actual})`);
    pass++;
  } else {
    console.log(`  ❌ ${name} (expected ${expected}, got ${actual})`);
    fail++;
  }
}

async function fetchStatus(url, options = {}) {
  try {
    const r = await fetch(url, { ...options, redirect: "manual" });
    return r.status;
  } catch {
    return 0;
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  GlitchTip E2E Verification");
  console.log(`  Target: ${BASE_URL}`);
  console.log("═══════════════════════════════════════════════\n");

  // 1. Health
  console.log("── 1. Health Checks ──");
  check("Health endpoint", 200, await fetchStatus(`${BASE_URL}/health`));

  // 2. Tunnel
  console.log("\n── 2. GlitchTip Tunnel ──");
  check("Tunnel rejects bad data", 400, await fetchStatus(
    `${BASE_URL}/api/glitchtip-tunnel`,
    { method: "POST", headers: { "Content-Type": "text/plain" }, body: "bad" },
  ));

  const validEnvelope = [
    JSON.stringify({ dsn: DSN, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      event_id: "e2e0" + "0".repeat(28),
      timestamp: new Date().toISOString(),
      level: "info",
      platform: "javascript",
      tags: { source: "e2e-verification", service: "verify-script", test: "true" },
      message: { formatted: "E2E verification test event" },
    }),
  ].join("\n");

  check("Tunnel forwards valid envelope", 200, await fetchStatus(
    `${BASE_URL}/api/glitchtip-tunnel`,
    { method: "POST", headers: { "Content-Type": "text/plain" }, body: validEnvelope },
  ));

  check("Tunnel is public (not 401)", true, (await fetchStatus(
    `${BASE_URL}/api/glitchtip-tunnel`,
    { method: "POST", headers: { "Content-Type": "text/plain" }, body: "no-auth-test" },
  )) !== 401);

  // 3. Scrubbing test
  console.log("\n── 3. Scrubbing Test ──");
  const scrubEnvelope = [
    JSON.stringify({ dsn: DSN }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      event_id: "e2e1" + "1".repeat(28),
      timestamp: new Date().toISOString(),
      level: "warning",
      platform: "javascript",
      tags: { source: "scrub-test", test: "true" },
      message: { formatted: "Secret test sk-ant-api03-FAKE123 and Bearer my_token_xyz" },
    }),
  ].join("\n");
  check("Scrub test event accepted", 200, await fetchStatus(
    `${BASE_URL}/api/glitchtip-tunnel`,
    { method: "POST", headers: { "Content-Type": "text/plain" }, body: scrubEnvelope },
  ));
  console.log("  ℹ️  Verify in GlitchTip UI: secrets should show [REDACTED]");

  // 4. Webhook endpoint
  console.log("\n── 4. GlitchTip Webhook ──");
  const webhookNoSecret = await fetchStatus(
    `${BASE_URL}/api/automation/glitchtip-webhook/wrong-secret`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  check("Webhook rejects wrong secret", 403, webhookNoSecret);

  if (WEBHOOK_SECRET) {
    // Test self-loop prevention
    const autoFixPayload = JSON.stringify({
      event: {
        title: "Test auto-fix event",
        tags: { source: "auto-fix" },
      },
    });
    const autoFixCode = await fetchStatus(
      `${BASE_URL}/api/automation/glitchtip-webhook/${WEBHOOK_SECRET}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: autoFixPayload },
    );
    check("Webhook skips auto-fix events", 200, autoFixCode);

    // Test test-event skipping
    const testPayload = JSON.stringify({
      event: {
        title: "Test event",
        tags: { test: "true" },
      },
    });
    const testCode = await fetchStatus(
      `${BASE_URL}/api/automation/glitchtip-webhook/${WEBHOOK_SECRET}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: testPayload },
    );
    check("Webhook skips test events", 200, testCode);
  } else {
    console.log("  ⚠️  GLITCHTIP_WEBHOOK_SECRET not set — skipping authenticated webhook tests");
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log("═══════════════════════════════════════════════");

  process.exit(fail > 0 ? 1 : 0);
}

main();
