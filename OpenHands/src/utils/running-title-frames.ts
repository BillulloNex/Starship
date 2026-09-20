/**
 * Braille spinner frames for the browser tab title while the agent is running.
 * Browsers cannot CSS-animate the tab chrome; cycling `document.title` is the
 * supported way to make a background tab look alive.
 */
export const RUNNING_TITLE_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

export const RUNNING_TITLE_FRAME_MS = 200;

export function formatRunningTitle(
  baseTitle: string,
  frameIndex: number,
): string {
  const frame = RUNNING_TITLE_FRAMES[frameIndex % RUNNING_TITLE_FRAMES.length];
  return `${frame} ${baseTitle}`;
}

export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
