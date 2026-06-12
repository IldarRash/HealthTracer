"use client";

import { useAuth } from "@clerk/nextjs";
import type {
  ComputeRecipeMacrosResponse,
  CreateRecipeInput,
  RecipeIngredient,
  RecipePerServingMacros,
  RecipeMealType,
  UpdateRecipeInput,
} from "@health/types";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import {
  computeRecipeMacros as computeRecipeMacrosApi,
  createRecipe,
  updateRecipe,
} from "../../lib/api";
import type { Recipe } from "@health/types";
import { RECIPE_CONFIDENCE_LABELS } from "../../lib/recipes-ui-state";

const MEAL_TYPE_OPTIONS: { value: RecipeMealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

type IngredientRow = RecipeIngredient & { _id: string };

function makeIngredientId() {
  return `ing-${Math.random().toString(36).slice(2)}`;
}

function emptyIngredient(): IngredientRow {
  return { _id: makeIngredientId(), name: "", quantity: null, unit: null, notes: null };
}

type RecipeFormState = {
  name: string;
  description: string;
  ingredients: IngredientRow[];
  preparationSteps: string[];
  servings: string;
  mealTypes: RecipeMealType[];
  tags: string;
  restrictionTags: string;
  allergenTags: string;
  prepMinutes: string;
  cookMinutes: string;
  // macro override fields
  caloriesPerServing: string;
  proteinGramsPerServing: string;
  carbsGramsPerServing: string;
  fatGramsPerServing: string;
  computedMacros: ComputeRecipeMacrosResponse | null;
};

function initFormState(recipe?: Recipe): RecipeFormState {
  if (recipe) {
    return {
      name: recipe.name,
      description: recipe.description,
      ingredients: recipe.ingredients.map((ing) => ({ ...ing, _id: makeIngredientId() })),
      preparationSteps: [...recipe.preparationSteps],
      servings: String(recipe.servings),
      mealTypes: [...recipe.mealTypes],
      tags: recipe.tags.join(", "),
      restrictionTags: recipe.restrictionTags.join(", "),
      allergenTags: recipe.allergenTags.join(", "),
      prepMinutes: recipe.prepMinutes != null ? String(recipe.prepMinutes) : "",
      cookMinutes: recipe.cookMinutes != null ? String(recipe.cookMinutes) : "",
      caloriesPerServing: String(recipe.perServingMacros.caloriesPerServing),
      proteinGramsPerServing: String(recipe.perServingMacros.proteinGramsPerServing),
      carbsGramsPerServing: String(recipe.perServingMacros.carbsGramsPerServing),
      fatGramsPerServing: String(recipe.perServingMacros.fatGramsPerServing),
      computedMacros: null,
    };
  }

  return {
    name: "",
    description: "",
    ingredients: [emptyIngredient()],
    preparationSteps: [""],
    servings: "1",
    mealTypes: [],
    tags: "",
    restrictionTags: "",
    allergenTags: "",
    prepMinutes: "",
    cookMinutes: "",
    caloriesPerServing: "",
    proteinGramsPerServing: "",
    carbsGramsPerServing: "",
    fatGramsPerServing: "",
    computedMacros: null,
  };
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function parsePositiveInt(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return !isNaN(n) && n > 0 ? n : null;
}

function parseNonnegInt(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return !isNaN(n) && n >= 0 ? n : null;
}

function buildMacroEstimates(form: RecipeFormState): RecipePerServingMacros | null {
  const cal = parsePositiveInt(form.caloriesPerServing);
  const prot = parseNonnegInt(form.proteinGramsPerServing);
  const carbs = parseNonnegInt(form.carbsGramsPerServing);
  const fat = parseNonnegInt(form.fatGramsPerServing);

  if (cal == null || prot == null || carbs == null || fat == null) {
    return null;
  }

  return { caloriesPerServing: cal, proteinGramsPerServing: prot, carbsGramsPerServing: carbs, fatGramsPerServing: fat };
}

function buildCreateInput(form: RecipeFormState): CreateRecipeInput | string {
  const servings = parsePositiveInt(form.servings);

  if (!servings) {
    return "Servings must be a positive integer.";
  }

  if (form.ingredients.filter((ing) => ing.name.trim()).length === 0) {
    return "At least one ingredient name is required.";
  }

  if (form.preparationSteps.filter((s) => s.trim()).length === 0) {
    return "At least one preparation step is required.";
  }

  if (form.mealTypes.length === 0) {
    return "Select at least one meal type.";
  }

  const ingredients: RecipeIngredient[] = form.ingredients
    .filter((ing) => ing.name.trim())
    .map(({ name, quantity, unit, notes }) => ({
      name: name.trim(),
      quantity: quantity ?? null,
      unit: unit?.trim() || null,
      notes: notes?.trim() || null,
    }));

  const preparationSteps = form.preparationSteps
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const macroEstimates = buildMacroEstimates(form) ?? undefined;

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    ingredients,
    preparationSteps,
    servings,
    mealTypes: form.mealTypes,
    tags: parseTags(form.tags),
    restrictionTags: parseTags(form.restrictionTags),
    allergenTags: parseTags(form.allergenTags),
    prepMinutes: parseNonnegInt(form.prepMinutes),
    cookMinutes: parseNonnegInt(form.cookMinutes),
    macroEstimates,
  };
}

function buildUpdateInput(form: RecipeFormState): UpdateRecipeInput | string {
  const baseResult = buildCreateInput(form);
  if (typeof baseResult === "string") {
    return baseResult;
  }

  return {
    name: baseResult.name,
    description: baseResult.description,
    ingredients: baseResult.ingredients,
    preparationSteps: baseResult.preparationSteps,
    servings: baseResult.servings,
    mealTypes: baseResult.mealTypes,
    tags: baseResult.tags,
    restrictionTags: baseResult.restrictionTags,
    allergenTags: baseResult.allergenTags,
    prepMinutes: baseResult.prepMinutes,
    cookMinutes: baseResult.cookMinutes,
    macroEstimates: baseResult.macroEstimates,
  };
}

type RecipeFormProps = {
  /** Existing recipe to edit. When omitted, form is in create mode. */
  recipe?: Recipe;
  onSuccess: (saved: Recipe) => void;
  onCancel: () => void;
};

export function RecipeForm({ recipe, onSuccess, onCancel }: RecipeFormProps) {
  const formId = useId();
  const { getToken } = useAuth();
  const isEdit = recipe != null;

  const [form, setForm] = useState<RecipeFormState>(() => initFormState(recipe));
  const [validationError, setValidationError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");

      if (isEdit) {
        const input = buildUpdateInput(form);
        if (typeof input === "string") throw new Error(input);
        const result = await updateRecipe(token, recipe.id, input);
        if (result.error || !result.data) throw new Error(result.error ?? "Recipe could not be saved.");
        return result.data;
      } else {
        const input = buildCreateInput(form);
        if (typeof input === "string") throw new Error(input);
        const result = await createRecipe(token, input);
        if (result.error || !result.data) throw new Error(result.error ?? "Recipe could not be created.");
        return result.data;
      }
    },
    onSuccess: (saved) => {
      onSuccess(saved);
    },
  });

  const computeMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");

      const servings = parsePositiveInt(form.servings);
      if (!servings) throw new Error("Set a valid serving count before computing.");

      const ingredients = form.ingredients
        .filter((ing) => ing.name.trim())
        .map(({ name, quantity, unit, notes }) => ({
          name: name.trim(),
          quantity: quantity ?? null,
          unit: unit?.trim() || null,
          notes: notes?.trim() || null,
        }));

      if (ingredients.length === 0) throw new Error("Add at least one ingredient first.");

      const result = await computeRecipeMacrosApi(token, { ingredients, servings });
      if (result.error || !result.data) throw new Error(result.error ?? "Macro estimate failed.");
      return result.data;
    },
    onSuccess: (computed) => {
      setForm((prev) => ({
        ...prev,
        caloriesPerServing: String(computed.caloriesPerServing),
        proteinGramsPerServing: String(computed.proteinGramsPerServing),
        carbsGramsPerServing: String(computed.carbsGramsPerServing),
        fatGramsPerServing: String(computed.fatGramsPerServing),
        computedMacros: computed,
      }));
    },
  });

  const isPending = saveMutation.isPending || computeMutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError(null);

    const input = isEdit ? buildUpdateInput(form) : buildCreateInput(form);
    if (typeof input === "string") {
      setValidationError(input);
      return;
    }

    saveMutation.mutate();
  };

  const updateIngredient = (index: number, patch: Partial<IngredientRow>) => {
    setForm((prev) => {
      const ingredients = prev.ingredients.map((ing, i) =>
        i === index ? { ...ing, ...patch } : ing,
      );
      return { ...prev, ingredients };
    });
  };

  const addIngredient = () => {
    setForm((prev) => ({ ...prev, ingredients: [...prev.ingredients, emptyIngredient()] }));
  };

  const removeIngredient = (index: number) => {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  };

  const updateStep = (index: number, value: string) => {
    setForm((prev) => {
      const preparationSteps = prev.preparationSteps.map((s, i) => (i === index ? value : s));
      return { ...prev, preparationSteps };
    });
  };

  const addStep = () => {
    setForm((prev) => ({ ...prev, preparationSteps: [...prev.preparationSteps, ""] }));
  };

  const removeStep = (index: number) => {
    setForm((prev) => ({
      ...prev,
      preparationSteps: prev.preparationSteps.filter((_, i) => i !== index),
    }));
  };

  const toggleMealType = (mealType: RecipeMealType) => {
    setForm((prev) => {
      const selected = prev.mealTypes.includes(mealType)
        ? prev.mealTypes.filter((mt) => mt !== mealType)
        : [...prev.mealTypes, mealType];
      return { ...prev, mealTypes: selected };
    });
  };

  const nameId = `${formId}-name`;
  const descId = `${formId}-desc`;
  const servingsId = `${formId}-servings`;
  const prepMinsId = `${formId}-prep-mins`;
  const cookMinsId = `${formId}-cook-mins`;
  const tagsId = `${formId}-tags`;
  const restrictionTagsId = `${formId}-restriction-tags`;
  const allergenTagsId = `${formId}-allergen-tags`;
  const calId = `${formId}-cal`;
  const protId = `${formId}-prot`;
  const carbsId = `${formId}-carbs`;
  const fatId = `${formId}-fat`;

  return (
    <form
      className="recipe-form nested-card"
      onSubmit={handleSubmit}
      aria-label={isEdit ? "Edit recipe" : "Add recipe"}
    >
      <p className="section-label">{isEdit ? "Edit recipe" : "Add your own recipe"}</p>
      <p className="muted-text">
        Macro values are approximate wellness estimates, not guaranteed nutrition facts.
      </p>

      <div className="form-field">
        <label htmlFor={nameId}>
          Recipe name <span aria-hidden="true">*</span>
        </label>
        <input
          id={nameId}
          className="form-input"
          value={form.name}
          disabled={isPending}
          required
          maxLength={160}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
      </div>

      <div className="form-field">
        <label htmlFor={descId}>
          Description <span aria-hidden="true">*</span>
        </label>
        <textarea
          id={descId}
          className="form-input"
          rows={3}
          value={form.description}
          disabled={isPending}
          required
          maxLength={2000}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />
      </div>

      <div className="form-field">
        <label htmlFor={servingsId}>
          Servings <span aria-hidden="true">*</span>
        </label>
        <input
          id={servingsId}
          className="form-input"
          inputMode="numeric"
          value={form.servings}
          disabled={isPending}
          required
          min={1}
          max={20}
          onChange={(e) => setForm((prev) => ({ ...prev, servings: e.target.value }))}
        />
      </div>

      <fieldset>
        <legend>
          Meal type <span aria-hidden="true">*</span>
        </legend>
        <div className="recipe-meal-type-row">
          {MEAL_TYPE_OPTIONS.map(({ value, label }) => (
            <label key={value} className="recipe-meal-type-option">
              <input
                type="checkbox"
                checked={form.mealTypes.includes(value)}
                disabled={isPending}
                onChange={() => toggleMealType(value)}
              />
              {" "}
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Ingredients <span aria-hidden="true">*</span></legend>
        <div className="recipe-ingredient-list">
          {form.ingredients.map((ing, index) => (
            <div key={ing._id} className="recipe-ingredient-row">
              <div className="form-field">
                <label htmlFor={`${formId}-ing-name-${index}`} className="proposal-meta">
                  Ingredient
                </label>
                <input
                  id={`${formId}-ing-name-${index}`}
                  className="form-input"
                  placeholder="e.g. Lentils"
                  value={ing.name}
                  disabled={isPending}
                  maxLength={160}
                  onChange={(e) => updateIngredient(index, { name: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`${formId}-ing-qty-${index}`} className="proposal-meta">
                  Qty
                </label>
                <input
                  id={`${formId}-ing-qty-${index}`}
                  className="form-input"
                  placeholder="e.g. 1.5"
                  value={ing.quantity != null ? String(ing.quantity) : ""}
                  disabled={isPending}
                  inputMode="decimal"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    const qty = v ? Number.parseFloat(v) : null;
                    updateIngredient(index, { quantity: isNaN(qty!) ? null : qty });
                  }}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`${formId}-ing-unit-${index}`} className="proposal-meta">
                  Unit
                </label>
                <input
                  id={`${formId}-ing-unit-${index}`}
                  className="form-input"
                  placeholder="e.g. cup"
                  value={ing.unit ?? ""}
                  disabled={isPending}
                  maxLength={40}
                  onChange={(e) => updateIngredient(index, { unit: e.target.value || null })}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`${formId}-ing-notes-${index}`} className="proposal-meta">
                  Notes
                </label>
                <input
                  id={`${formId}-ing-notes-${index}`}
                  className="form-input"
                  placeholder="optional"
                  value={ing.notes ?? ""}
                  disabled={isPending}
                  maxLength={240}
                  onChange={(e) => updateIngredient(index, { notes: e.target.value || null })}
                />
              </div>
              <button
                type="button"
                className="button button-secondary recipe-remove-btn"
                aria-label={`Remove ingredient ${ing.name || index + 1}`}
                disabled={isPending || form.ingredients.length <= 1}
                onClick={() => removeIngredient(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="button button-secondary"
          disabled={isPending || form.ingredients.length >= 50}
          onClick={addIngredient}
        >
          Add ingredient
        </button>
      </fieldset>

      <fieldset>
        <legend>Preparation steps <span aria-hidden="true">*</span></legend>
        <ol className="recipe-step-form-list">
          {form.preparationSteps.map((step, index) => (
            <li key={index} className="recipe-step-form-row">
              <div className="form-field">
                <label htmlFor={`${formId}-step-${index}`} className="proposal-meta">
                  Step {index + 1}
                </label>
                <textarea
                  id={`${formId}-step-${index}`}
                  className="form-input"
                  rows={2}
                  value={step}
                  disabled={isPending}
                  maxLength={1000}
                  onChange={(e) => updateStep(index, e.target.value)}
                />
              </div>
              <button
                type="button"
                className="button button-secondary recipe-remove-btn"
                aria-label={`Remove step ${index + 1}`}
                disabled={isPending || form.preparationSteps.length <= 1}
                onClick={() => removeStep(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="button button-secondary"
          disabled={isPending || form.preparationSteps.length >= 30}
          onClick={addStep}
        >
          Add step
        </button>
      </fieldset>

      <div className="recipe-form-time-row">
        <div className="form-field">
          <label htmlFor={prepMinsId} className="proposal-meta">
            Prep time (min)
          </label>
          <input
            id={prepMinsId}
            className="form-input"
            inputMode="numeric"
            value={form.prepMinutes}
            disabled={isPending}
            min={0}
            max={600}
            onChange={(e) => setForm((prev) => ({ ...prev, prepMinutes: e.target.value }))}
          />
        </div>
        <div className="form-field">
          <label htmlFor={cookMinsId} className="proposal-meta">
            Cook time (min)
          </label>
          <input
            id={cookMinsId}
            className="form-input"
            inputMode="numeric"
            value={form.cookMinutes}
            disabled={isPending}
            min={0}
            max={600}
            onChange={(e) => setForm((prev) => ({ ...prev, cookMinutes: e.target.value }))}
          />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor={tagsId} className="proposal-meta">
          Tags (comma-separated)
        </label>
        <input
          id={tagsId}
          className="form-input"
          placeholder="e.g. high-protein, quick"
          value={form.tags}
          disabled={isPending}
          onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
        />
      </div>

      <div className="form-field">
        <label htmlFor={restrictionTagsId} className="proposal-meta">
          Dietary restrictions (comma-separated)
        </label>
        <input
          id={restrictionTagsId}
          className="form-input"
          placeholder="e.g. vegan, gluten-free"
          value={form.restrictionTags}
          disabled={isPending}
          onChange={(e) => setForm((prev) => ({ ...prev, restrictionTags: e.target.value }))}
        />
      </div>

      <div className="form-field">
        <label htmlFor={allergenTagsId} className="proposal-meta">
          Allergens (comma-separated)
        </label>
        <input
          id={allergenTagsId}
          className="form-input"
          placeholder="e.g. nuts, dairy"
          value={form.allergenTags}
          disabled={isPending}
          onChange={(e) => setForm((prev) => ({ ...prev, allergenTags: e.target.value }))}
        />
      </div>

      <fieldset>
        <legend>Macro estimates</legend>
        <p className="proposal-meta">
          Leave blank to have the backend estimate from ingredients, or compute an estimate
          below and accept/adjust it.
        </p>

        <div className="action-row">
          <button
            type="button"
            className="button button-secondary"
            disabled={isPending}
            onClick={() => computeMutation.mutate()}
          >
            {computeMutation.isPending ? "Computing…" : "Compute estimate from ingredients"}
          </button>
        </div>

        {computeMutation.isError ? (
          <p className="form-error" role="alert">
            {computeMutation.error instanceof Error
              ? computeMutation.error.message
              : "Macro estimate failed."}
          </p>
        ) : null}

        {form.computedMacros ? (
          <div className="notice notice-inline" role="status">
            <p className="proposal-meta">
              Computed estimate ({RECIPE_CONFIDENCE_LABELS[form.computedMacros.confidence]}):
              {" "}{form.computedMacros.caloriesPerServing} cal · {form.computedMacros.proteinGramsPerServing}g
              protein · {form.computedMacros.carbsGramsPerServing}g carbs · {form.computedMacros.fatGramsPerServing}g fat.
              Values pre-filled below — edit as needed.
            </p>
          </div>
        ) : null}

        <div className="nutrition-incident-items">
          <div className="nutrition-incident-item-row">
            <div className="form-field">
              <label htmlFor={calId} className="proposal-meta">Calories (kcal)</label>
              <input
                id={calId}
                className="form-input"
                inputMode="numeric"
                placeholder="e.g. 500"
                value={form.caloriesPerServing}
                disabled={isPending}
                onChange={(e) => setForm((prev) => ({ ...prev, caloriesPerServing: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor={protId} className="proposal-meta">Protein (g)</label>
              <input
                id={protId}
                className="form-input"
                inputMode="numeric"
                placeholder="e.g. 30"
                value={form.proteinGramsPerServing}
                disabled={isPending}
                onChange={(e) => setForm((prev) => ({ ...prev, proteinGramsPerServing: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor={carbsId} className="proposal-meta">Carbs (g)</label>
              <input
                id={carbsId}
                className="form-input"
                inputMode="numeric"
                placeholder="e.g. 60"
                value={form.carbsGramsPerServing}
                disabled={isPending}
                onChange={(e) => setForm((prev) => ({ ...prev, carbsGramsPerServing: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor={fatId} className="proposal-meta">Fat (g)</label>
              <input
                id={fatId}
                className="form-input"
                inputMode="numeric"
                placeholder="e.g. 15"
                value={form.fatGramsPerServing}
                disabled={isPending}
                onChange={(e) => setForm((prev) => ({ ...prev, fatGramsPerServing: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </fieldset>

      {validationError ? (
        <p className="form-error" role="alert">
          {validationError}
        </p>
      ) : null}

      {saveMutation.isError ? (
        <p className="form-error" role="alert">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Recipe could not be saved."}
        </p>
      ) : null}

      <div className="action-row proposal-actions">
        <button
          type="submit"
          className="button button-coach"
          disabled={isPending}
        >
          {saveMutation.isPending
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
            ? "Save changes"
            : "Create recipe"}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
