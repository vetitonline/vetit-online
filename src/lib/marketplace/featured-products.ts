import type { AstroCookies } from "astro";
import { createSupabaseServerClient } from "../supabase/server";
import { getSupabasePublicConfig } from "../supabase/config";

export type FeaturedProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  categoryId: string;
  species: string[];
  brand: null;
  sellerName: string;
  priceMinor: number | null;
  currencyCode: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

export type FeaturedProductsResult = {
  state: "unconfigured" | "available" | "error";
  products: FeaturedProduct[];
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
export type ProductTaxonomyResult = {
  state: "unconfigured" | "available" | "error";
  animals: ProductAnimal[];
  categories: ProductCategory[];
};

export const DEFAULT_MARKET_CODE = "IN";

/** Return active public catalog taxonomy and its animal relationships. */
export async function getProductTaxonomy(request: Request, cookies: AstroCookies): Promise<ProductTaxonomyResult> {
  if (!getSupabasePublicConfig()) return { state: "unconfigured", animals: [], categories: [] };
  try {
    const supabase = createSupabaseServerClient({ request, cookies });
    const [{ data: animals, error: animalsError }, { data: categories, error: categoriesError }, { data: links, error: linksError }] = await Promise.all([
      supabase.from("animal_species").select("id, slug, display_name").eq("is_active", true).order("display_name"),
      supabase.from("categories").select("id, slug, name, parent_id, sort_order").in("kind", ["product", "both"]).eq("moderation_status", "active").order("sort_order"),
      supabase.from("category_species").select("category_id, species_id"),
    ]);
    if (animalsError) throw animalsError;
    if (categoriesError) throw categoriesError;
    if (linksError) throw linksError;
    const speciesByCategory = new Map<string, string[]>();
    for (const link of links ?? []) speciesByCategory.set(link.category_id, [...(speciesByCategory.get(link.category_id) ?? []), link.species_id]);
    return {
      state: "available",
      animals: (animals ?? []).map(({ id, slug, display_name }) => ({ id, slug, label: display_name })),
      categories: (categories ?? []).map((category) => ({
        id: category.id,
        slug: category.slug,
        label: category.name,
        parentId: category.parent_id,
        sortOrder: category.sort_order,
        species: speciesByCategory.get(category.id) ?? [],
      })),
    };
  } catch (error) {
    console.error("[marketplace] Could not load catalog taxonomy.", error instanceof Error ? error.message : "Unknown Supabase error");
    return { state: "error", animals: [], categories: [] };
  }
}

type ProductOptions = { marketCode?: string; categoryId?: string; speciesId?: string; productId?: string };

/** Fetch active, moderation-approved product listings with current market pricing. */
export async function getMarketplaceProducts(
  request: Request,
  cookies: AstroCookies,
  requestedLimit = 1000,
  options: ProductOptions = {},
): Promise<FeaturedProductsResult> {
  if (!getSupabasePublicConfig()) return { state: "unconfigured", products: [] };
  try {
    const supabase = createSupabaseServerClient({ request, cookies });
    const marketCode = options.marketCode ?? DEFAULT_MARKET_CODE;
    const now = new Date().toISOString();
    const { data: market, error: marketError } = await supabase.from("markets").select("currency_code, market_status").eq("country_code", marketCode).maybeSingle();
    if (marketError) throw marketError;
    if (!market || market.market_status !== "active") return { state: "available", products: [] };
    let query = supabase.from("listings").select(`
      id, business_id, title, description, category_id, slug,
      categories!inner(id, slug, name, moderation_status, category_species(species_id, animal_species(slug))),
      businesses!inner(id, display_name, is_active, archived_at),
      listing_prices!inner(amount_minor, currency_code, market_code, status, valid_from, valid_to, product_variant_id),
      listing_markets!inner(market_code, availability_status, compliance_status),
      listing_images(storage_object_path, alt_text, sort_order, visibility_status),
      listing_species(species_id, animal_species(slug))
    `)
      .eq("kind", "product")
      .eq("moderation_status", "published")
      .is("archived_at", null)
      .eq("categories.moderation_status", "active")
      .eq("businesses.is_active", true)
      .eq("businesses.verification_status", "verified")
      .is("businesses.archived_at", null)
      .eq("listing_prices.market_code", marketCode)
      .eq("listing_prices.currency_code", market.currency_code)
      .eq("listing_prices.status", "active")
      .is("listing_prices.product_variant_id", null)
      .lte("listing_prices.valid_from", now)
      .or(`valid_to.is.null,valid_to.gt.${now}`, { referencedTable: "listing_prices" })
      .eq("listing_markets.market_code", marketCode)
      .eq("listing_markets.availability_status", "available")
      .eq("listing_markets.compliance_status", "approved")
      .order("created_at", { ascending: false })
      .limit(Math.min(1000, Math.max(0, Math.floor(requestedLimit))));
    if (options.categoryId) query = query.eq("category_id", options.categoryId);
    if (options.productId) query = query.eq("id", options.productId);
    const { data, error } = await query;
    if (error) throw error;

    const products = (data ?? []).map((row) => {
      const price = Array.isArray(row.listing_prices) ? row.listing_prices[0] : row.listing_prices;
      const image = Array.isArray(row.listing_images)
        ? row.listing_images.filter((entry) => entry.visibility_status === "visible").sort((a, b) => a.sort_order - b.sort_order)[0]
        : null;
      const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
      const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
      const species = Array.isArray(row.listing_species) ? row.listing_species : [];
      const categorySpecies = category && Array.isArray(category.category_species) ? category.category_species : [];
      const speciesSlugs = new Set<string>();
      for (const entry of species) {
        const animal = Array.isArray(entry.animal_species) ? entry.animal_species[0] : entry.animal_species;
        if (animal?.slug) speciesSlugs.add(animal.slug);
      }
      for (const entry of categorySpecies) {
        const animal = Array.isArray(entry.animal_species) ? entry.animal_species[0] : entry.animal_species;
        if (animal?.slug) speciesSlugs.add(animal.slug);
      }
      return {
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        category: category?.name ?? "",
        categorySlug: category?.slug ?? "",
        categoryId: row.category_id,
        species: [...speciesSlugs],
        brand: null as null,
        sellerName: business?.display_name ?? "",
        priceMinor: price?.amount_minor ?? null,
        currencyCode: price?.currency_code ?? "INR",
        // No public image bucket is configured in the live project, so private paths are not exposed.
        imageUrl: null,
        imageAlt: image?.alt_text ?? null,
      } satisfies FeaturedProduct;
    });
    if (options.speciesId) {
      const { data: animal, error: animalError } = await supabase.from("animal_species").select("slug").eq("id", options.speciesId).maybeSingle();
      if (animalError) throw animalError;
      return { state: "available", products: animal ? products.filter((product) => product.species.includes(animal.slug)) : [] };
    }
    return { state: "available", products };
  } catch (error) {
    console.error("[marketplace] Could not load products from Supabase.", error instanceof Error ? error.message : "Unknown Supabase error");
    return { state: "error", products: [] };
  }
}

export function getFeaturedProducts(request: Request, cookies: AstroCookies): Promise<FeaturedProductsResult> {
  return getMarketplaceProducts(request, cookies, 4);
}

export async function getMarketplaceProduct(request: Request, cookies: AstroCookies, productId: string) {
  const result = await getMarketplaceProducts(request, cookies, 1, { productId });
  return { state: result.state, product: result.products[0] ?? null };
}

export function formatPrice(amountMinor: number | null, currencyCode = "INR"): string {
  if (amountMinor === null) return "Price on request";
  const formatter = new Intl.NumberFormat(currencyCode === "INR" ? "en-IN" : undefined, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: currencyCode === "INR" ? 0 : 2,
  });
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits;
  return formatter.format(amountMinor / 10 ** digits);
}
