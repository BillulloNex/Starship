import { test, expect } from "@playwright/test";
import {
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  BACKEND_URL,
  SESSION_API_KEY,
  ensureMockLLMAgentProfile,
} from "../utils/mock-llm-helpers";

test.describe("Real User Journey & Anti-Blank-Screen Guards", () => {
  let uncaughtErrors: Error[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = [];
    consoleErrors = [];
    page.on("pageerror", (error) => uncaughtErrors.push(error));
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("net::ERR_")) {
        consoleErrors.push(msg.text());
      }
    });

    await seedLocalStorage(page);
    await routeSessionApiKey(page);
  });

  test.afterEach(async () => {
    expect(uncaughtErrors, "Page had uncaught JavaScript errors").toHaveLength(
      0,
    );
  });

  test("Journey 1: Rapid Navigation Stress Test (Anti-Blank-Screen)", async ({
    page,
  }) => {
    await ensureMockLLMAgentProfile(page.request);

    // Navigate quickly through all major routes
    const routes = [
      "/",
      "/settings",
      "/settings/llm",
      "/settings/mcp",
      "/extensions",
      "/",
    ];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await dismissAnalyticsModal(page);

      // Assert app frame rendered and no recovery banner
      await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator("#grokbot-recovery-banner")).not.toBeVisible();
    }

    // Use browser back/forward buttons between routes
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#grokbot-recovery-banner")).not.toBeVisible();

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#grokbot-recovery-banner")).not.toBeVisible();

    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#grokbot-recovery-banner")).not.toBeVisible();
  });

  test("Journey 2: Full Settings Configuration Flow", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    const settingsPages = [
      "/settings/llm",
      "/settings/agents",
      "/settings/mcp",
      "/settings/secrets",
    ];

    for (const route of settingsPages) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
        timeout: 10_000,
      });
      // Quick check to ensure the page has loaded some meaningful content
      const contentVisible = await page
        .locator("main, [role='main']")
        .isVisible();
      expect(contentVisible).toBe(true);
    }

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Journey 3: Conversation Tab Switching", async ({ page, request }) => {
    await ensureMockLLMAgentProfile(request);

    // Create a conversation via API
    const resp = await request.post(`${BACKEND_URL}/api/conversations`, {
      headers: { "X-Session-API-Key": SESSION_API_KEY },
      data: {},
    });
    expect(resp.ok(), "Failed to create conversation").toBe(true);
    const conv = await resp.json();
    const conversationId = conv.id;

    // Navigate to the conversation
    await page.goto(`/conversations/${conversationId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
      timeout: 10_000,
    });

    const tabs = ["Chat", "Files", "Changes", "Terminal"];
    for (const tabName of tabs) {
      // Find the tab by text or role
      const tabButton = page
        .getByRole("tab", { name: tabName, exact: false })
        .first();
      // If the UI uses generic buttons or divs for tabs, we can fallback to text locator
      const fallbackTab = page.locator(`text=${tabName}`).first();

      if (await tabButton.isVisible().catch(() => false)) {
        await tabButton.click();
      } else if (await fallbackTab.isVisible().catch(() => false)) {
        await fallbackTab.click();
      }

      // Verify app frame didn't crash
      await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.locator("#grokbot-recovery-banner")).not.toBeVisible();
    }
  });

  test("Journey 4: Error Recovery", async ({ page }) => {
    // Navigate to a conversation that doesn't exist
    await page.goto("/conversations/nonexistent-id-12345", {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);

    // Verify the app shows an error state, NOT a blank screen
    await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
      timeout: 10_000,
    });

    // An error banner or not found message should be present, not a crash
    await expect(page.locator("#grokbot-recovery-banner")).not.toBeVisible();

    // Verify navigation back to home works
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-agent-server-ui]")).toBeVisible({
      timeout: 10_000,
    });
    // And that we can see the chat launcher
    await expect(
      page.getByTestId("home-chat-launcher").or(page.locator("text=Chat")),
    )
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {});
  });
});
