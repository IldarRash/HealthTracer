type ChatDateSeparatorProps = {
  label: string;
  /** ISO datetime used as accessible machine-readable value on the <time> element. */
  dateTime: string;
};

/**
 * Centered muted micro-label shown between messages on day boundary.
 * Replaces per-bubble in-line timestamps in the transcript.
 */
export function ChatDateSeparator({ label, dateTime }: ChatDateSeparatorProps) {
  return (
    <li className="chat-date-separator" aria-hidden="false">
      <time className="chat-date-separator__label" dateTime={dateTime}>
        {label}
      </time>
    </li>
  );
}
