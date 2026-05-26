import type { ExerciseCatalogMetadata } from "@health/types";
import { useId } from "react";
import { buildExerciseCatalogDetailView } from "../../lib/exercise-catalog-ui-state";
import { cn } from "../../lib/utils";
import { PlanFacts } from "./plan-view";

type ExerciseCatalogDetailsProps = {
  catalog: ExerciseCatalogMetadata;
  className?: string;
};

export function ExerciseCatalogDetails({ catalog, className }: ExerciseCatalogDetailsProps) {
  const view = buildExerciseCatalogDetailView(catalog);
  const instructionsId = useId();
  const safetyId = useId();

  if (
    view.sections.length === 0 &&
    view.instructions.length === 0 &&
    view.safetyNotes.length === 0 &&
    !view.mediaFallbackLabel &&
    !view.isSnapshotOnly
  ) {
    return null;
  }

  const factItems = view.sections.map((section) => ({
    term: section.label,
    description: section.value,
  }));

  return (
    <div
      className={cn("exercise-catalog-details", className)}
      role="region"
      aria-label="Exercise catalog details"
    >
      {view.isSnapshotOnly ? (
        <p className="muted-text exercise-catalog-snapshot-note" role="note">
          Snapshot-only entry — full catalog details may be limited.
        </p>
      ) : null}

      {view.mediaFallbackLabel ? (
        <p
          className="exercise-catalog-media-fallback muted-text"
          role="status"
          aria-live="polite"
        >
          {view.mediaFallbackLabel}
        </p>
      ) : null}

      {factItems.length > 0 ? (
        <PlanFacts items={factItems} className="exercise-catalog-meta-list" />
      ) : null}

      {view.instructions.length > 0 ? (
        <section className="exercise-catalog-instructions" aria-labelledby={instructionsId}>
          <h4 id={instructionsId} className="section-label">
            Instructions
          </h4>
          <ol>
            {view.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {view.safetyNotes.length > 0 ? (
        <aside
          className="exercise-catalog-safety"
          role="note"
          aria-labelledby={safetyId}
        >
          <h4 id={safetyId} className="section-label">
            Safety notes
          </h4>
          <ul>
            {view.safetyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}
