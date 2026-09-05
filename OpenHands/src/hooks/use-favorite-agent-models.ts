import { useCallback, useEffect, useMemo } from "react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { useQueries } from "@tanstack/react-query";
import type { AgentProfile } from "@openhands/typescript-client";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useCursorModels } from "#/hooks/query/use-cursor-models";
import { useOpencodeModels } from "#/hooks/query/use-opencode-models";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { agentProfileDetailQueryKey } from "#/hooks/query/use-active-acp-profile-detail";
import {
  AGENT_PROFILES_RETRY_OPTIONS,
  CONFIG_CACHE_OPTIONS,
} from "#/hooks/query/query-keys";
import {
  getAcpProvider,
  labelForAcpModel,
  resolveAcpProviderKey,
} from "#/constants/acp-providers";
import { formatModelNameForDisplay } from "#/utils/format-model-name";

export const FAVORITE_AGENT_MODELS_KEY = "oh:favorite-agent-models";

export interface FavoriteAgentModel {
  agentProfileId: string;
  modelId?: string;
}

export interface ResolvedFavoriteAgentModel extends FavoriteAgentModel {
  agentName: string;
  agentKind: "openhands" | "acp";
  modelLabel: string;
}

export function getFavoriteAgentModelsKey(
  backendId: string,
  orgId: string | null,
): string {
  return `${FAVORITE_AGENT_MODELS_KEY}:${backendId}:${orgId ?? "-"}`;
}

export function sanitizeFavoriteAgentModels(
  value: unknown,
): FavoriteAgentModel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: FavoriteAgentModel[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const { agentProfileId, modelId } = item as Record<string, unknown>;
    if (typeof agentProfileId !== "string" || !agentProfileId) return;
    if (modelId !== undefined && typeof modelId !== "string") return;
    const key = `${agentProfileId}\u0000${modelId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      agentProfileId,
      ...(typeof modelId === "string" && modelId ? { modelId } : {}),
    });
  });
  return result;
}

function sameFavorite(a: FavoriteAgentModel, b: FavoriteAgentModel) {
  return a.agentProfileId === b.agentProfileId && a.modelId === b.modelId;
}

/** Browser-local, backend-scoped favorite agent + model combinations. */
export function useFavoriteAgentModels() {
  const { backend, orgId } = useActiveBackend();
  const { data: agentProfiles } = useAgentProfiles();
  const { data: llmProfiles } = useLlmProfiles();
  const profiles = agentProfiles?.profiles ?? [];
  const acpProfiles = profiles.filter(
    (profile) => profile.id && profile.agent_kind === "acp",
  );
  const detailQueries = useQueries({
    queries: acpProfiles.map((profile) => ({
      queryKey: agentProfileDetailQueryKey(backend.id, orgId, profile.name),
      queryFn: () => AgentProfilesService.getProfile(profile.name),
      ...CONFIG_CACHE_OPTIONS,
      ...AGENT_PROFILES_RETRY_OPTIONS,
      meta: { disableToast: true },
    })),
  });
  const details = new Map<string, AgentProfile>();
  detailQueries.forEach((query) => {
    const profile = query.data?.profile;
    if (profile) details.set(profile.id, profile);
  });
  const isDetailPending = detailQueries.some((query) => query.isPending);
  const hasCursor = [...details.values()].some(
    (profile) =>
      profile.agent_kind === "acp" &&
      resolveAcpProviderKey(profile.acp_server, profile.acp_command) ===
        "cursor",
  );
  const { data: cursorCatalog, isPending: isCursorCatalogPending } =
    useCursorModels(hasCursor);
  const hasOpencode = [...details.values()].some(
    (profile) =>
      profile.agent_kind === "acp" &&
      resolveAcpProviderKey(profile.acp_server, profile.acp_command) ===
        "opencode",
  );
  const { data: opencodeCatalog, isPending: isOpencodeCatalogPending } =
    useOpencodeModels(hasOpencode);
  const [rawFavorites, setRawFavorites] = useLocalStorage<FavoriteAgentModel[]>(
    getFavoriteAgentModelsKey(backend.id, orgId),
    [],
  );
  const favorites = useMemo(
    () => sanitizeFavoriteAgentModels(rawFavorites),
    [rawFavorites],
  );

  const resolvedFavorites = useMemo(() => {
    const llmByName = new Map(
      (llmProfiles?.profiles ?? []).map((profile) => [profile.name, profile]),
    );
    return favorites.flatMap<ResolvedFavoriteAgentModel>((favorite) => {
      const profile = profiles.find(
        (candidate) => candidate.id === favorite.agentProfileId,
      );
      if (!profile?.id || !favorite.modelId) return [];
      if (profile.agent_kind === "openhands") {
        const llm = llmByName.get(favorite.modelId);
        if (!llm) return [];
        return [
          {
            ...favorite,
            agentName: profile.name,
            agentKind: "openhands",
            modelLabel:
              formatModelNameForDisplay(llm.model) || favorite.modelId,
          },
        ];
      }
      const detail = details.get(profile.id);
      if (detail?.agent_kind !== "acp") return [];
      const providerKey = resolveAcpProviderKey(
        detail.acp_server,
        detail.acp_command,
      );
      const catalog =
        providerKey === "cursor"
          ? (cursorCatalog?.models ?? [])
          : providerKey === "opencode"
            ? (opencodeCatalog?.models ??
              getAcpProvider(providerKey)?.available_models ??
              [])
            : (getAcpProvider(providerKey)?.available_models ?? []);
      const option = catalog.find((model) => model.id === favorite.modelId);
      if (!option) return [];
      return [
        {
          ...favorite,
          agentName: profile.name,
          agentKind: "acp",
          modelLabel:
            option.label ??
            labelForAcpModel(providerKey, favorite.modelId) ??
            favorite.modelId,
        },
      ];
    });
  }, [
    cursorCatalog?.models,
    opencodeCatalog?.models,
    details,
    favorites,
    llmProfiles?.profiles,
    profiles,
  ]);

  useEffect(() => {
    // Wait until every required live catalog has settled before pruning.
    if (
      !agentProfiles ||
      !llmProfiles ||
      isDetailPending ||
      (hasCursor && isCursorCatalogPending) ||
      (hasOpencode && isOpencodeCatalogPending)
    ) {
      return;
    }
    const next = resolvedFavorites.map(({ agentProfileId, modelId }) => ({
      agentProfileId,
      ...(modelId ? { modelId } : {}),
    }));
    if (
      next.length !== favorites.length ||
      next.some((favorite, index) => !sameFavorite(favorite, favorites[index]))
    ) {
      setRawFavorites(next);
    }
  }, [
    agentProfiles,
    favorites,
    hasCursor,
    isDetailPending,
    isCursorCatalogPending,
    llmProfiles,
    resolvedFavorites,
    setRawFavorites,
  ]);

  const isFavorite = useCallback(
    (favorite: FavoriteAgentModel) =>
      favorites.some((candidate) => sameFavorite(candidate, favorite)),
    [favorites],
  );
  const toggleFavorite = useCallback(
    (favorite: FavoriteAgentModel) => {
      setRawFavorites((current) => {
        const sanitized = sanitizeFavoriteAgentModels(current);
        return sanitized.some((candidate) => sameFavorite(candidate, favorite))
          ? sanitized.filter((candidate) => !sameFavorite(candidate, favorite))
          : [...sanitized, favorite];
      });
    },
    [setRawFavorites],
  );

  return {
    profiles,
    activeAgentProfileId: agentProfiles?.active_agent_profile_id ?? null,
    resolvedFavorites,
    isFavorite,
    toggleFavorite,
  };
}
