export const SUPPORTED_LLM_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function readFileAsDataURL(file: Blob | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function convertImageFileToDataURL(
  file: File,
  targetMimeType = "image/png",
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return readFileAsDataURL(file);
  }

  // Method 1: Using createImageBitmap (fastest & native browser decoder)
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          return canvas.toDataURL(targetMimeType);
        }
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall through to Image element fallback
    }
  }

  // Method 2: Using HTMLImageElement with ObjectURL and safety timeout
  if (
    typeof Image === "function" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          // Fallback if image onload never fires (e.g. happy-dom/test environments)
          readFileAsDataURL(file).then(resolve).catch(reject);
        }, 1000);

        try {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            clearTimeout(timer);
            URL.revokeObjectURL(url);
            try {
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                readFileAsDataURL(file).then(resolve).catch(reject);
                return;
              }
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL(targetMimeType));
            } catch {
              readFileAsDataURL(file).then(resolve).catch(reject);
            }
          };
          img.onerror = () => {
            clearTimeout(timer);
            URL.revokeObjectURL(url);
            readFileAsDataURL(file).then(resolve).catch(reject);
          };
          img.src = url;
        } catch {
          clearTimeout(timer);
          readFileAsDataURL(file).then(resolve).catch(reject);
        }
      });
    } catch {
      return readFileAsDataURL(file);
    }
  }

  return readFileAsDataURL(file);
}

/**
 * Converts an image file to a Base64 data URL.
 * If the image format is not natively accepted by LLM vision models (such as
 * AVIF, BMP, etc.), it is automatically transcoded to PNG via canvas so the
 * LLM backend receives a valid, supported image payload.
 */
export const convertImageToBase64 = async (file: File): Promise<string> => {
  const mimeType = (file.type || "").toLowerCase();
  if (SUPPORTED_LLM_IMAGE_TYPES.has(mimeType)) {
    return readFileAsDataURL(file);
  }
  return convertImageFileToDataURL(file, "image/png");
};

