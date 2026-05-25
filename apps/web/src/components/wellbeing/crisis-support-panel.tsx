import type { WellbeingCrisisSupportCopy } from "@health/types";
import { ChatMetadataPanel } from "../ui";

type CrisisSupportPanelProps = {
  copy: WellbeingCrisisSupportCopy;
  titleId?: string;
};

export function CrisisSupportPanel({
  copy,
  titleId = "wellbeing-crisis-title",
}: CrisisSupportPanelProps) {
  return (
    <ChatMetadataPanel
      title={copy.title}
      titleId={titleId}
      tone="crisis"
      className="wellbeing-crisis-panel"
    >
      <p>{copy.message}</p>
      <ul className="wellbeing-crisis-resources">
        {copy.resources.map((resource) => (
          <li key={resource.url}>
            <a href={resource.url} className="confirmation-card__link">
              {resource.label}
            </a>
          </li>
        ))}
      </ul>
    </ChatMetadataPanel>
  );
}
