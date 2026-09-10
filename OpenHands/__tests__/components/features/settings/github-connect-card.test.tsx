import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubConnectCard } from "#/components/features/settings/github-connect-card";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

const getStatus = vi.hoisted(() => vi.fn());
const disconnect = vi.hoisted(() => vi.fn());
const startUrl = vi.hoisted(() =>
  vi.fn((next = "/settings/app") => `/api/github/oauth/start?next=${next}`),
);

vi.mock("#/api/github-oauth-service", () => ({
  default: {
    getStatus,
    disconnect,
    startUrl,
  },
}));

function renderCard() {
  return render(<GithubConnectCard />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("GithubConnectCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatus.mockResolvedValue({
      configured: false,
      connected: false,
      login: null,
      name: null,
      avatarUrl: null,
      mode: "unset",
    });
    disconnect.mockResolvedValue(undefined);
  });

  it("offers Connect GitHub when disconnected", async () => {
    renderCard();
    expect(
      await screen.findByTestId("github-connect-button"),
    ).toBeInTheDocument();
  });

  it("shows the connected account and can disconnect", async () => {
    getStatus.mockResolvedValue({
      configured: true,
      connected: true,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://example.com/a.png",
      mode: "oauth_app",
    });

    renderCard();

    expect(await screen.findByTestId("github-connected-as")).toHaveTextContent(
      "SETTINGS$GITHUB_CONNECTED_AS",
    );
    await userEvent.click(screen.getByTestId("github-disconnect-button"));
    expect(disconnect).toHaveBeenCalled();
  });
});
