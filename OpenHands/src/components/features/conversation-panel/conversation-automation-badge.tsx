import { Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  CONVERSATION_CARD_META_CHIP_CLASSNAME,
  CONVERSATION_CARD_META_CHIP_ICON_CLASSNAME,
  CONVERSATION_CARD_META_CHIP_ICON_SLOT_CLASSNAME,
} from "./conversation-card/conversation-card-meta-chip";

interface ConversationAutomationBadgeProps {
  label: string;
}

export function ConversationAutomationBadge({
  label,
}: ConversationAutomationBadgeProps) {
  const { t } = useTranslation("openhands");
  const ariaLabel = t(I18nKey.CONVERSATION_PANEL$AUTOMATION_BADGE_LABEL, {
    name: label,
  });

  return (
    <span
      data-testid="conversation-automation-badge"
      title={ariaLabel}
      aria-label={ariaLabel}
      className={CONVERSATION_CARD_META_CHIP_CLASSNAME}
    >
      <span className={CONVERSATION_CARD_META_CHIP_ICON_SLOT_CLASSNAME}>
        <Workflow
          className={CONVERSATION_CARD_META_CHIP_ICON_CLASSNAME}
          aria-hidden
          strokeWidth={2}
        />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
