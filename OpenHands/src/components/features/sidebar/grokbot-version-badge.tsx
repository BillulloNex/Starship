import { GROKBOT_VERSION } from "#/constants/grokbot-version";

export function GrokbotVersionBadge({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  if (collapsed) return null;
  return (
    <span
      data-testid="grokbot-version"
      className="ml-1.5 shrink-0 rounded bg-[var(--oh-surface-raised)] px-1.5 py-0.5 text-sm font-medium leading-5 text-[var(--oh-text-secondary)]"
      title={`Grokbot v${GROKBOT_VERSION}`}
    >
      v{GROKBOT_VERSION}
    </span>
  );
}
