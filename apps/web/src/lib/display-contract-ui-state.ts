import { displayContractSchema, type DisplayContract } from "@health/types";

/**
 * Parse a displayContract from a proposal's proposedChanges blob.
 * Returns null if the field is absent or fails schema validation.
 */
export function parseDisplayContract(proposedChanges: unknown): DisplayContract | null {
  if (
    !proposedChanges ||
    typeof proposedChanges !== "object" ||
    !("displayContract" in proposedChanges)
  ) {
    return null;
  }

  const raw = (proposedChanges as Record<string, unknown>).displayContract;
  const result = displayContractSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Build the accept override payload for a contract-carrying proposal.
 *
 * Writes each EDITABLE field's current fieldValue back into a cloned
 * proposedChanges.displayContract.fields[].value. Non-editable fields are
 * left at their stored values.
 *
 * The caller must NOT submit any derived / computed totals — the backend
 * recomputes those from the stored contract + stored rate.
 *
 * Returns null if proposedChanges has no displayContract.
 */
export function buildContractAcceptOverride(
  originalProposedChanges: unknown,
  fieldValues: Record<string, number>,
): unknown | null {
  if (
    !originalProposedChanges ||
    typeof originalProposedChanges !== "object" ||
    !("displayContract" in originalProposedChanges)
  ) {
    return null;
  }

  const original = originalProposedChanges as Record<string, unknown>;
  const contract = parseDisplayContract(originalProposedChanges);
  if (!contract) {
    return null;
  }

  // Shallow-clone proposedChanges and write editable field values back
  const updatedFields = contract.fields.map((field) => {
    if (!field.editable) {
      return field;
    }

    const submitted = fieldValues[field.key];
    if (submitted === undefined) {
      return field;
    }

    return { ...field, value: submitted };
  });

  const updatedContract = { ...contract, fields: updatedFields };

  return { ...original, displayContract: updatedContract };
}
