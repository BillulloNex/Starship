import React from "react";
import { convertRawProvidersToList } from "#/utils/convert-raw-providers-to-list";
import { useGithubConnection } from "./query/use-github-connection";
import { useSettings } from "./query/use-settings";
import { Provider } from "#/types/settings";

export const useUserProviders = () => {
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const { data: github, isLoading: isLoadingGithub } = useGithubConnection();

  const providers = React.useMemo(() => {
    const list = convertRawProvidersToList(settings?.provider_tokens_set);
    if (github?.connected && !list.includes("github")) {
      return ["github" as Provider, ...list];
    }
    return list;
  }, [settings?.provider_tokens_set, github?.connected]);

  return {
    providers,
    isLoadingSettings: isLoadingSettings || isLoadingGithub,
  };
};
