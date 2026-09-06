import { Star } from "lucide-react";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { useApplyFavoriteAgentModel } from "#/hooks/use-apply-favorite-agent-model";
import { useFavoriteAgentModels } from "#/hooks/use-favorite-agent-models";
import { useChatInputProfileState } from "#/hooks/use-chat-input-profile-state";
import { Divider } from "#/ui/divider";
import { Typography } from "#/ui/typography";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

export function FavoriteAgentModelsSection({
  onClose,
  dividerInset,
}: {
  onClose: () => void;
  dividerInset?: "menu";
}) {
  const { resolvedFavorites, toggleFavorite } = useFavoriteAgentModels();
  const { t } = useTranslation("openhands");
  const { currentProfileId, isSwitching } = useChatInputProfileState();
  const applyFavorite = useApplyFavoriteAgentModel();

  if (resolvedFavorites.length === 0) return null;

  return (
    <>
      <li role="presentation" className="px-2 pt-1 pb-0.5">
        <Typography.Text className="text-[11px] font-medium text-[var(--oh-text-dim)] uppercase tracking-wide leading-4">
          {t(I18nKey.HOME$FAVORITES)}
        </Typography.Text>
      </li>
        {resolvedFavorites.map((favorite) => (
          <ContextMenuListItem
            key={`${favorite.agentProfileId}:${favorite.modelId}`}
            testId={`favorite-agent-model-${favorite.agentProfileId}-${favorite.modelId}`}
            isDisabled={isSwitching}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
              void applyFavorite(favorite, currentProfileId).catch(() => {});
            }}
            className="flex items-center gap-2"
          >
            <span
              className="flex-1 truncate text-sm leading-5"
              title={`${favorite.agentName} — ${favorite.modelLabel}`}
            >
              {favorite.agentName} — {favorite.modelLabel}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`${t(I18nKey.HOME$FAVORITES)}: ${favorite.agentName} — ${favorite.modelLabel}`}
              className="shrink-0 rounded p-0.5 text-[var(--oh-sticker-star)] hover:bg-white/10"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(favorite);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(favorite);
              }}
            >
              <Star size={15} fill="currentColor" aria-hidden />
            </span>
          </ContextMenuListItem>
        ))}
      <Divider inset={dividerInset} />
    </>
  );
}
