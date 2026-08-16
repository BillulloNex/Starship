/**
 * PostHog Observability API Proxy
 *
 * Secure server-side proxy between Grokbot frontend and PostHog APIs.
 * Uses POSTHOG_PERSONAL_API_KEY from environment variables to query
 * events, persons, and project health while keeping secrets secure.
 */

import { request as httpsRequest } from "node:https";

const DEFAULT_HOST = "us.posthog.com";

function getEnvConfig() {
  const personalApiKey = (
    process.env.POSTHOG_PERSONAL_API_KEY || ""
  ).trim();
  const projectId = (
    process.env.POSTHOG_PROJECT_ID || ""
  ).trim();
  const projectApiKey = (
    process.env.POSTHOG_PROJECT_API_KEY ||
    process.env.VITE_POSTHOG_API_KEY ||
    ""
  ).trim();
  const host = (
    process.env.POSTHOG_API_HOST || DEFAULT_HOST
  ).trim();

  return { personalApiKey, projectId, projectApiKey, host };
}

/**
 * Execute an HTTPS request to PostHog API
 */
function fetchPostHog(endpoint, { method = "GET", body = null, host, personalApiKey }) {
  return new Promise((resolve, reject) => {
    const headers = {
      Authorization: `Bearer ${personalApiKey}`,
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
      reject(new Error("PostHog API request timed out after 15s"));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Handle incoming PostHog observability proxy requests
 */
export async function handlePostHogProxy(req, res, pathname, query = {}) {
  const { personalApiKey, projectId, projectApiKey, host } = getEnvConfig();

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  // 1. Status & Diagnostics Endpoint
  if (pathname === "/api/observability/posthog/status") {
    const hasPersonalKey = Boolean(personalApiKey);
    const hasProjectId = Boolean(projectId);
    const hasProjectApiKey = Boolean(projectApiKey);

    let projectInfo = null;
    let valid = false;

    if (hasPersonalKey && hasProjectId) {
      try {
        const projRes = await fetchPostHog(
          `/api/projects/${projectId}/`,
          { host, personalApiKey },
        );
        if (projRes.statusCode === 200 && projRes.data?.id) {
          valid = true;
          projectInfo = {
            id: projRes.data.id,
            name: projRes.data.name,
            timezone: projRes.data.timezone,
          };
        }
      } catch {
        valid = false;
      }
    }

    res.writeHead(200);
    res.end(
      JSON.stringify({
        enabled: hasPersonalKey && hasProjectId,
        hasPersonalApiKey: hasPersonalKey,
        hasProjectId,
        hasProjectApiKey,
        isValidKey: valid,
        host,
        projectId: projectId || null,
        project: projectInfo,
        version: "0.1.0",
      }),
    );
    return;
  }

  // Check if required keys are present for query endpoints
  if (!personalApiKey || !projectId) {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        configured: false,
        error: "Missing PostHog credentials",
        message: !personalApiKey
          ? "POSTHOG_PERSONAL_API_KEY is required to query PostHog data."
          : "POSTHOG_PROJECT_ID is required.",
        missing: [
          !personalApiKey && "POSTHOG_PERSONAL_API_KEY",
          !projectId && "POSTHOG_PROJECT_ID",
        ].filter(Boolean),
        host,
      }),
    );
    return;
  }

  // 2. Recent Events Endpoint
  if (pathname === "/api/observability/posthog/events") {
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10)));
    const eventFilter = query.event || "";

    try {
      let url = `/api/projects/${projectId}/events/?limit=${limit}&orderBy=-timestamp`;
      if (eventFilter) {
        url += `&event=${encodeURIComponent(eventFilter)}`;
      }

      const eventsRes = await fetchPostHog(url, { host, personalApiKey });

      if (eventsRes.statusCode !== 200) {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            configured: true,
            error: `PostHog API returned ${eventsRes.statusCode}`,
            details: eventsRes.data,
          }),
        );
        return;
      }

      const rawEvents = eventsRes.data?.results || [];
      const events = rawEvents.map((ev) => ({
        id: ev.id,
        event: ev.event,
        timestamp: ev.timestamp,
        distinctId: ev.distinct_id,
        properties: {
          currentUrl: ev.properties?.$current_url,
          browser: ev.properties?.$browser,
          os: ev.properties?.$os,
          clientSource: ev.properties?.client_source,
          clientVersion: ev.properties?.client_version,
        },
      }));

      // Count by event type
      const eventCounts = {};
      for (const ev of events) {
        eventCounts[ev.event] = (eventCounts[ev.event] || 0) + 1;
      }

      res.writeHead(200);
      res.end(
        JSON.stringify({
          configured: true,
          count: events.length,
          eventCounts,
          events,
        }),
      );
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. Insights / Dashboard Summary Endpoint
  if (pathname === "/api/observability/posthog/insights") {
    try {
      const insightsRes = await fetchPostHog(
        `/api/projects/${projectId}/insights/?limit=10&order=-last_modified_at`,
        { host, personalApiKey },
      );

      if (insightsRes.statusCode !== 200) {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            configured: true,
            error: `PostHog API returned ${insightsRes.statusCode}`,
          }),
        );
        return;
      }

      const insights = (insightsRes.data?.results || []).map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        lastModified: i.last_modified_at,
        filters: i.filters,
      }));

      res.writeHead(200);
      res.end(JSON.stringify({ configured: true, count: insights.length, insights }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
}
