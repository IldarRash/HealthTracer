"use client";

/**
 * PhotoGuide — in-chat card shown when the coach requests 3 body photos.
 *
 * Design spec: body-analysis-chat-flow.md § "PhotoGuide component"
 *
 * Safety floors:
 * - The privacy block copy is verbatim from the design spec and must never be omitted.
 * - Buttons wire to the existing attachment picker (file / camera); no new upload paths.
 * - This component is purely presentational — it does not upload or process files.
 *   The parent ChatComposerAttachmentInput handles the actual upload.
 */

import type { ReactElement, ChangeEvent } from "react";
import { useRef } from "react";
import { Icon } from "../ui";
import { cn } from "../../lib/utils";
import { CHAT_ATTACHMENT_ACCEPT } from "../../lib/chat-attachment-ui-state";

// ── Angle tiles ───────────────────────────────────────────────────

type AngleTile = {
  badge: string;
  title: string;
  hint: string;
};

const ANGLE_TILES: AngleTile[] = [
  { badge: "1", title: "Спереди", hint: "руки чуть в стороны" },
  { badge: "2", title: "Сбоку", hint: "профиль, спина прямая" },
  { badge: "3", title: "Сзади", hint: "та же поза, со спины" },
];

// ── Checklist rows ────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  "Облегающая одежда или нижнее бельё — так оценка точнее",
  "Хороший ровный свет, нейтральный фон",
  "Телефон на уровне пояса, целиком в кадре",
];

// ── Props ─────────────────────────────────────────────────────────

export type PhotoGuideProps = {
  disabled?: boolean;
  className?: string;
  /**
   * Called when the user selects files from the gallery picker or camera.
   * The parent is responsible for processing and uploading the files.
   */
  onFilesSelected?: (files: File[]) => void;
};

// ── Component ─────────────────────────────────────────────────────

/**
 * Renders the in-chat photo guide card.
 *
 * The "Сделать фото" button triggers `capture="environment"` on mobile
 * and a file dialog on desktop (browsers degrade gracefully).
 * The "Загрузить из галереи" button opens a standard file picker.
 * Both buttons accept up to 3 images total using the existing MIME allow-list.
 */
export function PhotoGuide({
  disabled = false,
  className,
  onFilesSelected,
}: PhotoGuideProps): ReactElement {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    onFilesSelected?.([...files].slice(0, 3));
    // Reset so the same files can be re-selected if needed.
    event.target.value = "";
  };

  return (
    <div className={cn("photo-guide", className)} role="region" aria-label="Инструкция для фото">
      {/* Header */}
      <div className="photo-guide__header">
        <Icon name="camera" size={18} aria-hidden />
        <span className="photo-guide__heading">Нужно 3 фото с разных ракурсов</span>
      </div>

      {/* Angle tiles */}
      <div className="photo-guide__tiles" role="list" aria-label="Ракурсы съёмки">
        {ANGLE_TILES.map((tile) => (
          <div key={tile.badge} className="photo-guide__tile" role="listitem">
            <span className="photo-guide__tile-badge" aria-hidden="true">
              {tile.badge}
            </span>
            {/* Person silhouette — decorative, aria-hidden */}
            <Icon
              name="profile"
              size={28}
              className="photo-guide__tile-icon"
              aria-hidden
            />
            <span className="photo-guide__tile-title">{tile.title}</span>
            <span className="photo-guide__tile-hint">{tile.hint}</span>
          </div>
        ))}
      </div>

      {/* Checklist */}
      <ul className="photo-guide__checklist" aria-label="Требования к фото">
        {CHECKLIST_ITEMS.map((item) => (
          <li key={item} className="photo-guide__checklist-item">
            <Icon
              name="checkSm"
              size={14}
              stroke="currentColor"
              sw={2.2}
              className="photo-guide__check-icon"
              aria-hidden
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {/* Privacy block — verbatim from spec, NEVER omit */}
      <div className="photo-guide__privacy" role="note" aria-label="Конфиденциальность">
        <Icon name="lock" size={14} stroke="#3a8dff" className="photo-guide__privacy-icon" aria-hidden />
        <p className="photo-guide__privacy-text">
          Фото используются только для оценки и хранятся приватно. Их можно удалить в любой
          момент — в профиль попадут лишь цифры, не снимки.
        </p>
      </div>

      {/* Action buttons */}
      <div className="photo-guide__actions">
        {/* Camera capture input */}
        <input
          ref={cameraInputRef}
          type="file"
          accept={CHAT_ATTACHMENT_ACCEPT}
          capture="environment"
          multiple
          className="sr-only"
          disabled={disabled}
          aria-hidden="true"
          onChange={handleChange}
        />
        <button
          type="button"
          className="photo-guide__btn photo-guide__btn--accept"
          disabled={disabled}
          aria-label="Сделать фото с камеры"
          onClick={() => cameraInputRef.current?.click()}
        >
          <Icon name="camera" size={16} stroke="currentColor" aria-hidden />
          Сделать фото
        </button>

        {/* Gallery file picker */}
        <input
          ref={galleryInputRef}
          type="file"
          accept={CHAT_ATTACHMENT_ACCEPT}
          multiple
          className="sr-only"
          disabled={disabled}
          aria-hidden="true"
          onChange={handleChange}
        />
        <button
          type="button"
          className="photo-guide__btn photo-guide__btn--ghost"
          disabled={disabled}
          aria-label="Загрузить из галереи"
          onClick={() => galleryInputRef.current?.click()}
        >
          <Icon name="clip" size={16} stroke="currentColor" aria-hidden />
          Загрузить из галереи
        </button>
      </div>
    </div>
  );
}
