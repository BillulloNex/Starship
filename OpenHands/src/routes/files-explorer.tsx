import { useState } from "react";
import { useTranslation } from "react-i18next";

import { StandaloneWorkspaceShell } from "#/components/features/standalone-workspace/standalone-workspace-shell";
import { WorkspaceFileBrowser } from "#/components/features/files-tab/workspace-file-browser";
import { SegmentedToggle } from "#/components/features/files-tab/segmented-toggle";
import type { ViewMode } from "#/components/features/files-tab/view-mode";
import { I18nKey } from "#/i18n/declaration";

function FilesExplorerPage() {
  const { t } = useTranslation("openhands");
  const [viewMode, setViewMode] = useState<ViewMode>("rich");

  return (
    <StandaloneWorkspaceShell
      title={t(I18nKey.COMMON$FILES)}
      toolbar={
        <SegmentedToggle<ViewMode>
          ariaLabel={t(I18nKey.FILES$RICH)}
          testId="files-explorer-content-mode-toggle"
          value={viewMode}
          options={[
            { value: "rich", label: t(I18nKey.FILES$RICH) },
            { value: "plain", label: t(I18nKey.FILES$PLAIN) },
            { value: "edit", label: "Edit" },
          ]}
          onChange={setViewMode}
        />
      }
    >
      <WorkspaceFileBrowser
        viewMode={viewMode}
        onEditFile={() => setViewMode("edit")}
      />
    </StandaloneWorkspaceShell>
  );
}

export default FilesExplorerPage;
