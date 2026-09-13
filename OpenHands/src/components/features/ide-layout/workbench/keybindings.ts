export interface Keybinding {
  /** `KeyboardEvent.code`, e.g. "KeyP" or "Backquote". */
  code: string;
  /** ⌘ on macOS, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** A literal Control key, on every platform (e.g. ⌃`). */
  ctrl?: boolean;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

type KeyboardEventLike = Pick<
  KeyboardEvent,
  "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

export function matchesKeybinding(
  event: KeyboardEventLike,
  binding: Keybinding,
  isMac: boolean,
): boolean {
  if (event.code !== binding.code) return false;

  const wantMeta = isMac && !!binding.mod;
  const wantCtrl = (!isMac && !!binding.mod) || !!binding.ctrl;

  return (
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    event.shiftKey === !!binding.shift &&
    event.altKey === !!binding.alt
  );
}

const KEY_LABELS: Record<string, string> = {
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Enter: "↵",
};

function keyLabel(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function formatKeybinding(binding: Keybinding, isMac: boolean): string {
  const key = keyLabel(binding.code);
  if (isMac) {
    return [
      binding.ctrl ? "⌃" : "",
      binding.alt ? "⌥" : "",
      binding.shift ? "⇧" : "",
      binding.mod ? "⌘" : "",
      key,
    ].join("");
  }
  return [
    binding.mod || binding.ctrl ? "Ctrl" : "",
    binding.alt ? "Alt" : "",
    binding.shift ? "Shift" : "",
    key,
  ]
    .filter(Boolean)
    .join("+");
}
