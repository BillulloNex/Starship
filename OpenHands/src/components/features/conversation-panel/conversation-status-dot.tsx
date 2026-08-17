import { useTranslation } from "react-i18next";
import { FaArchive } from "react-icons/fa";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

interface ConversationStatusDotProps {
  executionStatus: ExecutionStatus | null | undefined;
  /**
   * Cloud-only sandbox lifecycle status. When provided, MISSING and ERROR
   * override the execution-status visual so the dot reflects the sandbox
   * state rather than the last agent execution state.
   */
  sandboxStatus?: SandboxStatus | null;
  /**
   * Wrap the dot in a tooltip showing the human-readable status label.
   * Disable this when the dot is already nested inside a larger tooltip
   * (e.g. the collapsed-sidebar conversation preview) so the smaller
   * tooltip doesn't intercept the hover.
   */
  showTooltip?: boolean;
}

type Visual = "working" | "error" | "none";

const visualFor = (status: ExecutionStatus | null | undefined): Visual => {
  switch (status) {
    case ExecutionStatus.RUNNING:
      return "working";
    case ExecutionStatus.ERROR:
    case ExecutionStatus.STUCK:
      return "error";
    default:
      return "none";
  }
};

const labelKeyFor = (visual: Visual): string => {
  switch (visual) {
    case "working":
      return "COMMON$WORKING";
    case "error":
      return "COMMON$ERROR";
    default:
      return "";
  }
};

function renderIndicator(visual: Visual) {
  switch (visual) {
    case "working":
      return (
        <svg
          data-testid="conversation-status-working"
          viewBox="0 0 16 16"
          className="w-3 h-3 animate-spin text-[var(--oh-status-success)] shrink-0"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 8a4 4 0 014-4V2a6 6 0 00-6 6h2z"
          />
        </svg>
      );
    case "error":
      return (
        <span
          data-testid="conversation-status-error"
          className="w-1.5 h-1.5 rounded-full bg-[var(--oh-status-error)] shrink-0"
        />
      );
    default:
      return null;
  }
}

export function ConversationStatusDot({
  executionStatus,
  sandboxStatus,
  showTooltip = true,
}: ConversationStatusDotProps) {
  const { t } = useTranslation("openhands");

  const effectiveVisual: Visual =
    sandboxStatus === "ERROR" ? "error" : visualFor(executionStatus);

  const visual = effectiveVisual;
  const indicator = renderIndicator(visual);

  if (!indicator) return null;

  const label = t(labelKeyFor(visual));

  const dot = (
    <div className="w-2.5 h-2.5 flex items-center justify-center shrink-0">
      {indicator}
    </div>
  );

  if (!showTooltip || !label) return dot;

  return (
    <StyledTooltip
      content={label}
      placement="right"
      showArrow
      tooltipClassName="bg-base text-white text-xs shadow-lg"
    >
      {dot}
    </StyledTooltip>
  );
}
