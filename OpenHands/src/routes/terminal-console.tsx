import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

import { StandaloneWorkspaceShell } from "#/components/features/standalone-workspace/standalone-workspace-shell";
import { I18nKey } from "#/i18n/declaration";

const Terminal = lazy(() => import("#/components/features/terminal/terminal"));

function TerminalConsolePage() {
  const { t } = useTranslation("openhands");

  return (
    <StandaloneWorkspaceShell title={t(I18nKey.TERMINAL$CONSOLE)}>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--oh-muted)]">
            Loading terminal…
          </div>
        }
      >
        <Terminal />
      </Suspense>
    </StandaloneWorkspaceShell>
  );
}

export default TerminalConsolePage;
