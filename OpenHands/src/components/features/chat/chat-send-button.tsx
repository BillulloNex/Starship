import { ArrowUp } from "lucide-react";
import { cn } from "#/utils/utils";

export interface ChatSendButtonProps {
  buttonClassName: string;
  handleSubmit: () => void;
  disabled: boolean;
}

export function ChatSendButton({
  buttonClassName,
  handleSubmit,
  disabled,
}: ChatSendButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-center rounded-full size-8 transition-all shrink-0",
        disabled
          ? "cursor-not-allowed bg-white/5 border border-white/10 text-[var(--oh-muted)] opacity-50"
          : "cursor-pointer bg-[var(--oh-color-primary)] text-black shadow-md hover:scale-105 active:scale-95 hover:opacity-90",
        buttonClassName,
      )}
      data-name="arrow-up-circle-fill"
      data-testid="submit-button"
      onClick={handleSubmit}
      disabled={disabled}
      aria-label="Send message"
    >
      <ArrowUp
        className="w-4 h-4 stroke-[2.5]"
        color={disabled ? "var(--oh-muted)" : "currentColor"}
      />
    </button>
  );
}
