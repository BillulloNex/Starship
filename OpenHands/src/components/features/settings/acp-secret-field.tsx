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
 * Extract an OAuth token from various formats:
 * - Plain token string (e.g. "sk-ant-oat01-...")
 * - Bearer prefixed string ("Bearer sk-ant-oat...")
 * - JSON config blob (e.g. ~/.claude.json or {"oauthAccount": {"oauthToken": "..."}})
 * - Quoted token strings
 */
export function extractClaudeOAuthToken(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // 1. Try parsing as JSON if it looks like a JSON object
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed.oauthAccount?.oauthToken &&
        typeof parsed.oauthAccount.oauthToken === "string"
      ) {
        return parsed.oauthAccount.oauthToken.trim();
      }
      if (parsed.oauthToken && typeof parsed.oauthToken === "string") {
        return parsed.oauthToken.trim();
      }
      if (
        parsed.tokens?.access_token &&
        typeof parsed.tokens.access_token === "string"
      ) {
        return parsed.tokens.access_token.trim();
      }
      if (parsed.access_token && typeof parsed.access_token === "string") {
        return parsed.access_token.trim();
      }
      if (parsed.accessToken && typeof parsed.accessToken === "string") {
        return parsed.accessToken.trim();
      }
      if (parsed.sessionKey && typeof parsed.sessionKey === "string") {
        return parsed.sessionKey.trim();
      }
    } catch {
      // JSON parse failed, fall through to regex extraction
    }
  }

  // 2. Extract sk-ant-oat token via regex if present in terminal output / text
  const oatMatch = trimmed.match(/(sk-ant-oat[0-9a-zA-Z_-]+)/);
  if (oatMatch && oatMatch[1]) {
    return oatMatch[1];
  }

  // 3. Handle "Bearer <token>" prefix
  if (trimmed.startsWith("Bearer ")) {
    return trimmed.slice(7).trim();
  }

  // 4. Strip surrounding quotes if present
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
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
  const [copiedCmd, setCopiedCmd] = useState(false);

  const placeholder = alreadySet
    ? t(I18nKey.ONBOARDING$ACP_SECRET_ALREADY_SET)
    : "";

  const isClaudeOAuth = field.name === "CLAUDE_CODE_OAUTH_TOKEN";
  const isCodexAuth = field.name === "CODEX_AUTH_JSON";
  const isAntigravityAuth = field.name === "ANTIGRAVITY_AUTH_JSON";

  const handleValueChange = (raw: string) => {
    if (isClaudeOAuth) {
      onChange(extractClaudeOAuthToken(raw));
    } else {
      onChange(raw);
    }
  };

  const handlePaste = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          handleValueChange(text);
          setJustPasted(true);
          setTimeout(() => setJustPasted(false), 2000);
        }
      }
    } catch {
      // Ignore clipboard permission issues
    }
  };

  const handleCopyClaudeCmd = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText("claude setup-token");
        setCopiedCmd(true);
        setTimeout(() => setCopiedCmd(false), 2000);
      }
    } catch {
      // Ignore clipboard permission issues
    }
  };

  const handleCopyAntigravityCmd = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          "cat ~/.gemini/oauth_creds.json | pbcopy",
        );
        setCopiedCmd(true);
        setTimeout(() => setCopiedCmd(false), 2000);
      }
    } catch {
      // Ignore clipboard permission issues
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Quick OAuth action helpers */}
      {(isClaudeOAuth || isCodexAuth || isAntigravityAuth) && (
        <div className="flex items-center justify-between text-xs pb-0.5">
          <div className="flex items-center gap-2">
            {isClaudeOAuth && (
              <>
                <a
                  href="https://claude.ai/login"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-[var(--oh-primary,#6366f1)] hover:underline font-medium"
                >
                  <span>Authorize Claude</span>
                  <ExternalLink className="size-3" />
                </a>
                <button
                  type="button"
                  onClick={handleCopyClaudeCmd}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-base border border-[var(--oh-border)] text-[11px] text-[var(--oh-muted)] hover:text-white hover:border-[var(--oh-border-strong)] transition-colors cursor-pointer"
                  title="Copy terminal command: claude setup-token"
                >
                  {copiedCmd ? (
                    <>
                      <Check className="size-2.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied cmd</span>
                    </>
                  ) : (
                    <span>claude setup-token</span>
                  )}
                </button>
              </>
            )}
            {isAntigravityAuth && (
              <button
                type="button"
                onClick={handleCopyAntigravityCmd}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-base border border-[var(--oh-border)] text-[11px] text-[var(--oh-muted)] hover:text-white hover:border-[var(--oh-border-strong)] transition-colors cursor-pointer"
                title="Copy terminal command: cat ~/.gemini/oauth_creds.json | pbcopy"
              >
                {copiedCmd ? (
                  <>
                    <Check className="size-2.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied cmd</span>
                  </>
                ) : (
                  <span>cat ~/.gemini/oauth_creds.json | pbcopy</span>
                )}
              </button>
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
            onChange={(e) => handleValueChange(e.target.value)}
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
          onChange={handleValueChange}
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
