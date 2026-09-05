import React, { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useInstallSkill } from "#/hooks/mutation/use-install-skill";
import {
  ADD_SKILL_DOCS_URL,
  ADD_SKILL_EXAMPLE_COMMAND,
} from "#/constants/skills-docs";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { modalTitleLgClassName } from "#/utils/modal-classes";
import CheckmarkIcon from "#/icons/checkmark.svg?react";
import CopyIcon from "#/icons/copy.svg?react";

interface AddSkillModalProps {
  onClose: () => void;
}

const ADD_SKILL_STEP_KEYS = [
  I18nKey.SETTINGS$SKILLS_ADD_MODAL_STEP_1,
  I18nKey.SETTINGS$SKILLS_ADD_MODAL_STEP_2,
  I18nKey.SETTINGS$SKILLS_ADD_MODAL_STEP_3,
  I18nKey.SETTINGS$SKILLS_ADD_MODAL_STEP_4,
  I18nKey.SETTINGS$SKILLS_ADD_MODAL_STEP_5,
] as const;

const ADD_SKILL_INLINE_CODE_COMPONENTS = {
  cmd: <InlineCodeChip />,
  path: <InlineCodeChip />,
  env: <InlineCodeChip />,
};

function InlineCodeChip({ children }: { children?: React.ReactNode }) {
  return (
    <code
      className={cn(
        "mx-0.5 inline-block rounded-sm border border-[var(--oh-border-subtle)]",
        "bg-[var(--oh-surface-raised)] px-1.5 py-0.5 align-baseline font-mono text-[11px] text-white",
      )}
    >
      {children}
    </code>
  );
}

function AddSkillExampleBlock() {
  const { t } = useTranslation("openhands");
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ADD_SKILL_EXAMPLE_COMMAND);
    setCopied(true);
  };

  React.useEffect(() => {
    if (!copied) return undefined;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="relative">
      <pre
        data-testid="add-skill-modal-example"
        className={cn(
          "overflow-x-auto rounded-sm border border-[var(--oh-border-subtle)]",
          "bg-[var(--oh-surface-raised)] p-2 pr-10 text-xs text-white",
        )}
      >
        {ADD_SKILL_EXAMPLE_COMMAND}
      </pre>
      <button
        type="button"
        data-testid="add-skill-modal-example-copy"
        aria-label={t(copied ? I18nKey.BUTTON$COPIED : I18nKey.BUTTON$COPY)}
        disabled={copied}
        onClick={handleCopy}
        className={cn(
          "absolute right-2 top-2 cursor-pointer rounded-sm border border-[var(--oh-border-subtle)]",
          "bg-base-secondary p-1 text-tertiary-alt transition-colors",
          "hover:bg-[var(--oh-surface)] hover:text-white disabled:cursor-default [&_path]:fill-current",
        )}
      >
        {copied ? (
          <CheckmarkIcon width={14} height={14} />
        ) : (
          <CopyIcon width={14} height={14} />
        )}
      </button>
    </div>
  );
}

function AddSkillTransParagraph({
  i18nKey,
}: {
  i18nKey:
    | typeof I18nKey.SETTINGS$SKILLS_ADD_MODAL_CHAT_BODY
    | typeof I18nKey.SETTINGS$SKILLS_ADD_MODAL_STORAGE_BODY
    | typeof I18nKey.SETTINGS$SKILLS_ADD_MODAL_PRIVATE_REPOS;
}) {
  return (
    <p className="text-xs leading-relaxed text-tertiary-light">
      <Trans
        ns="openhands"
        i18nKey={i18nKey}
        components={ADD_SKILL_INLINE_CODE_COMPONENTS}
      />
    </p>
  );
}

const QUICK_EXAMPLE_SKILLS = [
  "vercel-labs/agent-skills",
  "anthropics/skills",
  "browser-tools",
];

export function AddSkillModal({ onClose }: AddSkillModalProps) {
  const { t } = useTranslation("openhands");
  const installSkillMutation = useInstallSkill();

  const [input, setInput] = useState("");
  const [scope, setScope] = useState<"personal" | "project">("personal");
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || installSkillMutation.isPending) return;

    setStatus(null);

    try {
      const res = await installSkillMutation.mutateAsync({
        input: trimmed,
        scope,
      });

      setStatus({
        type: "success",
        message: `${t(I18nKey.SETTINGS$SKILLS_INSTALL_SUCCESS)} — ${res.skillName}`,
      });
      setInput("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({
        type: "error",
        message: msg,
      });
    }
  };

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.SETTINGS$SKILLS_ADD_MODAL_TITLE)}
    >
      <div
        data-testid="add-skill-modal"
        className="relative flex w-[560px] max-w-[92vw] max-h-[88vh] flex-col rounded-xl border border-[var(--oh-border)] bg-base-secondary"
      >
        <ModalCloseButton onClose={onClose} testId="add-skill-modal-close" />
        <header className="flex-shrink-0 px-6 pb-4 pt-6">
          <h2 className={cn("pr-6", modalTitleLgClassName)}>
            {t(I18nKey.SETTINGS$SKILLS_ADD_MODAL_TITLE)}
          </h2>
          <p className="mt-2 text-xs text-tertiary-light">
            {t(I18nKey.SETTINGS$SKILLS_INSTALL_DESCRIPTION)}
          </p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 custom-scrollbar">
          {/* Direct Installation Card */}
          <form
            onSubmit={handleInstall}
            className="flex flex-col gap-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-4"
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="skill-input"
                className="text-xs font-semibold text-foreground"
              >
                {t(I18nKey.SETTINGS$SKILLS_INSTALL_INPUT_LABEL)}
              </label>
              <div className="relative flex items-center">
                <input
                  id="skill-input"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={installSkillMutation.isPending}
                  placeholder={t(I18nKey.SETTINGS$SKILLS_INSTALL_PLACEHOLDER)}
                  className={cn(
                    "w-full rounded-md border border-[var(--oh-border)] bg-base-secondary px-3 py-2 text-xs text-white",
                    "placeholder:text-[var(--oh-muted)] focus:border-primary focus:outline-none",
                    "disabled:opacity-50",
                  )}
                />
              </div>

              {/* Quick suggestions */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-[var(--oh-muted)]">
                <span>{t(I18nKey.SETTINGS$SKILLS_INSTALL_TRY_LABEL)}</span>
                {QUICK_EXAMPLE_SKILLS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setInput(example)}
                    className="cursor-pointer rounded border border-[var(--oh-border-subtle)] bg-base-secondary px-1.5 py-0.5 text-tertiary-alt hover:text-white"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope Selection */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-tertiary-light">
                {t(I18nKey.SETTINGS$SKILLS_INSTALL_SCOPE_LABEL)}
              </span>
              <div className="flex items-center gap-4 text-xs text-tertiary-light">
                <label className="flex cursor-pointer items-center gap-1.5 hover:text-white">
                  <input
                    type="radio"
                    name="skill-scope"
                    value="personal"
                    checked={scope === "personal"}
                    onChange={() => setScope("personal")}
                    className="accent-primary"
                  />
                  <span>{t(I18nKey.SETTINGS$SKILLS_INSTALL_SCOPE_GLOBAL)}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 hover:text-white">
                  <input
                    type="radio"
                    name="skill-scope"
                    value="project"
                    checked={scope === "project"}
                    onChange={() => setScope("project")}
                    className="accent-primary"
                  />
                  <span>
                    {t(I18nKey.SETTINGS$SKILLS_INSTALL_SCOPE_WORKSPACE)}
                  </span>
                </label>
              </div>
            </div>

            {/* Status alerts */}
            {status && (
              <div
                className={cn(
                  "rounded-md p-2.5 text-xs",
                  status.type === "success"
                    ? "border border-green-500/30 bg-green-500/10 text-green-300"
                    : "border border-red-500/30 bg-red-500/10 text-red-300",
                )}
              >
                <div className="whitespace-pre-wrap font-mono">
                  {status.message}
                </div>
              </div>
            )}

            {/* Action button */}
            <div className="flex justify-end pt-1">
              <BrandButton
                type="submit"
                variant="primary"
                isDisabled={!input.trim() || installSkillMutation.isPending}
                startContent={
                  installSkillMutation.isPending ? (
                    <LoadingSpinner size="small" />
                  ) : undefined
                }
              >
                {installSkillMutation.isPending
                  ? t(I18nKey.SETTINGS$SKILLS_INSTALLING)
                  : t(I18nKey.SETTINGS$SKILLS_INSTALL_BUTTON)}
              </BrandButton>
            </div>
          </form>

          {/* Collapsible Manual Instructions & Documentation */}
          <details className="group rounded-lg border border-[var(--oh-border-subtle)] bg-[var(--oh-surface-raised)]/40 p-3 text-xs">
            <summary className="cursor-pointer font-medium text-foreground select-none hover:text-primary transition-colors">
              {t(I18nKey.SETTINGS$SKILLS_INSTALL_MANUAL_GUIDE)}
            </summary>

            <div className="mt-3 flex flex-col gap-4 border-t border-[var(--oh-border-subtle)] pt-3">
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-foreground">
                  {t(I18nKey.SETTINGS$SKILLS_ADD_MODAL_CHAT_TITLE)}
                </h3>
                <AddSkillTransParagraph
                  i18nKey={I18nKey.SETTINGS$SKILLS_ADD_MODAL_CHAT_BODY}
                />
                <p className="text-[11px] text-tertiary-light">
                  {t(I18nKey.SETTINGS$SKILLS_ADD_MODAL_EXAMPLE_LABEL)}
                </p>
                <AddSkillExampleBlock />
                <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-tertiary-light">
                  {ADD_SKILL_STEP_KEYS.map((key) => (
                    <li key={key}>
                      {key === I18nKey.SETTINGS$SKILLS_ADD_MODAL_STEP_3 ? (
                        <Trans
                          ns="openhands"
                          i18nKey={key}
                          components={ADD_SKILL_INLINE_CODE_COMPONENTS}
                        />
                      ) : (
                        t(key)
                      )}
                    </li>
                  ))}
                </ol>
              </section>

              <section className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold text-foreground">
                  {t(I18nKey.SETTINGS$SKILLS_ADD_MODAL_URL_FORMATS_TITLE)}
                </h3>
                <p className="text-xs leading-relaxed text-tertiary-light">
                  {t(I18nKey.SETTINGS$SKILLS_ADD_MODAL_URL_FORMATS)}
                </p>
              </section>

              <section className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold text-foreground">
                  {t(I18nKey.SETTINGS$SKILLS_ADD_MODAL_STORAGE_TITLE)}
                </h3>
                <AddSkillTransParagraph
                  i18nKey={I18nKey.SETTINGS$SKILLS_ADD_MODAL_STORAGE_BODY}
                />
              </section>

              <AddSkillTransParagraph
                i18nKey={I18nKey.SETTINGS$SKILLS_ADD_MODAL_PRIVATE_REPOS}
              />

              <a
                href={ADD_SKILL_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                data-testid="add-skill-modal-docs-link"
                className="self-start text-xs text-[var(--oh-muted)] transition-colors hover:text-white hover:underline"
              >
                {t(I18nKey.SETTINGS$SKILLS_ADD_MODAL_VIEW_DOCS)}
              </a>
            </div>
          </details>
        </div>

        <footer className="flex flex-shrink-0 justify-end gap-2 px-6 pb-6 pt-4">
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="add-skill-modal-dismiss"
          >
            {t(I18nKey.BUTTON$CLOSE)}
          </BrandButton>
        </footer>
      </div>
    </ModalBackdrop>
  );
}
