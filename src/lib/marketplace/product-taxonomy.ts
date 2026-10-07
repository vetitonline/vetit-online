import type { ProductAnimal, ProductCategory } from "./featured-products";

export function findAnimal(animals: ProductAnimal[], slug: string): ProductAnimal | undefined {
  return animals.find((animal) => animal.slug === slug)
    ?? (slug === "livestock" ? animals.find((animal) => animal.slug === "cattle") : undefined);
}

export function findCategory(categories: ProductCategory[], slug: string): ProductCategory | undefined {
  return categories.find((category) => category.slug === slug);
}

export function categoriesForAnimal(categories: ProductCategory[], animal: ProductAnimal): ProductCategory[] {
  return categories.filter((category) => category.species.includes(animal.id));
}

/** Return the selected category and all of its descendants for parent-category browsing. */
export function categoryAndDescendantIds(categories: ProductCategory[], categoryId: string): string[] {
  const ids = new Set([categoryId]);
  let parents = [categoryId];
  while (parents.length > 0) {
    const children = categories.filter((category) => category.parentId && parents.includes(category.parentId));
    const next = children.map((category) => category.id).filter((id) => !ids.has(id));
    next.forEach((id) => ids.add(id));
    parents = next;
  }
  return [...ids];
}
