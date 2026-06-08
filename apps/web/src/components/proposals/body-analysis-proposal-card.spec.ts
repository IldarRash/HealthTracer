/**
 * body-analysis-proposal-card.spec.ts
 *
 * Source-structure assertions for the BodyAnalysisProposalCard and its
 * integration with InlineProposalCard routing (same style as
 * inline-proposal-card.spec.ts).
 *
 * Safety coverage:
 *  - No photo bytes accepted or rendered.
 *  - BodyAnalysisCard (with its mandatory disclaimer) is always rendered
 *    inside the pending body.
 *  - Accepted success shows the "Сохранено в профиль · «Анализ тела»" strip.
 *  - Rejected copy is body-specific (not a generic "Your plan stays as is.").
 *  - Routing: InlineProposalCard dispatches save_body_analysis to this card
 *    before falling through to contract / generic routes.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const proposalsDir = dirname(fileURLToPath(import.meta.url));
const webSrcDir = join(proposalsDir, "../..");

const bodyAnalysisProposalSrc = readFileSync(
  join(proposalsDir, "body-analysis-proposal-card.tsx"),
  "utf8",
);
const inlineProposalSrc = readFileSync(
  join(proposalsDir, "inline-proposal-card.tsx"),
  "utf8",
);
const proposalUiStateSrc = readFileSync(
  join(webSrcDir, "lib/proposal-ui-state.ts"),
  "utf8",
);
const photoGuideSrc = readFileSync(
  join(proposalsDir, "../chat/photo-guide.tsx"),
  "utf8",
);
const stylesSrc = readFileSync(
  join(webSrcDir, "../app/styles.css"),
  "utf8",
);

// ── BodyAnalysisProposalCard ────────────────────────────────────────────────

describe("BodyAnalysisProposalCard — structure", () => {
  it("renders BodyAnalysisCard atom for the pending body", () => {
    expect(bodyAnalysisProposalSrc).toContain("BodyAnalysisCard");
    expect(bodyAnalysisProposalSrc).toContain("body-analysis-proposal-card__result");
  });

  it("uses ProposalCardShell for shared accept/modify/reject chrome", () => {
    expect(bodyAnalysisProposalSrc).toContain("ProposalCardShell");
  });

  it("uses useInlineProposalActions hook for mutation handling", () => {
    expect(bodyAnalysisProposalSrc).toContain("useInlineProposalActions");
  });

  it("accept label is 'Сохранить в профиль'", () => {
    expect(bodyAnalysisProposalSrc).toContain('"Сохранить в профиль"');
  });

  it("accepted success node contains verbatim 'Сохранено в профиль · «Анализ тела»' text", () => {
    expect(bodyAnalysisProposalSrc).toContain("Сохранено в профиль · «Анализ тела»");
  });

  it("accepted success node includes 'Открыть →' link", () => {
    expect(bodyAnalysisProposalSrc).toContain("Открыть →");
  });

  it("parses the proposal payload via saveBodyAnalysisProposalPayloadSchema", () => {
    expect(bodyAnalysisProposalSrc).toContain("saveBodyAnalysisProposalPayloadSchema");
  });

  it("derives fat% range metric with amber tone", () => {
    expect(bodyAnalysisProposalSrc).toContain('"amber"');
    expect(bodyAnalysisProposalSrc).toContain("Жир");
  });

  it("derives muscle tone metric with green tone", () => {
    expect(bodyAnalysisProposalSrc).toContain('"green"');
    expect(bodyAnalysisProposalSrc).toContain("Мыш. тонус");
  });

  it("derives weight metric with ink tone", () => {
    expect(bodyAnalysisProposalSrc).toContain('"ink"');
    expect(bodyAnalysisProposalSrc).toContain("Вес*");
  });

  it("maps strongGroups to 'strong' zone kind", () => {
    expect(bodyAnalysisProposalSrc).toContain('"strong"');
    expect(bodyAnalysisProposalSrc).toContain("strongGroups");
  });

  it("maps weakGroups to 'growth' zone kind", () => {
    expect(bodyAnalysisProposalSrc).toContain('"growth"');
    expect(bodyAnalysisProposalSrc).toContain("weakGroups");
  });

  it("canAccept gates on isPending AND canAcceptProposal", () => {
    expect(bodyAnalysisProposalSrc).toContain("canAcceptProposal");
    expect(bodyAnalysisProposalSrc).toContain("isPending && canAccept");
  });

  it("does not render image elements or accept attachment/image refs in props", () => {
    // No <img> tags or image src props in JSX
    expect(bodyAnalysisProposalSrc).not.toContain("<img");
    // No camera attachment inputs
    expect(bodyAnalysisProposalSrc).not.toContain('type="file"');
    // No attachment ref ids
    expect(bodyAnalysisProposalSrc).not.toContain("attachmentRefId");
    expect(bodyAnalysisProposalSrc).not.toContain("previewUrl");
  });

  it("has a fallback for unparseable payloads (canAccept=false, error message)", () => {
    expect(bodyAnalysisProposalSrc).toContain("Данные анализа не удалось загрузить");
    expect(bodyAnalysisProposalSrc).toContain("canAccept={false}");
  });

  it("has no direct mutations — all accept/reject goes through useInlineProposalActions", () => {
    // No standalone useMutation calls (mutations belong in the hook, not the card)
    expect(bodyAnalysisProposalSrc).not.toContain("useMutation");
    // No direct fetch calls
    expect(bodyAnalysisProposalSrc).not.toContain("fetch(");
    // No direct database-layer import (decideProposal is called inside the hook, not imported here)
    expect(bodyAnalysisProposalSrc).not.toContain("import.*decideProposal");
  });
});

// ── InlineProposalCard routing ─────────────────────────────────────────────

describe("InlineProposalCard — save_body_analysis routing", () => {
  it("imports BodyAnalysisProposalCard", () => {
    expect(inlineProposalSrc).toContain("BodyAnalysisProposalCard");
    expect(inlineProposalSrc).toContain("body-analysis-proposal-card");
  });

  it("routes save_body_analysis intent to BodyAnalysisProposalCard", () => {
    expect(inlineProposalSrc).toContain('"save_body_analysis"');
    expect(inlineProposalSrc).toContain("<BodyAnalysisProposalCard");
  });

  it("routes save_body_analysis before parseDisplayContract fallthrough", () => {
    const bodyAnalysisIdx = inlineProposalSrc.indexOf('"save_body_analysis"');
    const parseContractIdx = inlineProposalSrc.indexOf("parseDisplayContract(");
    expect(bodyAnalysisIdx).toBeGreaterThan(-1);
    expect(parseContractIdx).toBeGreaterThan(-1);
    expect(bodyAnalysisIdx).toBeLessThan(parseContractIdx);
  });

  it("routes save_body_analysis after wellbeing, nutrition, and recipes checks", () => {
    const wellbeingIdx = inlineProposalSrc.indexOf('"capture_wellbeing_checkin"');
    const nutritionIdx = inlineProposalSrc.indexOf('"log_nutrition_incident"');
    const recipesIdx = inlineProposalSrc.indexOf('"recommend_recipes"');
    const bodyAnalysisIdx = inlineProposalSrc.indexOf('"save_body_analysis"');
    expect(bodyAnalysisIdx).toBeGreaterThan(wellbeingIdx);
    expect(bodyAnalysisIdx).toBeGreaterThan(nutritionIdx);
    expect(bodyAnalysisIdx).toBeGreaterThan(recipesIdx);
  });
});

// ── proposal-ui-state ─────────────────────────────────────────────────────

describe("proposal-ui-state — save_body_analysis entries", () => {
  it("provides an intent label for save_body_analysis", () => {
    expect(proposalUiStateSrc).toContain('"save_body_analysis"');
    expect(proposalUiStateSrc).toContain('"Анализ тела"');
  });

  it("provides a body-specific rejected message for save_body_analysis", () => {
    expect(proposalUiStateSrc).toContain("proposal.intent === \"save_body_analysis\"");
    expect(proposalUiStateSrc).toContain("Analysis not saved");
  });

  it("body domain has route '/profile'", () => {
    expect(proposalUiStateSrc).toContain('case "body":');
    expect(proposalUiStateSrc).toContain('"/profile"');
  });

  it("body domain pill class is proposal-domain-pill--body", () => {
    expect(proposalUiStateSrc).toContain("proposal-domain-pill--body");
  });
});

// ── PhotoGuide ────────────────────────────────────────────────────────────

describe("PhotoGuide component — structure and safety", () => {
  it("renders header 'Нужно 3 фото с разных ракурсов'", () => {
    expect(photoGuideSrc).toContain("Нужно 3 фото с разных ракурсов");
  });

  it("defines the three angle tiles: Спереди, Сбоку, Сзади", () => {
    expect(photoGuideSrc).toContain("Спереди");
    expect(photoGuideSrc).toContain("Сбоку");
    expect(photoGuideSrc).toContain("Сзади");
  });

  it("contains the verbatim privacy block copy (numbers, not photos)", () => {
    expect(photoGuideSrc).toContain("в профиль попадут лишь цифры, не снимки");
  });

  it("contains the camera privacy clause (photos used only for assessment)", () => {
    expect(photoGuideSrc).toContain("Фото используются только для оценки");
  });

  it("renders 'Сделать фото' camera capture button", () => {
    expect(photoGuideSrc).toContain("Сделать фото");
    expect(photoGuideSrc).toContain('capture="environment"');
  });

  it("renders 'Загрузить из галереи' gallery file picker button", () => {
    expect(photoGuideSrc).toContain("Загрузить из галереи");
  });

  it("uses CHAT_ATTACHMENT_ACCEPT to reuse the existing MIME allow-list", () => {
    expect(photoGuideSrc).toContain("CHAT_ATTACHMENT_ACCEPT");
  });

  it("accepts multiple files (up to 3)", () => {
    expect(photoGuideSrc).toContain("multiple");
    expect(photoGuideSrc).toContain("slice(0, 3)");
  });

  it("file inputs are sr-only to avoid duplicate visible controls", () => {
    expect(photoGuideSrc).toContain('className="sr-only"');
  });

  it("has role=region and aria-label for accessible region identification", () => {
    expect(photoGuideSrc).toContain('role="region"');
    expect(photoGuideSrc).toContain("Инструкция для фото");
  });

  it("calls onFilesSelected callback for parent integration", () => {
    expect(photoGuideSrc).toContain("onFilesSelected");
    expect(photoGuideSrc).toContain("onFilesSelected?.(");
  });

  it("does not implement its own upload logic (no fetch / useMutation)", () => {
    expect(photoGuideSrc).not.toContain("fetch(");
    expect(photoGuideSrc).not.toContain("useMutation");
    expect(photoGuideSrc).not.toContain("uploadChatAttachment");
  });

  it("includes all three checklist items verbatim", () => {
    expect(photoGuideSrc).toContain("Облегающая одежда или нижнее бельё");
    expect(photoGuideSrc).toContain("Хороший ровный свет, нейтральный фон");
    expect(photoGuideSrc).toContain("Телефон на уровне пояса, целиком в кадре");
  });
});

// ── CSS ───────────────────────────────────────────────────────────────────

describe("styles.css — body analysis chat flow classes", () => {
  it("defines photo-guide container and heading classes", () => {
    expect(stylesSrc).toContain(".photo-guide");
    expect(stylesSrc).toContain(".photo-guide__header");
    expect(stylesSrc).toContain(".photo-guide__heading");
  });

  it("defines photo-guide tiles structure", () => {
    expect(stylesSrc).toContain(".photo-guide__tiles");
    expect(stylesSrc).toContain(".photo-guide__tile");
    expect(stylesSrc).toContain(".photo-guide__tile-badge");
    expect(stylesSrc).toContain(".photo-guide__tile-title");
    expect(stylesSrc).toContain(".photo-guide__tile-hint");
  });

  it("defines photo-guide checklist", () => {
    expect(stylesSrc).toContain(".photo-guide__checklist");
    expect(stylesSrc).toContain(".photo-guide__checklist-item");
    expect(stylesSrc).toContain(".photo-guide__check-icon");
  });

  it("defines photo-guide privacy block", () => {
    expect(stylesSrc).toContain(".photo-guide__privacy");
    expect(stylesSrc).toContain(".photo-guide__privacy-text");
  });

  it("defines photo-guide action buttons", () => {
    expect(stylesSrc).toContain(".photo-guide__actions");
    expect(stylesSrc).toContain(".photo-guide__btn");
    expect(stylesSrc).toContain(".photo-guide__btn--accept");
    expect(stylesSrc).toContain(".photo-guide__btn--ghost");
  });

  it("defines body-analysis-proposal-card result class", () => {
    expect(stylesSrc).toContain(".body-analysis-proposal-card__result");
  });
});
