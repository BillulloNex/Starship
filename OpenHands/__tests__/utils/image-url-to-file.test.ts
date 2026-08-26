import { describe, it, expect, vi } from "vitest";
import {
  convertImageUrlToFile,
  convertImageUrlsToFiles,
} from "#/utils/image-url-to-file";

describe("image-url-to-file", () => {
  it("converts a base64 data URL to a File", async () => {
    // 1x1 transparent PNG data URL
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const file = await convertImageUrlToFile(dataUrl, 0, "test-img");
    expect(file).not.toBeNull();
    expect(file?.name).toBe("test-img-1.png");
    expect(file?.type).toBe("image/png");
    expect(file?.size).toBeGreaterThan(0);
  });

  it("converts jpeg base64 data URL with jpg extension", async () => {
    const dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/";
    const file = await convertImageUrlToFile(dataUrl, 1, "test-jpeg");
    expect(file).not.toBeNull();
    expect(file?.name).toBe("test-jpeg-2.jpg");
    expect(file?.type).toBe("image/jpeg");
  });

  it("converts an array of image URLs", async () => {
    const dataUrls = [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    ];

    const files = await convertImageUrlsToFiles(dataUrls);
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("attached-image-1.png");
    expect(files[1].name).toBe("attached-image-2.png");
  });

  it("returns null gracefully if conversion fails", async () => {
    // Mock fetch to throw
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    try {
      const file = await convertImageUrlToFile("https://example.com/bad.png");
      expect(file).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
