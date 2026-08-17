import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Clipboard, Check } from "lucide-react";
import { cn } from "#/utils/utils";
import { formControlMultilineFieldClassName } from "#/utils/form-control-classes";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { OptionalTag } from "#/components/features/settings/optional-tag";
import { I18nKey } from "#/i18n/declaration";
import { type ACPProviderSecretField } from "#/constants/acp-providers";

interface AcpSecretFieldProps {
  field: ACPProviderSecretField;
  value: string;
  onChange: (value: string) => void;
  alreadySet: boolean;
  testId: string;
  showOptionalTag?: boolean;
}

/**
 * Renders a single ACP credential field — a multiline textarea for file-content
 * blobs (Codex auth.json, Gemini SA JSON) or a masked/plain {@link SettingsInput}
 * for everything else — plus its hint text. Used by both the onboarding
 * credentials step and the Settings → Agent credentials section.
 */
export function AcpSecretField({
  field,
  value,
  onChange,
  alreadySet,
  testId,
  showOptionalTag,
}: AcpSecretFieldProps) {
  const { t } = useTranslation("openhands");
  const [justPasted, setJustPasted] = useState(false);

  const placeholder = alreadySet
    ? t(I18nKey.ONBOARDING$ACP_SECRET_ALREADY_SET)
    : "";

  const handlePaste = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          onChange(text);
          setJustPasted(true);
          setTimeout(() => setJustPasted(false), 2000);
        }
      }
    } catch {
      // Ignore clipboard permission issues
    }
  };

  const isClaudeOAuth = field.name === "CLAUDE_CODE_OAUTH_TOKEN";
  const isCodexAuth = field.name === "CODEX_AUTH_JSON";

  return (
    <div className="flex flex-col gap-1.5">
      {/* Quick OAuth action helpers */}
      {(isClaudeOAuth || isCodexAuth) && (
        <div className="flex items-center justify-between text-xs pb-0.5">
          <div className="flex items-center gap-2">
            {isClaudeOAuth && (
              <a
                href="https://claude.ai/login"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[var(--oh-primary,#6366f1)] hover:underline font-medium"
              >
                <span>Authorize Claude</span>
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={handlePaste}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-base border border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-white hover:border-[var(--oh-border-strong)] transition-colors cursor-pointer"
            title="Paste token from clipboard"
          >
            {justPasted ? (
              <>
                <Check className="size-3 text-emerald-400" />
                <span className="text-emerald-400">Pasted</span>
              </>
            ) : (
              <>
                <Clipboard className="size-3" />
                <span>Paste</span>
              </>
            )}
          </button>
        </div>
      )}

      {field.multiline ? (
        <label className="flex flex-col gap-2.5">
          <span className="flex items-center gap-2">
            <span className="text-sm font-mono text-white">{field.name}</span>
            {showOptionalTag && <OptionalTag />}
          </span>
          <textarea
            data-testid={testId}
            name={field.name}
            rows={4}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              formControlMultilineFieldClassName,
              "font-mono text-xs",
            )}
          />
        </label>
      ) : (
        <SettingsInput
          testId={testId}
          name={field.name}
          label={field.name}
          labelClassName="font-mono"
          type={field.secret ? "password" : "text"}
          value={value}
          onChange={onChange}
          showOptionalTag={showOptionalTag}
          placeholder={placeholder}
        />
      )}
      <span className="text-xs text-[var(--oh-muted)]">
        {t(field.hint_key, field.hint_values)}
      </span>
    </div>
  );
}
