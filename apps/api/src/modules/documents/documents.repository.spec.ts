import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositorySource = readFileSync(
  join(import.meta.dirname, "documents.repository.ts"),
  "utf8",
);

function extractMethodBody(methodName: string): string {
  const start = repositorySource.indexOf(`async ${methodName}`);
  const nextMethod = repositorySource.indexOf("\n  async ", start + 1);
  return repositorySource.slice(start, nextMethod === -1 ? undefined : nextMethod);
}

describe("DocumentsRepository query predicates", () => {
  it("applies semantic indexing consent before search limit", () => {
    const body = extractMethodBody("searchApprovedSummaries");

    expect(body).toContain('hasDocumentConsentScopeInDb("semantic_indexing")');
    expect(body.indexOf('hasDocumentConsentScopeInDb("semantic_indexing")')).toBeLessThan(
      body.indexOf(".limit(limit)"),
    );
  });

  it("applies coach chat consent before context candidate limit", () => {
    const body = extractMethodBody("listContextCandidates");

    expect(body).toContain('hasDocumentConsentScopeInDb("coach_chat_context")');
    expect(body.indexOf('hasDocumentConsentScopeInDb("coach_chat_context")')).toBeLessThan(
      body.indexOf(".limit(limit"),
    );
  });

  it("tombstones summary and search fields on revocation cleanup", () => {
    expect(repositorySource).toContain("tombstoneSummariesForDocument");
    expect(repositorySource).toContain('summaryText: TOMBSTONE_SUMMARY_TEXT');
    expect(repositorySource).toContain('searchIndexText: ""');
  });
});
