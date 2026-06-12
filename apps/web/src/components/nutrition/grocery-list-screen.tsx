"use client";

/**
 * GroceryListScreen — C3 weekly grocery checklist.
 *
 * Derived from the active nutrition revision via GET /nutrition/grocery-list.
 * "Bought" toggles are LOCAL UI state (localStorage keyed by revisionId) and
 * NEVER write a nutrition_plan_revision or touch plan data in any way.
 *
 * States: loading → error → empty (no active plan / no ingredient data) → success.
 * Reuses: GroceryCheck, ProgressBar, IconBadge, Icon from shared UI.
 */

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, type ReactElement } from "react";
import type { GroceryCategoryGroup, GroceryItem } from "@health/types";
import { apiQueryKeys, getGroceryList } from "../../lib/api";
import { GroceryCheck, Icon, IconBadge, ProgressBar, SkeletonCard } from "../ui";

// ── Category display metadata ────────────────────────────────────

type CategoryMeta = {
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  color: string;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  protein: { label: "Белок", icon: "fork", color: "var(--color-metric-green)" },
  vegetables: {
    label: "Овощи и зелень",
    icon: "heart",
    color: "var(--color-metric-blue)",
  },
  grains: {
    label: "Крупы и злаки",
    icon: "today",
    color: "var(--color-metric-amber)",
  },
  fruits: { label: "Фрукты и ягоды", icon: "drop", color: "var(--color-metric-red)" },
  pantry: {
    label: "Бакалея и прочее",
    icon: "spark",
    color: "var(--color-metric-indigo)",
  },
};

// ── Stable item key ──────────────────────────────────────────────

function itemKey(categoryKey: string, itemName: string): string {
  return `${categoryKey}:${itemName.toLowerCase().trim()}`;
}

// ── localStorage "bought" state ──────────────────────────────────

function localStorageKey(revisionId: string): string {
  return `grocery-bought:${revisionId}`;
}

function loadBought(revisionId: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(localStorageKey(revisionId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveBought(revisionId: string, state: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(localStorageKey(revisionId), JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode, quota) — silently skip
  }
}

// ── Reducer for bought toggles ───────────────────────────────────

type BoughtState = {
  revisionId: string;
  bought: Record<string, boolean>;
};

type BoughtAction =
  | { type: "init"; revisionId: string; bought: Record<string, boolean> }
  | { type: "toggle"; key: string; revisionId: string };

function boughtReducer(state: BoughtState, action: BoughtAction): BoughtState {
  if (action.type === "init") {
    return { revisionId: action.revisionId, bought: action.bought };
  }
  if (action.type === "toggle") {
    const next = { ...state.bought, [action.key]: !state.bought[action.key] };
    saveBought(action.revisionId, next);
    return { ...state, bought: next };
  }
  return state;
}

// ── Item row ─────────────────────────────────────────────────────

type ItemRowProps = {
  item: GroceryItem;
  isBought: boolean;
  onToggle: () => void;
  isLast: boolean;
};

function ItemRow({ item, isBought, onToggle, isLast }: ItemRowProps): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 2px",
        borderBottom: isLast ? "none" : "1px solid var(--color-border-default)",
      }}
    >
      <GroceryCheck
        checked={isBought}
        onChange={onToggle}
        label={`${isBought ? "Куплено" : "Купить"}: ${item.name}`}
      />
      <span
        style={{
          flex: 1,
          fontSize: 13.5,
          color: isBought ? "var(--color-text-muted)" : "var(--color-text-primary)",
          textDecoration: isBought ? "line-through" : "none",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.name}
        {item.isAllergen ? (
          <span
            title="Аллерген"
            aria-label="аллерген"
            style={{
              marginLeft: 6,
              padding: "1px 6px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              background: "rgba(240,80,106,0.18)",
              color: "var(--color-metric-red)",
              verticalAlign: "middle",
            }}
          >
            аллерген
          </span>
        ) : null}
      </span>
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: "var(--color-text-muted)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {item.quantity || "—"}
      </span>
    </div>
  );
}

// ── Category card ────────────────────────────────────────────────

type CategoryCardProps = {
  group: GroceryCategoryGroup;
  bought: Record<string, boolean>;
  onToggle: (key: string) => void;
};

function CategoryCard({ group, bought, onToggle }: CategoryCardProps): ReactElement {
  const meta = CATEGORY_META[group.category] ?? {
    label: group.category,
    icon: "fork" as const,
    color: "var(--color-metric-green)",
  };

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 18,
      }}
      aria-label={`${meta.label} — ${group.items.length} позиций`}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <IconBadge icon={meta.icon} color={meta.color} size={24} />
        <span
          style={{
            flex: 1,
            fontSize: 13.5,
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          {meta.label}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
          }}
        >
          {group.items.length}
        </span>
      </div>

      {/* Item rows */}
      {group.items.map((item, idx) => {
        const key = itemKey(group.category, item.name);
        return (
          <ItemRow
            key={key}
            item={item}
            isBought={Boolean(bought[key])}
            onToggle={() => onToggle(key)}
            isLast={idx === group.items.length - 1}
          />
        );
      })}
    </div>
  );
}

// ── Summary card ─────────────────────────────────────────────────

type SummaryCardProps = {
  total: number;
  got: number;
  allergies: string[];
  mealsPerDay: number;
};

function SummaryCard({
  total,
  got,
  allergies,
  mealsPerDay,
}: SummaryCardProps): ReactElement {
  const progressValue = total > 0 ? Math.round((got / total) * 100) : 0;

  const allergyClause =
    allergies.length > 0
      ? ` · аллергия на ${allergies.join(", ")} учтена`
      : "";

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {/* Green icon badge — M.greenDim background per spec */}
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(25,195,125,0.14)",
            flexShrink: 0,
          }}
        >
          <Icon name="fork" size={20} stroke="var(--color-metric-green, #19c37d)" />
        </div>

        {/* Title + subtitle + progress */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Список под план на 7 дней
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              margin: "4px 0 0",
              lineHeight: 1.4,
            }}
          >
            {total} позиций · {mealsPerDay} приёмов в день{allergyClause}
          </p>
          <div style={{ marginTop: 10, width: 120 }}>
            <ProgressBar
              value={progressValue}
              color="var(--color-metric-green)"
              height={8}
            />
          </div>
        </div>

        {/* Bought counter — right-aligned per spec */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {got}
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--color-text-muted)",
              }}
            >
              /{total}
            </span>
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              marginTop: 4,
            }}
          >
            куплено
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Indigo "changes via chat" banner ─────────────────────────────

function ChatBanner(): ReactElement {
  return (
    <div
      style={{
        background: "rgba(123,123,255,0.08)",
        border: "1px solid rgba(123,123,255,0.28)",
        borderRadius: 14,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Icon
        name="spark"
        size={18}
        stroke="var(--color-metric-indigo)"
        aria-hidden
      />
      <p
        style={{
          flex: 1,
          margin: 0,
          fontSize: 13,
          color: "var(--color-text-secondary)",
          lineHeight: 1.5,
          minWidth: 200,
        }}
      >
        <strong style={{ color: "var(--color-text-primary)" }}>
          Список пересобирается автоматически, когда коуч меняет рацион в чате.
        </strong>{" "}
        Менять блюда — тоже через чат.
      </p>
      <Link
        href="/chat"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 10,
          background: "rgba(123,123,255,0.14)",
          border: "1px solid rgba(123,123,255,0.28)",
          color: "var(--color-metric-indigo)",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <Icon name="chat" size={14} stroke="var(--color-metric-indigo)" aria-hidden />
        Поменять блюдо
      </Link>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────

function GroceryLoadingSkeleton(): ReactElement {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
      aria-label="Загрузка списка покупок"
      aria-busy="true"
    >
      <SkeletonCard h={96} head={false} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard key={i} h={200} head={false} />
        ))}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────

export function GroceryListScreen(): ReactElement {
  const { getToken } = useAuth();

  const groceryQuery = useQuery({
    queryKey: apiQueryKeys.nutritionGroceryList,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await getGroceryList(token);
      if (result.error) throw new Error(result.error);
      return result.data ?? null;
    },
  });

  // ── Bought state — personal UI, never touches plan data ──────────
  const [boughtState, dispatch] = useReducer(boughtReducer, {
    revisionId: "",
    bought: {},
  });

  // Initialise bought state when we get a revisionId from the query
  useEffect(() => {
    const revisionId = groceryQuery.data?.revisionId;
    if (!revisionId) return;
    if (boughtState.revisionId === revisionId) return; // already initialised for this revision
    dispatch({
      type: "init",
      revisionId,
      bought: loadBought(revisionId),
    });
  }, [groceryQuery.data?.revisionId, boughtState.revisionId]);

  const handleToggle = useCallback(
    (key: string) => {
      const revisionId = groceryQuery.data?.revisionId;
      if (!revisionId) return;
      dispatch({ type: "toggle", key, revisionId });
    },
    [groceryQuery.data?.revisionId],
  );

  // Compute aggregate "got" count from all items across all categories
  const { total, got } = useMemo(() => {
    const data = groceryQuery.data;
    if (!data) return { total: 0, got: 0 };
    let t = 0;
    let g = 0;
    for (const group of data.categories) {
      for (const item of group.items) {
        t++;
        if (boughtState.bought[itemKey(group.category, item.name)]) g++;
      }
    }
    return { total: t, got: g };
  }, [groceryQuery.data, boughtState.bought]);

  // ── Loading ───────────────────────────────────────────────────────
  if (groceryQuery.isLoading) {
    return <GroceryLoadingSkeleton />;
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (groceryQuery.isError) {
    return (
      <div
        role="alert"
        aria-label="Ошибка загрузки списка покупок"
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 16,
          padding: 28,
          textAlign: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}
        >
          <Icon name="info" size={28} stroke="var(--color-metric-red)" />
        </div>
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Не удалось загрузить список покупок
        </p>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Попробуйте обновить страницу. Данные плана в безопасности.
        </p>
        <button
          type="button"
          onClick={() => groceryQuery.refetch()}
          style={{
            marginTop: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 12,
            background: "rgba(25,195,125,0.12)",
            border: "1px solid rgba(25,195,125,0.28)",
            color: "var(--color-metric-green)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Повторить
        </button>
      </div>
    );
  }

  const data = groceryQuery.data;

  // ── Empty: no active plan or no ingredient data ───────────────────
  if (!data || data.totalItems === 0) {
    return (
      <div
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 16,
          padding: 28,
          textAlign: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}
        >
          <Icon name="fork" size={32} stroke="var(--color-metric-green)" />
        </div>
        <p
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Список пока пустой
        </p>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--color-text-muted)",
            marginTop: 8,
            lineHeight: 1.5,
            maxWidth: 400,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {!data
            ? "Активный план питания не найден. Попросите коуча составить недельный рацион с ингредиентами."
            : "В активном плане нет ингредиентов для списка. Попросите коуча добавить блюда с составом."}
        </p>
        <Link
          href="/chat"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 16,
            padding: "9px 18px",
            borderRadius: 12,
            background: "rgba(25,195,125,0.12)",
            border: "1px solid rgba(25,195,125,0.28)",
            color: "var(--color-metric-green)",
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <Icon name="chat" size={15} stroke="var(--color-metric-green)" />
          Открыть чат с коучем
        </Link>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────
  return (
    <>
      {/* Responsive grid styles — 3 cols ≥1024px, 2 cols ≥640px, 1 col below */}
      <style>{`
        .grocery-category-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 1023px) {
          .grocery-category-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 639px) {
          .grocery-category-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "16px 0",
        }}
      >
        {/* Screen sub-header: "Собрано из рациона · vN" + "Отправить в заметки" */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              fontWeight: 500,
            }}
          >
            Собрано из рациона · v{data.revisionNumber}
          </span>
          {/* "Отправить в заметки" — soft affordance, notes feature not yet implemented */}
          <button
            type="button"
            disabled
            aria-label="Отправить в заметки (скоро)"
            title="Отправить в заметки (скоро)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              borderRadius: 10,
              background: "transparent",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-muted)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "default",
              opacity: 0.55,
              flexShrink: 0,
            }}
          >
            <Icon name="doc" size={13} stroke="var(--color-text-muted)" aria-hidden />
            Отправить в заметки
          </button>
        </div>

        {/* Summary card */}
        <SummaryCard
          total={total}
          got={got}
          allergies={data.allergies}
          mealsPerDay={data.mealsPerDay}
        />

        {/* 3-column category grid (responsive via .grocery-category-grid class) */}
        <div
          className="grocery-category-grid"
          aria-label="Категории покупок"
        >
          {data.categories.map((group) => (
            <CategoryCard
              key={group.category}
              group={group}
              bought={boughtState.bought}
              onToggle={handleToggle}
            />
          ))}
        </div>

        {/* "Changes via chat" indigo banner */}
        <ChatBanner />
      </div>
    </>
  );
}
