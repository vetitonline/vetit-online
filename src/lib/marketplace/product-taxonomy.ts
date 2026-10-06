export type ProductCategory = {
  slug: string;
  label: string;
  terms: string[];
  children?: ProductCategory[];
};

export type ProductAnimal = {
  slug: string;
  label: string;
  terms: string[];
  categories: ProductCategory[];
};

// Presentation taxonomy. Listing data remains in Supabase and can be mapped to
// these stable slugs when the category migration is applied.
export const PRODUCT_ANIMALS: ProductAnimal[] = [
  {
    slug: "dogs",
    label: "Dogs",
    terms: ["dog", "dogs", "canine"],
    categories: [
      { slug: "dog-food", label: "Dog food", terms: ["dog food", "dog nutrition", "canine food"] , children: [
        { slug: "puppy-food", label: "Puppy food", terms: ["puppy", "puppy food"] },
        { slug: "adult-food", label: "Adult food", terms: ["adult dog", "adult food"] },
        { slug: "senior-food", label: "Senior food", terms: ["senior dog", "senior food"] },
        { slug: "veterinary-diet-food", label: "Veterinary / diet food", terms: ["veterinary diet", "prescription diet", "diet food"] },
      ] },
      { slug: "treats-chews", label: "Treats & chews", terms: ["treat", "chew"] },
      { slug: "toys", label: "Toys", terms: ["toy", "play"] },
      { slug: "grooming", label: "Grooming", terms: ["groom", "shampoo", "brush"] },
      { slug: "accessories", label: "Accessories", terms: ["accessory", "collar", "lead", "harness"] },
      { slug: "health-care", label: "Health & care", terms: ["health", "care", "wellness"] },
    ],
  },
  {
    slug: "cats",
    label: "Cats",
    terms: ["cat", "cats", "feline", "kitten"],
    categories: [
      { slug: "cat-food", label: "Cat food", terms: ["cat food", "feline food"], children: [
        { slug: "kitten-food", label: "Kitten food", terms: ["kitten", "kitten food"] },
        { slug: "adult-cat-food", label: "Adult cat food", terms: ["adult cat", "adult cat food"] },
      ] },
      { slug: "treats", label: "Treats", terms: ["cat treat", "feline treat"] },
      { slug: "litter", label: "Litter", terms: ["litter", "litter tray"] },
      { slug: "toys", label: "Toys", terms: ["cat toy", "feline toy"] },
      { slug: "grooming", label: "Grooming", terms: ["cat groom", "feline groom"] },
      { slug: "accessories", label: "Accessories", terms: ["cat accessory", "feline accessory"] },
      { slug: "health-care", label: "Health & care", terms: ["cat health", "cat care", "cat wellness", "feline wellness"] },
    ],
  },
  {
    slug: "livestock",
    label: "Livestock",
    terms: ["livestock", "cattle", "cow", "calf", "farm", "herd"],
    categories: [
      { slug: "cattle-feed", label: "Cattle feed", terms: ["cattle feed", "livestock feed", "animal feed"] },
      { slug: "calf-products", label: "Calf products", terms: ["calf", "calves"] },
      { slug: "supplements", label: "Supplements", terms: ["supplement", "mineral mix"] },
      { slug: "animal-care", label: "Animal care", terms: ["animal care", "livestock care", "herd health"] },
      { slug: "farm-supplies", label: "Farm supplies", terms: ["farm supply", "farm equipment", "farm supplies"] },
      { slug: "accessories-equipment", label: "Accessories & equipment", terms: ["equipment", "accessory", "accessories"] },
    ],
  },
];

export function findAnimal(slug: string): ProductAnimal | undefined {
  return PRODUCT_ANIMALS.find((animal) => animal.slug === slug);
}

export function findCategory(animal: ProductAnimal, slug: string): ProductCategory | undefined {
  return animal.categories.flatMap((category) => [category, ...(category.children ?? [])])
    .find((category) => category.slug === slug);
}

export function allCategories(animal: ProductAnimal): ProductCategory[] {
  return animal.categories.flatMap((category) => [category, ...(category.children ?? [])]);
}

export function matchesProductTerms(value: string, terms: string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return terms.some((term) => {
    const normalizedTerm = term.toLocaleLowerCase().trim();
    if (normalizedTerm.includes(' ')) return normalized.includes(normalizedTerm);
    if (words.includes(normalizedTerm)) return true;
    // Common plurals help match free-text legacy categories such as "Toys".
    return normalizedTerm !== 'cat' && (words.includes(`${normalizedTerm}s`) || words.includes(`${normalizedTerm}es`));
  });
}
