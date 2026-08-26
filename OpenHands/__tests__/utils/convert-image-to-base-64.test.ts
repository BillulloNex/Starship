import { describe, it, expect, vi } from "vitest";
import {
  convertImageToBase64,
  SUPPORTED_LLM_IMAGE_TYPES,
} from "#/utils/convert-image-to-base-64";

describe("convertImageToBase64", () => {
  it("defines standard supported LLM image types", () => {
    expect(SUPPORTED_LLM_IMAGE_TYPES.has("image/jpeg")).toBe(true);
    expect(SUPPORTED_LLM_IMAGE_TYPES.has("image/png")).toBe(true);
    expect(SUPPORTED_LLM_IMAGE_TYPES.has("image/gif")).toBe(true);
    expect(SUPPORTED_LLM_IMAGE_TYPES.has("image/webp")).toBe(true);
    expect(SUPPORTED_LLM_IMAGE_TYPES.has("image/avif")).toBe(false);
  });

  it("reads supported formats directly as data URL", async () => {
    const pngFile = new File(["fake-png-data"], "test.png", {
      type: "image/png",
    });
    const result = await convertImageToBase64(pngFile);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it("handles AVIF files gracefully and returns base64", async () => {
    const avifFile = new File(["fake-avif-data"], "test.avif", {
      type: "image/avif",
    });
    const result = await convertImageToBase64(avifFile);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("converts unsupported format to PNG using canvas when available", async () => {
    const mockToDataURL = vi.fn().mockReturnValue("data:image/png;base64,converted-png");
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          getContext: vi.fn().mockReturnValue({
            drawImage: vi.fn(),
          }),
          toDataURL: mockToDataURL,
          width: 100,
          height: 100,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    // Mock createImageBitmap
    const originalCreateImageBitmap = window.createImageBitmap;
    window.createImageBitmap = vi.fn().mockResolvedValue({
      width: 100,
      height: 100,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    try {
      const avifFile = new File(["fake-avif-data"], "photo.avif", {
        type: "image/avif",
      });
      const result = await convertImageToBase64(avifFile);
      expect(result).toBe("data:image/png;base64,converted-png");
      expect(mockToDataURL).toHaveBeenCalledWith("image/png");
    } finally {
      window.createImageBitmap = originalCreateImageBitmap;
      vi.restoreAllMocks();
    }
  });
});
