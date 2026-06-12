import { type HTMLAttributes } from "react";
import { Badge, type BadgeProps } from "./badge";
import { Icon } from "./icon";

type AttachmentPreviewThumbProps = {
  previewUrl: string | null;
  fileName: string;
  thumbClassName?: string;
  iconClassName?: string;
};

export function AttachmentPreviewThumb({
  previewUrl,
  fileName,
  thumbClassName,
  iconClassName,
}: AttachmentPreviewThumbProps) {
  if (previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={`Preview of ${fileName}`}
        className={thumbClassName}
      />
    );
  }

  return (
    <span className={iconClassName} role="img" aria-label={`${fileName} file`}>
      <Icon name="doc" size={20} aria-hidden />
    </span>
  );
}

type AttachmentStatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  label: string;
  tone: NonNullable<BadgeProps["tone"]>;
  contextLabel?: string;
};

export function AttachmentStatusBadge({
  label,
  tone,
  contextLabel,
  className,
  ...props
}: AttachmentStatusBadgeProps) {
  const ariaLabel = contextLabel ? `${label} for ${contextLabel}` : label;

  return (
    <Badge tone={tone} className={className} aria-label={ariaLabel} {...props}>
      {label}
    </Badge>
  );
}
