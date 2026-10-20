/** Cross-platform catalogue data contracts. Keep server-only Supabase code out of this module. */
export type FeaturedProduct = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  categoryId: string;
  species: string[];
  brand: null;
  sellerName: string;
  priceMinor: number | null;
  priceIsFrom: boolean;
  currencyCode: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

export type ProductCategory = {
  id: string;
  slug: string;
  label: string;
  parentId: string | null;
  sortOrder: number;
  species: string[];
};

export type ProductAnimal = { id: string; slug: string; label: string };
