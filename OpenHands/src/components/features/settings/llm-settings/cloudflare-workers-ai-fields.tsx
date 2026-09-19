import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { HelpLink } from "#/ui/help-link";
import { I18nKey } from "#/i18n/declaration";
import {
  CLOUDFLARE_API_TOKEN_DOCS_URL,
  buildCloudflareWorkersAiBaseUrl,
  parseCloudflareAccountIdFromBaseUrl,
} from "#/constants/cloudflare-workers-ai";

interface CloudflareWorkersAiFieldsProps {
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  isDisabled?: boolean;
}

export function CloudflareWorkersAiFields({
  baseUrl,
  onBaseUrlChange,
  isDisabled,
}: CloudflareWorkersAiFieldsProps) {
  const { t } = useTranslation("openhands");
  const accountId = parseCloudflareAccountIdFromBaseUrl(baseUrl) ?? "";

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="cloudflare-workers-ai-fields"
    >
      <SettingsInput
        testId="cloudflare-account-id-input"
        label={t(I18nKey.SETTINGS$CLOUDFLARE_ACCOUNT_ID)}
        type="text"
        className="w-full"
        value={accountId}
        showRequiredTag
        hint={t(I18nKey.SETTINGS$CLOUDFLARE_ACCOUNT_ID_HINT)}
        onChange={(value) => {
          const trimmed = value.trim();
          onBaseUrlChange(
            trimmed ? buildCloudflareWorkersAiBaseUrl(trimmed) : "",
          );
        }}
        isDisabled={isDisabled}
      />

      <HelpLink
        testId="cloudflare-api-token-help"
        text={t(I18nKey.SETTINGS$CLOUDFLARE_API_TOKEN_HELP)}
        linkText={t(I18nKey.SETTINGS$CLOUDFLARE_API_TOKEN_HELP_LINK)}
        href={CLOUDFLARE_API_TOKEN_DOCS_URL}
      />

      <p
        data-testid="cloudflare-credit-note"
        className="flex items-start gap-2 text-xs text-[var(--oh-muted)]"
      >
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t(I18nKey.SETTINGS$CLOUDFLARE_CREDIT_NOTE)}</span>
      </p>
    </div>
  );
}
