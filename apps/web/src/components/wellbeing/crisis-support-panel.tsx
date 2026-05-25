import type { WellbeingCrisisSupportCopy } from "@health/types";

type CrisisSupportPanelProps = {
  copy: WellbeingCrisisSupportCopy;
  titleId?: string;
};

export function CrisisSupportPanel({
  copy,
  titleId = "wellbeing-crisis-title",
}: CrisisSupportPanelProps) {
  return (
    <aside
      className="wellbeing-crisis-panel notice"
      role="region"
      aria-labelledby={titleId}
    >
      <h3 id={titleId}>{copy.title}</h3>
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
    </aside>
  );
}
