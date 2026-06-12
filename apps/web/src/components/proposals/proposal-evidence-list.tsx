import type { CorrelationEvidenceRef, CorrelationEvidenceRefType } from "@health/types";

export function evidenceRefTypeLabel(type: CorrelationEvidenceRefType): string {
  switch (type) {
    case "biomarker_reading":
      return "Biomarker reading";
    case "health_metric_aggregate":
      return "Health metric summary";
    case "weekly_progress_summary":
      return "Weekly progress";
    case "habit_adherence":
      return "Habit adherence";
  }
}

type ProposalEvidenceListProps = {
  evidenceRefs: readonly CorrelationEvidenceRef[];
};

export function ProposalEvidenceList({ evidenceRefs }: ProposalEvidenceListProps) {
  if (evidenceRefs.length === 0) {
    return null;
  }

  return (
    <div className="proposal-evidence-list">
      <p className="section-label">Coaching evidence</p>
      <p className="muted-text">
        Sources referenced for this proposal. These are wellness context cues—not medical
        conclusions.
      </p>
      <ul>
        {evidenceRefs.map((ref) => (
          <li key={`${ref.type}-${ref.id}`}>
            <span className="proposal-evidence-type">{evidenceRefTypeLabel(ref.type)}</span>
            <span>{ref.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
