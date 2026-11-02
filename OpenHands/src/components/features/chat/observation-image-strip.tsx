import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

interface ObservationImageStripProps {
  images: string[];
}

/**
 * Images a run of tool calls produced (screenshots, generated images), shown
 * under a collapsed action group so the visual result is visible in the
 * transcript without expanding the group.
 */
export function ObservationImageStrip({ images }: ObservationImageStripProps) {
  const { t } = useTranslation("openhands");

  if (images.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="observation-image-strip"
      className="mt-2 flex flex-wrap gap-2"
    >
      {images.map((src, index) => (
        <img
          key={index}
          src={src}
          alt={t(I18nKey.OBSERVATION$TOOL_IMAGE_ALT)}
          loading="lazy"
          className="h-auto max-h-80 w-auto max-w-full rounded-lg border border-neutral-700/50 object-contain shadow-md"
        />
      ))}
    </div>
  );
}
