/**
 * grocery-list-screen.spec.ts — structural contracts for C3 grocery list screen.
 *
 * Source-text analysis (no DOM render) verifies:
 *  - All four async states: loading, error, empty, success
 *  - "Bought" state never writes a plan revision (localStorage-only, no mutation)
 *  - Summary card: «Список под план на 7 дней», progress bar, bought counter
 *  - Category grid: 3-column, all 5 Russian category labels, GroceryCheck reuse
 *  - Indigo "changes via chat" banner verbatim copy
 *  - "Поменять блюдо" routes to /chat (not a plan edit)
 *  - Safety floors: wellness-not-medical; no mutation calls; read-only
 *  - Reuses GroceryCheck and ProgressBar atoms (not duplicated)
 *  - Allergen badge rendered for flagged items
 *  - Empty state points to /chat
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "grocery-list-screen.tsx"),
  "utf8",
);

// ── Route page ────────────────────────────────────────────────────

const pageSrc = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/nutrition/grocery-list/page.tsx",
  ),
  "utf8",
);

// ── API contract ──────────────────────────────────────────────────

const apiSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../lib/api.ts"),
  "utf8",
);

// ── Loading state ─────────────────────────────────────────────────

describe("GroceryListScreen: loading state", () => {
  it("renders a loading skeleton while the query is pending", () => {
    expect(src).toContain("isLoading");
    expect(src).toContain("GroceryLoadingSkeleton");
  });

  it("uses aria-busy on the loading container", () => {
    expect(src).toContain("aria-busy");
  });

  it("uses SkeletonCard for loading placeholders", () => {
    expect(src).toContain("SkeletonCard");
  });
});

// ── Error state ───────────────────────────────────────────────────

describe("GroceryListScreen: error state", () => {
  it("renders an error message when the query fails", () => {
    expect(src).toContain("isError");
    expect(src).toContain("Не удалось загрузить список покупок");
  });

  it("provides a retry button that calls refetch", () => {
    expect(src).toContain("refetch");
    expect(src).toContain("Повторить");
  });

  it("uses role=alert for the error container", () => {
    expect(src).toContain('role="alert"');
  });
});

// ── Empty state ───────────────────────────────────────────────────

describe("GroceryListScreen: empty state", () => {
  it("renders empty state when there is no active plan or no ingredients", () => {
    expect(src).toContain("Список пока пустой");
  });

  it("points to /chat from the empty state", () => {
    expect(src).toContain("/chat");
    expect(src).toContain("Открыть чат с коучем");
  });

  it("handles both no-plan and no-ingredient cases with explanatory text", () => {
    expect(src).toContain("Активный план питания не найден");
    expect(src).toContain("В активном плане нет ингредиентов");
  });
});

// ── Summary card ──────────────────────────────────────────────────

describe("GroceryListScreen: summary card", () => {
  it("renders the design-spec title", () => {
    expect(src).toContain("Список под план на 7 дней");
  });

  it("renders revision version label", () => {
    expect(src).toContain("Собрано из рациона · v");
    expect(src).toContain("revisionNumber");
  });

  it("renders «КУПЛЕНО» counter", () => {
    expect(src).toContain("куплено");
    expect(src).toContain("got");
    expect(src).toContain("total");
  });

  it("reuses ProgressBar atom (not duplicated)", () => {
    expect(src).toContain("ProgressBar");
    // No inline custom progress bar
    expect(src).not.toContain("progressBarCustom");
  });

  it("renders allergy clause when allergies are present", () => {
    expect(src).toContain("аллергия на");
    expect(src).toContain("allergies");
  });

  it("renders meals-per-day count in subtitle", () => {
    expect(src).toContain("приёмов в день");
    expect(src).toContain("mealsPerDay");
  });
});

// ── Category grid ─────────────────────────────────────────────────

describe("GroceryListScreen: category grid", () => {
  it("uses a 3-column CSS grid", () => {
    expect(src).toContain("repeat(3, 1fr)");
  });

  it("renders the five canonical Russian category labels", () => {
    expect(src).toContain("Белок");
    expect(src).toContain("Овощи и зелень");
    expect(src).toContain("Крупы и злаки");
    expect(src).toContain("Фрукты и ягоды");
    expect(src).toContain("Бакалея и прочее");
  });

  it("renders all five design-spec category icons", () => {
    // protein → fork, vegetables → heart, grains → today, fruits → drop, pantry → spark
    expect(src).toContain('"fork"');
    expect(src).toContain('"heart"');
    expect(src).toContain('"today"');
    expect(src).toContain('"drop"');
    expect(src).toContain('"spark"');
  });

  it("reuses GroceryCheck atom (not duplicated)", () => {
    expect(src).toContain("GroceryCheck");
    // Should import from shared UI, not re-implement a checkbox
    expect(src).not.toContain("borderRadius: 50%");
  });

  it("renders strikethrough on bought items", () => {
    expect(src).toContain("line-through");
    expect(src).toContain("isBought");
  });

  it("dims bought item text and quantity", () => {
    expect(src).toContain("color-text-muted");
  });
});

// ── Allergen badge ────────────────────────────────────────────────

describe("GroceryListScreen: allergen badge", () => {
  it("renders an allergen badge for flagged items", () => {
    expect(src).toContain("isAllergen");
    expect(src).toContain("аллерген");
  });

  it("uses the red metric token for the allergen badge", () => {
    expect(src).toContain("color-metric-red");
  });
});

// ── Chat banner ───────────────────────────────────────────────────

describe('GroceryListScreen: indigo "changes via chat" banner', () => {
  it("renders the verbatim spec copy about automatic rebuild", () => {
    expect(src).toContain(
      "Список пересобирается автоматически, когда коуч меняет рацион в чате",
    );
    expect(src).toContain("Менять блюда — тоже через чат");
  });

  it("renders 'Поменять блюдо' button routing to /chat", () => {
    expect(src).toContain("Поменять блюдо");
    expect(src).toContain('href="/chat"');
  });

  it("uses the indigo rgba background from the spec", () => {
    expect(src).toContain("rgba(123,123,255,0.08)");
    expect(src).toContain("rgba(123,123,255,0.28)");
  });

  it("uses theme token for the spark icon stroke (no hard-coded hex)", () => {
    expect(src).toContain("color-metric-indigo");
    expect(src).not.toContain("#5b5bd6");
  });
});

// ── Bought state invariants ───────────────────────────────────────

describe("GroceryListScreen: bought state — personal UI only", () => {
  it("stores bought state in localStorage (client-only), never in DB", () => {
    expect(src).toContain("localStorage");
    expect(src).toContain("grocery-bought:");
  });

  it("never calls useMutation or writes to any nutrition plan endpoint", () => {
    expect(src).not.toContain("useMutation");
    expect(src).not.toContain("applyProposal");
    expect(src).not.toContain("createRevision");
    expect(src).not.toContain("/nutrition/revisions");
    expect(src).not.toContain("/nutrition/active");
  });

  it("bought toggles use useReducer (local state only)", () => {
    expect(src).toContain("useReducer");
    expect(src).toContain("boughtReducer");
  });

  it("resets bought state when revisionId changes (revision boundary)", () => {
    expect(src).toContain("revisionId");
    expect(src).toContain("loadBought");
    expect(src).toContain("saveBought");
  });

  it("'got' counter is derived from local bought state, not plan data", () => {
    expect(src).toContain("useMemo");
    expect(src).not.toContain("bought_count");
  });
});

// ── API client ────────────────────────────────────────────────────

describe("API client: getGroceryList", () => {
  it("exports a getGroceryList function calling /nutrition/grocery-list", () => {
    expect(apiSrc).toContain("getGroceryList");
    expect(apiSrc).toContain("/nutrition/grocery-list");
  });

  it("validates the response with groceryListResponseSchema from @health/types", () => {
    expect(apiSrc).toContain("groceryListResponseSchema");
  });

  it("has nutritionGroceryList as a query key", () => {
    expect(apiSrc).toContain("nutritionGroceryList");
    expect(apiSrc).toContain('"nutrition-grocery-list"');
  });
});

// ── Route page ────────────────────────────────────────────────────

describe("GroceryListPage route: /nutrition/grocery-list", () => {
  it("uses AppLayout and PageHeader with the Russian title", () => {
    expect(pageSrc).toContain("<AppLayout>");
    expect(pageSrc).toContain("<PageHeader");
    expect(pageSrc).toContain("Закупка на неделю");
  });

  it("renders GroceryListScreen inside PageContent", () => {
    expect(pageSrc).toContain("<GroceryListScreen");
    expect(pageSrc).toContain("<PageContent>");
  });

  it("redirects unauthenticated users to sign-in", () => {
    expect(pageSrc).toContain("isAuthenticated");
    expect(pageSrc).toContain("redirectToAppSignIn");
  });
});

// ── Safety floors ─────────────────────────────────────────────────

describe("GroceryListScreen: safety — wellness not medical", () => {
  it("avoids diagnosis, treatment, or clinical language", () => {
    expect(src).not.toMatch(/diagnos/i);
    expect(src).not.toMatch(/treatment/i);
    expect(src).not.toMatch(/clinical/i);
    expect(src).not.toMatch(/prescription/i);
    expect(src).not.toMatch(/medical certaint/i);
  });
});

// ── Atom reuse ────────────────────────────────────────────────────

describe("GroceryListScreen: reuses UI atoms", () => {
  it("imports atoms from shared ../ui (no duplication)", () => {
    expect(src).toContain('from "../ui"');
    expect(src).toContain("IconBadge");
    expect(src).toContain("Icon");
    expect(src).toContain("ProgressBar");
    expect(src).toContain("GroceryCheck");
    expect(src).toContain("SkeletonCard");
  });
});
