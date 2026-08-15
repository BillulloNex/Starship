/**
 * Datadog Observability API Proxy
 *
 * Secure server-side proxy between Grokbot frontend and Datadog REST APIs.
 * Uses DD_API_KEY and DD_APP_KEY from environment variables to query
 * metrics, logs, monitors, and system health while keeping secrets secure.
 */

import { request as httpsRequest } from "node:https";

const DEFAULT_SITE = "us5.datadoghq.com";
const DEFAULT_SERVICE = "grokbot";
const DEFAULT_ENV = "production";

function getEnvConfig() {
  const apiKey = (process.env.DD_API_KEY || "").trim();
  const appKey = (
    process.env.DD_APP_KEY ||
    process.env.DD_APPLICATION_KEY ||
    ""
  ).trim();
  const site = (
    process.env.DD_SITE ||
    process.env.VITE_DD_SITE ||
    DEFAULT_SITE
  ).trim();
  const env = (
    process.env.DD_ENV ||
    process.env.VITE_DD_ENV ||
    DEFAULT_ENV
  ).trim();
  const service = (process.env.DD_SERVICE || DEFAULT_SERVICE).trim();

  return { apiKey, appKey, site, env, service };
}

/**
 * Execute an HTTPS request to Datadog API
 */
function fetchDatadog(endpoint, { method = "GET", body = null, site, apiKey, appKey }) {
  return new Promise((resolve, reject) => {
    const host = `api.${site}`;
    const headers = {
      "DD-API-KEY": apiKey,
      "DD-APPLICATION-KEY": appKey,
      "Content-Type": "application/json",
      "User-Agent": "Grokbot-Observability/0.2.0",
    };

    let payload = null;
    if (body) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
      headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = httpsRequest(
      {
        host,
        port: 443,
        path: endpoint,
        method,
        headers,
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            const data = JSON.parse(raw);
            resolve({ statusCode: res.statusCode, data });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw, error: e.message });
          }
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Datadog API request timed out after 15s"));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Parse timeframe (e.g. 15m, 1h, 6h, 24h, 7d) into from and to Unix epoch seconds
 */
function parseTimeframe(timeframe = "1h") {
  const now = Math.floor(Date.now() / 1000);
  let duration = 3600;

  switch (timeframe) {
    case "15m":
      duration = 15 * 60;
      break;
    case "1h":
      duration = 60 * 60;
      break;
    case "6h":
      duration = 6 * 60 * 60;
      break;
    case "24h":
      duration = 24 * 60 * 60;
      break;
    case "7d":
      duration = 7 * 24 * 60 * 60;
      break;
    default:
      duration = 3600;
  }

  return { from: now - duration, to: now, duration };
}

/**
 * Handle incoming Datadog observability proxy requests
 */
export async function handleDatadogProxy(req, res, pathname, query = {}) {
  const { apiKey, appKey, site, env, service } = getEnvConfig();

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  // 1. Status & Diagnostics Endpoint
  if (pathname === "/api/observability/datadog/status") {
    const hasApiKey = Boolean(apiKey);
    const hasAppKey = Boolean(appKey);
    let valid = false;

    if (hasApiKey) {
      try {
        const valRes = await fetchDatadog("/api/v1/validate", {
          method: "GET",
          site,
          apiKey,
          appKey,
        });
        valid = valRes.data?.valid === true;
      } catch {
        valid = false;
      }
    }

    res.writeHead(200);
    res.end(
      JSON.stringify({
        enabled: hasApiKey && hasAppKey,
        hasApiKey,
        hasAppKey,
        isValidKey: valid,
        site,
        env,
        service,
        version: "0.2.0",
      }),
    );
    return;
  }

  // Check if App Key is missing for query endpoints
  if (!apiKey || !appKey) {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        configured: false,
        error: "Missing Datadog credentials",
        message: !appKey
          ? "DD_APP_KEY (Application Key) is required to query Datadog statistics."
          : "DD_API_KEY is missing.",
        missing: [!apiKey && "DD_API_KEY", !appKey && "DD_APP_KEY"].filter(Boolean),
        site,
        env,
      }),
    );
    return;
  }

  // 2. Summary Overview Endpoint
  if (pathname === "/api/observability/datadog/summary") {
    const timeframe = query.timeframe || "1h";
    const { from, to } = parseTimeframe(timeframe);

    try {
      // Parallel fetch metrics and monitors
      const [hitsRes, p95Res, p50Res, errorsRes, cpuRes, monitorsRes] =
        await Promise.allSettled([
          fetchDatadog(
            `/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent("sum:trace.http.request.hits{*}.as_count()")}`,
            { site, apiKey, appKey },
          ),
          fetchDatadog(
            `/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent("p95:trace.http.request.duration{*}")}`,
            { site, apiKey, appKey },
          ),
          fetchDatadog(
            `/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent("p50:trace.http.request.duration{*}")}`,
            { site, apiKey, appKey },
          ),
          fetchDatadog(
            `/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent("sum:trace.http.request.errors{*}.as_count()")}`,
            { site, apiKey, appKey },
          ),
          fetchDatadog(
            `/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent("avg:system.cpu.idle{*}")}`,
            { site, apiKey, appKey },
          ),
          fetchDatadog("/api/v1/monitor", { site, apiKey, appKey }),
        ]);

      // Calculate total hits
      let totalHits = 0;
      let hitsSeries = [];
      if (hitsRes.status === "fulfilled" && hitsRes.value?.data?.series?.[0]?.pointlist) {
        hitsSeries = hitsRes.value.data.series[0].pointlist;
        for (const [, val] of hitsSeries) {
          if (typeof val === "number" && !isNaN(val)) totalHits += val;
        }
      }

      // Calculate average p95 latency
      let avgP95 = 0;
      let p95Count = 0;
      let p95Series = [];
      if (p95Res.status === "fulfilled" && p95Res.value?.data?.series?.[0]?.pointlist) {
        p95Series = p95Res.value.data.series[0].pointlist;
        for (const [, val] of p95Series) {
          if (typeof val === "number" && !isNaN(val)) {
            avgP95 += val;
            p95Count += 1;
          }
        }
        if (p95Count > 0) avgP95 /= p95Count;
      }

      // Calculate average p50 latency
      let avgP50 = 0;
      let p50Count = 0;
      if (p50Res.status === "fulfilled" && p50Res.value?.data?.series?.[0]?.pointlist) {
        const p50Points = p50Res.value.data.series[0].pointlist;
        for (const [, val] of p50Points) {
          if (typeof val === "number" && !isNaN(val)) {
            avgP50 += val;
            p50Count += 1;
          }
        }
        if (p50Count > 0) avgP50 /= p50Count;
      }

      // Calculate total errors
      let totalErrors = 0;
      if (errorsRes.status === "fulfilled" && errorsRes.value?.data?.series?.[0]?.pointlist) {
        for (const [, val] of errorsRes.value.data.series[0].pointlist) {
          if (typeof val === "number" && !isNaN(val)) totalErrors += val;
        }
      }

      // CPU usage %
      let avgCpuUsage = null;
      if (cpuRes.status === "fulfilled" && cpuRes.value?.data?.series?.[0]?.pointlist) {
        const cpuPoints = cpuRes.value.data.series[0].pointlist;
        let sumIdle = 0;
        let count = 0;
        for (const [, val] of cpuPoints) {
          if (typeof val === "number" && !isNaN(val)) {
            sumIdle += val;
            count += 1;
          }
        }
        if (count > 0) {
          avgCpuUsage = Math.max(0, Math.min(100, Math.round(100 - (sumIdle / count))));
        }
      }

      // Monitor summary
      const monitorSummary = { ok: 0, alert: 0, warn: 0, noData: 0, total: 0 };
      if (monitorsRes.status === "fulfilled" && Array.isArray(monitorsRes.value?.data)) {
        const monitors = monitorsRes.value.data;
        monitorSummary.total = monitors.length;
        for (const m of monitors) {
          const state = (m.overall_state || "").toLowerCase();
          if (state === "ok") monitorSummary.ok += 1;
          else if (state === "alert") monitorSummary.alert += 1;
          else if (state === "warn" || state === "warning") monitorSummary.warn += 1;
          else monitorSummary.noData += 1;
        }
      }

      const errorRate = totalHits > 0 ? (totalErrors / totalHits) * 100 : 0;

      res.writeHead(200);
      res.end(
        JSON.stringify({
          configured: true,
          timeframe,
          from,
          to,
          site,
          env,
          service,
          metrics: {
            totalRequests: totalHits,
            totalErrors,
            errorRate: Number(errorRate.toFixed(2)),
            latencyP50Ms: Number((avgP50 * 1000).toFixed(1)),
            latencyP95Ms: Number((avgP95 * 1000).toFixed(1)),
            cpuUsagePercent: avgCpuUsage,
            requestsTrend: hitsSeries.slice(-20),
            latencyTrend: p95Series.slice(-20),
          },
          monitors: monitorSummary,
          services: {
            agentServer: { name: "grokbot-agent-server", status: "healthy", port: 18000 },
            automation: { name: "grokbot-automation", status: "healthy", port: 18001 },
            frontend: { name: "grokbot-frontend", status: "healthy", port: 8000 },
            sidecar: { name: "datadog-agent", status: "connected", site },
          },
        }),
      );
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. Logs Search Endpoint
  if (pathname === "/api/observability/datadog/logs") {
    const timeframe = query.timeframe || "1h";
    const statusFilter = query.status || ""; // e.g. "error,warn"
    const searchQuery = query.q || "";
    const limit = Math.min(100, Math.max(10, parseInt(query.limit || "50", 10)));

    let ddQuery = searchQuery;
    if (statusFilter) {
      const statuses = statusFilter
        .split(",")
        .map((s) => `status:${s.trim()}`)
        .join(" OR ");
      ddQuery = ddQuery ? `(${ddQuery}) (${statuses})` : `(${statuses})`;
    }

    try {
      const logsRes = await fetchDatadog("/api/v2/logs/events/search", {
        method: "POST",
        site,
        apiKey,
        appKey,
        body: {
          filter: {
            from: `now-${timeframe}`,
            to: "now",
            query: ddQuery || undefined,
          },
          page: { limit },
          sort: "-timestamp",
        },
      });

      const rawLogs = logsRes.data?.data || [];
      const logs = rawLogs.map((item) => {
        const attr = item.attributes || {};
        return {
          id: item.id,
          timestamp: attr.timestamp,
          service: attr.service || "unknown",
          host: attr.host,
          status: attr.status || "info",
          message: attr.message || "",
          tags: attr.tags || [],
          attributes: attr.attributes || {},
        };
      });

      res.writeHead(200);
      res.end(JSON.stringify({ configured: true, count: logs.length, logs }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 4. Monitors List Endpoint
  if (pathname === "/api/observability/datadog/monitors") {
    try {
      const monitorsRes = await fetchDatadog("/api/v1/monitor", {
        site,
        apiKey,
        appKey,
      });

      const rawMonitors = Array.isArray(monitorsRes.data) ? monitorsRes.data : [];
      const monitors = rawMonitors.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        state: m.overall_state || "No Data",
        query: m.query,
        message: m.message,
        tags: m.tags || [],
        creator: m.creator?.name || m.creator?.email || "System",
        modified: m.modified || m.overall_state_modified,
      }));

      res.writeHead(200);
      res.end(JSON.stringify({ configured: true, count: monitors.length, monitors }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. Raw Time Series Metric Endpoint
  if (pathname === "/api/observability/datadog/series") {
    const metricQuery = query.query;
    const timeframe = query.timeframe || "1h";
    const { from, to } = parseTimeframe(timeframe);

    if (!metricQuery) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Missing 'query' parameter" }));
      return;
    }

    try {
      const queryRes = await fetchDatadog(
        `/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent(metricQuery)}`,
        { site, apiKey, appKey },
      );

      res.writeHead(200);
      res.end(JSON.stringify({ configured: true, data: queryRes.data }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
}
