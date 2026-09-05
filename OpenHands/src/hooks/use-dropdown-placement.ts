import React from "react";

export type DropdownPlacement = "top" | "bottom";

export interface UseDropdownPlacementOptions {
  /**
   * Whether the dropdown popover is currently open.
   */
  isOpen: boolean;
  /**
   * Minimum space in pixels required below the trigger to keep pointing down.
   * If space below is less than this and there is more space above,
   * placement flips to "top".
   * Defaults to 300px.
   */
  minSpaceBelow?: number;
}

/**
 * Dynamically determines whether a dropdown menu should point up ("top") or down ("bottom").
 * - Points up when near the bottom of the screen with insufficient space below.
 * - Keeps pointing down when in the middle of the screen or when there is ample space below.
 */
export function useDropdownPlacement(
  triggerRef: React.RefObject<HTMLElement | null>,
  options: UseDropdownPlacementOptions,
): {
  placement: DropdownPlacement;
  updatePlacement: () => void;
} {
  const { isOpen, minSpaceBelow = 300 } = options;
  const [placement, setPlacement] = React.useState<DropdownPlacement>("bottom");

  const updatePlacement = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < minSpaceBelow && spaceAbove > spaceBelow) {
      setPlacement("top");
    } else {
      setPlacement("bottom");
    }
  }, [triggerRef, minSpaceBelow]);

  React.useLayoutEffect(() => {
    if (!isOpen) return undefined;
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [isOpen, updatePlacement]);

  return { placement, updatePlacement };
}
