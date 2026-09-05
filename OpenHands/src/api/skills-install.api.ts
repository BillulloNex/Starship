import axios from "axios";

export interface InstallSkillParams {
  input: string;
  scope?: "personal" | "project";
  projectDir?: string;
}

export interface InstallSkillResponse {
  success: boolean;
  skillName: string;
  packageSpec: string;
  scope: "personal" | "project";
  output?: string;
  message?: string;
}

export async function installSkillApi(
  params: InstallSkillParams,
): Promise<InstallSkillResponse> {
  const response = await axios.post<InstallSkillResponse>(
    "/api/skills/install",
    params,
  );
  return response.data;
}
