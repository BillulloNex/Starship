import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useDropdownPlacement } from "./use-dropdown-placement";

describe("useDropdownPlacement", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 900,
    });
  });

  it("defaults to bottom placement", () => {
    const triggerRef = { current: null };
    const { result } = renderHook(() =>
      useDropdownPlacement(triggerRef, { isOpen: false }),
    );
    expect(result.current.placement).toBe("bottom");
  });

  it("points up (top) when on the bottom of the screen with low space below", () => {
    const mockElement = {
      getBoundingClientRect: () => ({
        top: 750,
        bottom: 820,
        left: 100,
        right: 200,
        width: 100,
        height: 70,
        x: 100,
        y: 750,
        toJSON: () => {},
      }),
    } as unknown as HTMLElement;

    const triggerRef = { current: mockElement };
    const { result } = renderHook(() =>
      useDropdownPlacement(triggerRef, { isOpen: true }),
    );

    expect(result.current.placement).toBe("top");
  });

  it("keeps pointing down (bottom) when in the middle of the screen", () => {
    const mockElement = {
      getBoundingClientRect: () => ({
        top: 400,
        bottom: 450,
        left: 100,
        right: 200,
        width: 100,
        height: 50,
        x: 100,
        y: 400,
        toJSON: () => {},
      }),
    } as unknown as HTMLElement;

    const triggerRef = { current: mockElement };
    const { result } = renderHook(() =>
      useDropdownPlacement(triggerRef, { isOpen: true }),
    );

    expect(result.current.placement).toBe("bottom");
  });

  it("dynamically flips placement on resize or scroll", () => {
    let top = 400;
    let bottom = 450;

    const mockElement = {
      getBoundingClientRect: () => ({
        top,
        bottom,
        left: 100,
        right: 200,
        width: 100,
        height: 50,
        x: 100,
        y: top,
        toJSON: () => {},
      }),
    } as unknown as HTMLElement;

    const triggerRef = { current: mockElement };
    const { result } = renderHook(() =>
      useDropdownPlacement(triggerRef, { isOpen: true }),
    );

    expect(result.current.placement).toBe("bottom");

    // Move trigger to bottom of screen
    top = 800;
    bottom = 850;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.placement).toBe("top");
  });
});
