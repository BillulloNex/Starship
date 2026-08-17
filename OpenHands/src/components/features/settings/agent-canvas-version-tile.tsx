interface AgentCanvasVersionTileProps {
  className?: string;
  /** When true, the tile is omitted unless an update is available. */
  hideWhenUpToDate?: boolean;
}

/**
 * Main-sidebar tile that opens the update-specific version modal.
 * Disabled in Grokbot: Grokbot handles versioning and updates via its own
 * repository and deployment pipeline rather than upstream npm packages.
 */
export function AgentCanvasVersionTile(
  _props: AgentCanvasVersionTileProps = {},
) {
  return null;
}

