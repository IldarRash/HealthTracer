import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type DetailLineListProps = HTMLAttributes<HTMLUListElement> & {
  lines: readonly string[];
};

export function DetailLineList({ lines, className, ...props }: DetailLineListProps) {
  if (lines.length === 0) {
    return null;
  }

  return (
    <ul className={cn("detail-line-list", className)} {...props}>
      {lines.map((line) => (
        <li key={line} className="muted-text">
          {line}
        </li>
      ))}
    </ul>
  );
}
