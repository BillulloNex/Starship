import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { I18nKey } from "#/i18n/declaration";
import { GitFlareRepoSelectionForm } from "./gitflare-repo-selection-form";

interface OpenGitFlareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    repoName: string;
    cloneUrl: string;
    defaultBranch: string;
  }) => void;
}

export function OpenGitFlareDialog({
  isOpen,
  onClose,
  onConfirm,
}: OpenGitFlareDialogProps) {
  const { t } = useTranslation("openhands");

  if (!isOpen) return null;

  return (
    <ModalBackdrop onClose={onClose}>
      <ModalBody
        width="sm"
        className="relative items-start border border-[var(--oh-border)] !gap-4"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="close-open-gitflare-dialog"
        />
        <div className="w-full pr-6">
          <BaseModalTitle
            title={t(I18nKey.COMMON$OPEN_GITFLARE_REPOSITORY)}
          />
        </div>

        <div className="w-full" data-testid="open-gitflare-dialog-body">
          <GitFlareRepoSelectionForm
            onConfirm={(selection) => {
              onConfirm(selection);
              onClose();
            }}
          />
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
