import {
  formatKeybinding,
  isMacPlatform,
  type Keybinding,
} from "../workbench/keybindings";
import {
  getToggleViewModeKeybinding,
  KEYBINDINGS,
} from "../workbench/commands";

/** Empty-editor hints, in the spirit of VS Code's watermark. */
export function EditorWatermark() {
  const isMac = isMacPlatform();

  const hints: { label: string; keybinding: Keybinding }[] = [
    { label: "Go to File", keybinding: KEYBINDINGS.quickOpen },
    { label: "Show All Commands", keybinding: KEYBINDINGS.commandPalette },
    { label: "Toggle Explorer", keybinding: KEYBINDINGS.toggleExplorer },
    { label: "Toggle Terminal", keybinding: KEYBINDINGS.toggleTerminal },
    { label: "Toggle Chat", keybinding: KEYBINDINGS.toggleChat },
    {
      label: "Switch to Agent View",
      keybinding: getToggleViewModeKeybinding(isMac),
    },
  ];

  return (
    <div
      data-testid="editor-watermark"
      className="flex h-full w-full items-center justify-center"
    >
      <dl className="grid grid-cols-[auto_auto] items-center gap-x-6 gap-y-2.5 text-xs">
        {hints.map(({ label, keybinding }) => (
          <div key={label} className="contents">
            <dt className="text-right text-[var(--oh-muted)]">{label}</dt>
            <dd>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-[var(--oh-text-tertiary)]">
                {formatKeybinding(keybinding, isMac)}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
