import type { CorrelationEvidenceRef } from "@health/types";
import { evidenceRefTypeLabel } from "../../lib/documents-ui-state";

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
            <span className="documents-evidence-type">{evidenceRefTypeLabel(ref.type)}</span>
            <span>{ref.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
