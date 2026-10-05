import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";
import StickerFolderIcon from "#/icons/sticker-folder.svg?react";
import GitFlareIcon from "#/icons/gitflare.svg?react";
import { cn } from "#/utils/utils";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import {
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
} from "#/utils/form-control-classes";

interface OpenLauncherButtonProps {
  kind: "local" | "cloud" | "gitflare";
  onClick: () => void;
  disabled?: boolean;
  disabledTooltip?: string | null;
}

function getLauncherIcon(kind: OpenLauncherButtonProps["kind"]) {
  switch (kind) {
    case "local":
      return (
        <StickerFolderIcon
          aria-hidden
          className="h-4 w-4 overflow-visible"
        />
      );
    case "gitflare":
      return <GitFlareIcon width={16} height={16} className="shrink-0" />;
    case "cloud":
    default:
      return <RepoForkedIcon width={16} height={16} className="shrink-0" />;
  }
}

export function OpenLauncherButton({
  kind,
  onClick,
  disabled = false,
  disabledTooltip,
}: OpenLauncherButtonProps) {
  const { t } = useTranslation("openhands");

  const labelMap: Record<OpenLauncherButtonProps["kind"], string> = {
    local: t(I18nKey.HOME$OPEN_WORKSPACE),
    cloud: t(I18nKey.COMMON$OPEN_REPOSITORY),
    gitflare: t(I18nKey.COMMON$OPEN_GITFLARE_REPOSITORY),
  };
  const testIdMap: Record<OpenLauncherButtonProps["kind"], string> = {
    local: "open-workspace-button",
    cloud: "open-repository-button",
    gitflare: "open-gitflare-button",
  };

  const label = labelMap[kind];
  const testId = testIdMap[kind];

  const button = (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-row items-center gap-2 rounded-full px-2.5 py-1 text-white",
        formControlBorderClassName,
        formControlSurfaceClassName,
        formControlTransitionClassName,
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-surface-raised",
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {getLauncherIcon(kind)}
      </span>
      <span className="text-sm font-normal leading-5">{label}</span>
    </button>
  );

  if (!disabledTooltip) {
    return button;
  }

  return (
    <StyledTooltip content={disabledTooltip} placement="top">
      <span className="inline-flex">{button}</span>
    </StyledTooltip>
  );
}
