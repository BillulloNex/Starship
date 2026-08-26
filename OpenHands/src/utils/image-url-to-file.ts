/**
 * Converts a data URL or image URL string into a File object.
 */
export async function convertImageUrlToFile(
  url: string,
  index = 0,
  fallbackFilename = "attached-image",
): Promise<File | null> {
  try {
    if (url.startsWith("data:")) {
      const mimeMatch = url.match(/^data:([^;,]+)(?:;[^,]*)?,/);
      const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : "image/png";
      const ext =
        mimeType === "image/jpeg"
          ? "jpg"
          : mimeType.split("/")[1] || "png";
      const filename = `${fallbackFilename}-${index + 1}.${ext}`;

      const res = await fetch(url);
      const blob = await res.blob();
      return new File([blob], filename, { type: mimeType });
    }

    const res = await fetch(url);
    const blob = await res.blob();
    const mimeType = blob.type || "image/png";
    const ext =
      mimeType === "image/jpeg"
        ? "jpg"
        : mimeType.split("/")[1] || "png";
    const filename = `${fallbackFilename}-${index + 1}.${ext}`;
    return new File([blob], filename, { type: mimeType });
  } catch {
    return null;
  }
}

/**
 * Converts an array of data URLs or image URLs to File objects.
 */
export async function convertImageUrlsToFiles(
  imageUrls: string[],
  fallbackFilename = "attached-image",
): Promise<File[]> {
  const files: File[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const file = await convertImageUrlToFile(imageUrls[i], i, fallbackFilename);
    if (file) {
      files.push(file);
    }
  }
  return files;
}
