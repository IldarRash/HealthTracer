import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const proposalsRepositorySource = readFileSync(
  join(import.meta.dirname, "proposals.repository.ts"),
  "utf8",
);
const proposalsServiceSource = readFileSync(
  join(import.meta.dirname, "proposals.service.ts"),
  "utf8",
);
const proposalApplySource = readFileSync(
  join(import.meta.dirname, "proposal-apply.service.ts"),
  "utf8",
);
const nutritionRepositorySource = readFileSync(
  join(import.meta.dirname, "../nutrition/nutrition.repository.ts"),
  "utf8",
);
const nutritionServiceSource = readFileSync(
  join(import.meta.dirname, "../nutrition/nutrition.service.ts"),
  "utf8",
);

describe("proposal accept nutrition incident transaction boundary", () => {
  it("runs apply inside the locked proposal transaction and passes tx through the stack", () => {
    expect(proposalsRepositorySource).toContain(".for(\"update\")");
    expect(proposalsRepositorySource).toContain("await applyFn(proposalForApply, tx)");
    expect(proposalsServiceSource).toContain(
      "this.proposalApplyService.applyAcceptedProposal(auth, user.id, lockedProposal, tx)",
    );
    expect(proposalApplySource).toContain("tx?: HealthDatabaseTransaction");
    expect(proposalApplySource).toContain("applyNutritionIncidentProposal(");
    expect(nutritionServiceSource).toContain("findIncidentBySourceProposalId(");
    expect(nutritionServiceSource).toContain("tx?: HealthDatabaseTransaction");
    expect(nutritionRepositorySource).toContain("db: Pick<HealthDatabase, \"insert\"> = this.db");
    expect(nutritionRepositorySource).toMatch(
      /await db\s*\n\s*\.insert\(nutritionIncidents\)/,
    );
    expect(nutritionRepositorySource).not.toMatch(
      /createIncident[\s\S]*await this\.db\s*\n\s*\.insert\(nutritionIncidents\)/,
    );
    expect(nutritionRepositorySource).toContain("sourceProposalId");
  });
});
