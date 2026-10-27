// The recipe library, built from content/meal-plans by scripts/build-recipes.mjs.
import data from "../../../content/meal-plans/recipes.json";

export type Ingredient = { amount: string; name: string; cupboard: boolean };
export type MealType = "Breakfasts" | "Lunches" | "Evening meals" | "Snacks";
export type Recipe = {
  id: string;
  name: string;
  tier: string;
  meal_type: MealType;
  vegetarian: boolean;
  pescatarian: boolean;
  vegan: boolean;
  serves: number;
  prep_minutes: number;
  cook_minutes: number;
  total_minutes: number;
  timing: string;
  ingredients: Ingredient[];
  method: string[];
  notes: string[];
  /** One mouth-watering line shown on the plan. */
  tagline: string | null;
  allergens: string[];
  image_url: string | null;
};

export const RECIPES = (data as { recipes: Recipe[] }).recipes;
export const recipeById = (id: string) => RECIPES.find((r) => r.id === id) ?? null;

/** The 14 allergens UK law requires to be declared, as used in the recipe data. */
export const ALLERGEN_LABELS: Record<string, string> = {
  "cereals containing gluten": "Gluten",
  crustaceans: "Crustaceans",
  eggs: "Eggs",
  fish: "Fish",
  peanuts: "Peanuts",
  soybeans: "Soya",
  milk: "Milk",
  nuts: "Tree nuts",
  celery: "Celery",
  mustard: "Mustard",
  sesame: "Sesame",
  sulphites: "Sulphites",
  lupin: "Lupin",
  molluscs: "Molluscs",
};
