import type { ProductAnimal, ProductCategory } from "./featured-products";

export function findAnimal(animals: ProductAnimal[], slug: string): ProductAnimal | undefined {
  return animals.find((animal) => animal.slug === slug);
}

export function findCategory(categories: ProductCategory[], slug: string): ProductCategory | undefined {
  return categories.find((category) => category.slug === slug);
}

export function categoriesForAnimal(categories: ProductCategory[], animal: ProductAnimal): ProductCategory[] {
  return categories.filter((category) => category.species.includes(animal.id));
}
