import { redirect } from "react-router";

export const clientLoader = () => redirect("/settings/mcp");

export default function McpRedirect() {
  return null;
}
