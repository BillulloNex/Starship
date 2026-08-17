import { redirect } from "react-router";

export const clientLoader = () => redirect("/settings/skills");

export default function SkillsRedirect() {
  return null;
}
