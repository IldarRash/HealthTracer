export const GENERIC_RECIPE_CATALOG_CATEGORIES = [
  "Vegetarian",
  "Chicken",
  "Pasta",
  "Seafood",
  "Beef",
  "Breakfast",
] as const;

export type GenericRecipeCatalogCategory =
  (typeof GENERIC_RECIPE_CATALOG_CATEGORIES)[number];
