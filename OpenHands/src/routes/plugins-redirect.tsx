import { redirect } from "react-router";

export const clientLoader = () => redirect("/settings/plugins");

export default function PluginsRedirect() {
  return null;
}
