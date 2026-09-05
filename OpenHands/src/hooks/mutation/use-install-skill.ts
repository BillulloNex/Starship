import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  installSkillApi,
  InstallSkillParams,
  InstallSkillResponse,
} from "#/api/skills-install.api";

export function useInstallSkill() {
  const queryClient = useQueryClient();

  return useMutation<InstallSkillResponse, Error, InstallSkillParams>({
    mutationFn: installSkillApi,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
