import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import GitHubOAuthService from "#/api/github-oauth-service";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  useDisconnectGithub,
  useGithubConnection,
} from "#/hooks/query/use-github-connection";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

interface GithubConnectCardProps {
  compact?: boolean;
  nextPath?: string;
}

export function GithubConnectCard({
  compact = false,
  nextPath,
}: GithubConnectCardProps) {
  const { t } = useTranslation("openhands");
  const { data, isLoading } = useGithubConnection();
  const disconnect = useDisconnectGithub();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("github");
    if (!status) return;

    if (status === "connected") {
      displaySuccessToast(t(I18nKey.SETTINGS$GITHUB_CONNECTED_TOAST));
    } else if (status === "error") {
      displayErrorToast(
        params.get("github_error") || t(I18nKey.SETTINGS$GITHUB_CONNECT_ERROR),
      );
    }

    params.delete("github");
    params.delete("github_error");
    params.delete("login");
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [t]);

  const handleConnect = () => {
    const next =
      nextPath ||
      `${window.location.pathname}${window.location.search}${window.location.hash}` ||
      "/settings/app";
    window.location.assign(GitHubOAuthService.startUrl(next));
  };

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onError: (error) => {
        displayErrorToast(error instanceof Error ? error.message : null);
      },
    });
  };

  return (
    <div
      data-testid="github-connect-card"
      className={cn(
        "flex flex-col gap-3",
        !compact && "rounded-lg border border-[var(--oh-border)] p-4",
      )}
    >
      {!compact && (
        <>
          <h4 className="text-base font-medium">
            {t(I18nKey.SETTINGS$GITHUB)}
          </h4>
          <p className="text-sm leading-5 text-tertiary-light">
            {t(I18nKey.SETTINGS$GITHUB_CONNECT_DESCRIPTION)}
          </p>
        </>
      )}
      {compact && (
        <p className="text-sm leading-5 text-tertiary-light">
          {t(I18nKey.SETTINGS$GITHUB_CONNECT_TO_BROWSE)}
        </p>
      )}

      {data?.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          {data.avatarUrl ? (
            <img
              src={data.avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full"
              data-testid="github-connected-avatar"
            />
          ) : null}
          <span
            className="text-sm text-white"
            data-testid="github-connected-as"
          >
            {t(I18nKey.SETTINGS$GITHUB_CONNECTED_AS, {
              login: data.name || data.login,
            })}
          </span>
          <BrandButton
            testId="github-disconnect-button"
            variant="secondary"
            type="button"
            isDisabled={disconnect.isPending}
            onClick={handleDisconnect}
          >
            {t(I18nKey.SETTINGS$GITHUB_DISCONNECT_BUTTON)}
          </BrandButton>
        </div>
      ) : (
        <div>
          <BrandButton
            testId="github-connect-button"
            variant="primary"
            type="button"
            isDisabled={isLoading}
            onClick={handleConnect}
          >
            {t(I18nKey.SETTINGS$GITHUB_CONNECT_BUTTON)}
          </BrandButton>
        </div>
      )}
    </div>
  );
}
