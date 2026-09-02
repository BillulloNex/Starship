/* eslint-disable i18next/no-literal-string */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useCallback, useEffect, useState } from "react";
import { cn } from "#/utils/utils";

interface ResizableSplitterProps {
  onResize: (width: number) => void;
  onReset?: () => void;
  className?: string;
}

export function ResizableSplitter({
  onResize,
  onReset,
  className,
}: ResizableSplitterProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      onResize(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, onResize]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize, double-click to reset"
      data-testid="ide-sidebar-splitter"
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      className={cn(
        "relative w-1.5 hover:w-1.5 shrink-0 bg-transparent hover:bg-[var(--oh-interactive)]/40 cursor-col-resize transition-colors select-none z-10",
        isDragging && "bg-[var(--oh-interactive)] w-1.5",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-px bg-[var(--oh-border)]",
          isDragging && "bg-[var(--oh-interactive)]",
        )}
      />
    </div>
  );
}
