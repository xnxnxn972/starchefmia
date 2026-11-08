import raw from '../data/chef-catalog.json';

export type Course = 'appetizer' | 'soup' | 'salad' | 'main' | 'dessert';

export interface Dish {
  id: string;
  name: string;
  course: Course;
  cuisine: string;
  ingredientTags: string[];
  costCents: number;
  ratingTenths: number; // 45 means 4.5 stars
  description: string;
  imageSrc: string | null;
  imageAlt: string;
  artStatus: 'reference-example' | 'not-generated' | 'ready';
  imagePrompt: string;
}

export interface Ingredient {
  id: string;
  label: string;
}

export interface SupportedPair {
  cuisine: string;
  ingredient: string;
  dishIds: string[];
  courses: Course[];
}

export interface Catalog {
  catalogVersion: string;
  gameTitle: string;
  studio: string;
  config: { budgetCents: number; picks: number; courses: Course[]; revealDurationMs: number };
  cuisines: string[];
  ingredients: Ingredient[];
  dishes: Dish[];
  supportedPairs: SupportedPair[];
}

export const COURSES: Course[] = ['appetizer', 'soup', 'salad', 'main', 'dessert'];

export const COURSE_LABEL: Record<Course, string> = {
  appetizer: 'Appetizer',
  soup: 'Soup',
  salad: 'Salad',
  main: 'Main course',
  dessert: 'Dessert',
};

/** Short label for buttons: "Serve main · $18". */
export const COURSE_SHORT: Record<Course, string> = {
  appetizer: 'appetizer',
  soup: 'soup',
  salad: 'salad',
  main: 'main',
  dessert: 'dessert',
};

export const catalog = raw as unknown as Catalog;

export const dishById = new Map<string, Dish>(catalog.dishes.map((d) => [d.id, d]));
export const ingredientLabel = new Map<string, string>(catalog.ingredients.map((i) => [i.id, i.label]));

export function getDish(id: string): Dish {
  const d = dishById.get(id);
  if (!d) throw new Error(`Unknown dish id ${id}`);
  return d;
}

/** Cheapest global catalog cost per course — the completion reserve building block. */
export const minCostByCourse: Record<Course, number> = COURSES.reduce(
  (acc, c) => {
    acc[c] = Math.min(...catalog.dishes.filter((d) => d.course === c).map((d) => d.costCents));
    return acc;
  },
  {} as Record<Course, number>,
);

/** Returns a list of problems; empty means the catalog is valid. */
export function validateCatalog(cat: Catalog = catalog): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const ingredientIds = new Set(cat.ingredients.map((i) => i.id));
  const cuisines = new Set(cat.cuisines);
  for (const d of cat.dishes) {
    if (ids.has(d.id)) errors.push(`duplicate id ${d.id}`);
    ids.add(d.id);
    if (!COURSES.includes(d.course)) errors.push(`${d.id}: bad course ${d.course}`);
    if (!cuisines.has(d.cuisine)) errors.push(`${d.id}: unknown cuisine ${d.cuisine}`);
    if (!Number.isInteger(d.costCents) || d.costCents <= 0) errors.push(`${d.id}: bad cost`);
    if (!Number.isInteger(d.ratingTenths) || d.ratingTenths < 30 || d.ratingTenths > 50)
      errors.push(`${d.id}: bad rating`);
    for (const t of d.ingredientTags) if (!ingredientIds.has(t)) errors.push(`${d.id}: unknown tag ${t}`);
    if (!d.name || !d.imageAlt) errors.push(`${d.id}: missing text`);
  }
  for (const c of COURSES) if (!cat.dishes.some((d) => d.course === c)) errors.push(`no dishes for ${c}`);
  const byId = new Map(cat.dishes.map((d) => [d.id, d]));
  const seenPairs = new Set<string>();
  for (const p of cat.supportedPairs) {
    const key = `${p.cuisine}|${p.ingredient}`;
    if (seenPairs.has(key)) errors.push(`duplicate pair ${key}`);
    seenPairs.add(key);
    if (!ingredientIds.has(p.ingredient)) errors.push(`pair ${key}: unknown ingredient`);
    if (p.dishIds.length === 0) errors.push(`pair ${key}: empty`);
    for (const id of p.dishIds) {
      const d = byId.get(id);
      if (!d) errors.push(`pair ${key}: unknown dish ${id}`);
      else if (d.cuisine !== p.cuisine || !d.ingredientTags.includes(p.ingredient))
        errors.push(`pair ${key}: dish ${id} does not match`);
    }
  }
  return errors;
}
