import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock modules before importing the component
vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => ({ conversationId: "test-conversation-id" }),
  useConversationId: () => ({ conversationId: "test-conversation-id" }),
}));

vi.mock("#/context/conversation-context", () => ({
  useConversation: () => ({ conversationId: "test-conversation-id" }),
  ConversationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...(actual as object),
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: {
        changeLanguage: () => new Promise(() => {}),
      },
    }),
  };
});

import { BrowserPanel } from "#/components/features/browser/browser";
import { useBrowserStore } from "#/stores/browser-store";

// The live pane fetches /api/preview/ports, so it needs a query client.
function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserPanel />
    </QueryClientProvider>,
  );
}

describe("Browser", () => {
  beforeEach(() => {
    useBrowserStore.getState().reset();
  });

  afterEach(() => {
    useBrowserStore.getState().reset();
    vi.clearAllMocks();
  });

  it("renders a message if no screenshotSrc is provided", () => {
    useBrowserStore.setState({
      url: "https://example.com",
      screenshotSrc: "",
      viewMode: "snapshot",
    });

    renderPanel();

    expect(screen.getByText("BROWSER$NO_PAGE_LOADED")).toBeInTheDocument();
    expect(screen.getByTestId("browser-chrome-bar")).toBeInTheDocument();
    expect(screen.getByTestId("browser-chrome-url")).toHaveTextContent(
      "https://example.com",
    );
  });

  it("keeps the chrome bar height and disables open-in-new-tab when empty", () => {
    useBrowserStore.setState({
      url: "",
      screenshotSrc: "",
      viewMode: "snapshot",
    });

    renderPanel();

    expect(screen.getByTestId("browser-chrome-bar")).toHaveClass(
      "min-h-[34px]",
    );
    expect(screen.getByTestId("browser-chrome-url")).toHaveTextContent(
      "BROWSER$URL_PLACEHOLDER",
    );
    expect(
      screen.queryByRole("button", { name: "BUTTON$BACK" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "BUTTON$OPEN_IN_NEW_TAB" }),
    ).toBeDisabled();
  });

  it("renders the url and a screenshot", () => {
    useBrowserStore.setState({
      url: "https://example.com",
      screenshotSrc:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN0uGvyHwAFCAJS091fQwAAAABJRU5ErkJggg==",
    });

    renderPanel();

    expect(screen.getByTestId("browser-chrome-url")).toHaveTextContent(
      "https://example.com",
    );
    expect(screen.getByAltText("BROWSER$SCREENSHOT_ALT")).toBeInTheDocument();
  });

  it("does not clear a preloaded screenshot when the browser tab first mounts", () => {
    const screenshotSrc =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN0uGvyHwAFCAJS091fQwAAAABJRU5ErkJggg==";

    useBrowserStore.setState({
      url: "https://example.com",
      screenshotSrc,
    });

    renderPanel();

    expect(useBrowserStore.getState().screenshotSrc).toBe(screenshotSrc);
    expect(screen.getByAltText("BROWSER$SCREENSHOT_ALT")).toBeInTheDocument();
    expect(
      screen.queryByText("BROWSER$NO_PAGE_LOADED"),
    ).not.toBeInTheDocument();
  });

  describe("live preview", () => {
    const portsResponse = (body: Record<string, unknown>) =>
      Promise.resolve({
        ok: true,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve(body),
      } as unknown as Response);

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("defaults to the live pane when the agent has no screenshot to show", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          portsResponse({
            enabled: true,
            listening: [3000],
            routable: [3000],
            urlTemplate: "https://p{port}.beenex.org",
          }),
        ),
      );
      useBrowserStore.setState({ url: "", screenshotSrc: "" });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByTestId("live-preview-iframe")).toHaveAttribute(
          "src",
          "https://p3000.beenex.org",
        );
      });
    });

    it("defaults to the snapshot pane once a screenshot arrives", () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => portsResponse({ enabled: false })),
      );
      useBrowserStore.setState({
        url: "https://example.com",
        screenshotSrc: "data:image/png;base64,abc",
      });

      renderPanel();

      expect(screen.getByAltText("BROWSER$SCREENSHOT_ALT")).toBeInTheDocument();
      expect(
        screen.queryByTestId("live-preview-iframe"),
      ).not.toBeInTheDocument();
    });

    it("explains when the app's port has no public hostname", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          portsResponse({
            enabled: true,
            listening: [7777],
            routable: [3000, 5173],
            urlTemplate: "https://p{port}.beenex.org",
          }),
        ),
      );
      useBrowserStore.setState({ url: "", screenshotSrc: "" });

      renderPanel();

      await waitFor(() => {
        expect(
          screen.getByText("PREVIEW$PORT_NOT_PUBLISHED"),
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId("live-preview-iframe"),
      ).not.toBeInTheDocument();
    });

    it("does not offer a preview when the deployment has it disabled", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          portsResponse({
            enabled: false,
            listening: [],
            routable: [],
            urlTemplate: null,
          }),
        ),
      );
      useBrowserStore.setState({ url: "", screenshotSrc: "" });

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText("PREVIEW$DISABLED")).toBeInTheDocument();
      });
    });
  });
});
