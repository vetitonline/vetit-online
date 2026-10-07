import type { AstroCookies } from "astro";
import { createSupabaseServerClient } from "../supabase/server";
import { getSupabasePublicConfig } from "../supabase/config";

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

type ProductOptions = { marketCode?: string; categoryId?: string; speciesId?: string; productId?: string; productSlug?: string };

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
    let query = supabase.from("listings").select("id, business_id, title, slug, description, category_id, created_at")
      .eq("kind", "product")
      .eq("moderation_status", "published")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(1000, Math.max(0, Math.floor(requestedLimit))));
    if (options.categoryId) query = query.eq("category_id", options.categoryId);
    if (options.productId) query = query.eq("id", options.productId);
    if (options.productSlug) query = query.eq("slug", options.productSlug);
    const { data, error } = await query;
    if (error) throw error;

    if (!data?.length) return { state: "available", products: [] };
    const listingIds = data.map((listing) => listing.id);
    const businessIds = [...new Set(data.map((listing) => listing.business_id))];
    const categoryIds = [...new Set(data.map((listing) => listing.category_id))];
    const [
      { data: categories, error: categoriesError },
      { data: businesses, error: businessesError },
      { data: prices, error: pricesError },
      { data: variants, error: variantsError },
      { data: listingImages, error: listingImagesError },
      { data: listingMarkets, error: marketsError },
      { data: listingSpecies, error: speciesError },
    ] = await Promise.all([
      supabase.from("categories").select("id, slug, name, moderation_status").in("id", categoryIds).in("kind", ["product", "both"]).eq("moderation_status", "active"),
      supabase.from("businesses").select("id, display_name, is_active, archived_at, verification_status").in("id", businessIds).eq("is_active", true).is("archived_at", null).eq("verification_status", "verified"),
      supabase.from("listing_prices").select("listing_id, product_variant_id, amount_minor, currency_code, valid_from").in("listing_id", listingIds).eq("market_code", marketCode).eq("currency_code", market.currency_code).eq("status", "active").lte("valid_from", now).or(`valid_to.is.null,valid_to.gt.${now}`).order("valid_from", { ascending: false }),
      supabase.from("product_variants").select("id, listing_id, active_status").in("listing_id", listingIds).eq("active_status", true),
      supabase.from("listing_images").select("listing_id, storage_object_path, alt_text, sort_order, visibility_status").in("listing_id", listingIds).eq("visibility_status", "visible").order("sort_order", { ascending: true }),
      supabase.from("listing_markets").select("listing_id").in("listing_id", listingIds).eq("market_code", marketCode).eq("availability_status", "available").eq("compliance_status", "approved"),
      supabase.from("listing_species").select("listing_id, species_id").in("listing_id", listingIds),
    ]);
    if (categoriesError) throw categoriesError;
    if (businessesError) throw businessesError;
    if (pricesError) throw pricesError;
    if (variantsError) throw variantsError;
    if (listingImagesError) throw listingImagesError;
    if (marketsError) throw marketsError;
    if (speciesError) throw speciesError;
    const taxonomy = await getProductTaxonomy(request, cookies);
    if (taxonomy.state === "error") throw new Error("Product taxonomy is unavailable.");
    const categoriesById = new Map((categories ?? []).map((category) => [category.id, category]));
    const businessesById = new Map((businesses ?? []).map((business) => [business.id, business]));
    const activeVariantIds = new Set((variants ?? []).map((variant) => variant.id));
    type CurrentPrice = NonNullable<typeof prices>[number];
    const priceCandidatesByListing = new Map<string, { base: CurrentPrice | null; variants: Map<string, CurrentPrice> }>();
    for (const price of prices ?? []) {
      let candidates = priceCandidatesByListing.get(price.listing_id);
      if (!candidates) {
        candidates = { base: null, variants: new Map() };
        priceCandidatesByListing.set(price.listing_id, candidates);
      }
      if (price.product_variant_id === null) {
        if (!candidates.base || price.valid_from > candidates.base.valid_from) candidates.base = price;
      } else if (activeVariantIds.has(price.product_variant_id)) {
        const previous = candidates.variants.get(price.product_variant_id);
        if (!previous || price.valid_from > previous.valid_from) candidates.variants.set(price.product_variant_id, price);
      }
    }
    const imageByListing = new Map<string, NonNullable<typeof listingImages>[number]>();
    for (const image of listingImages ?? []) {
      if (!imageByListing.has(image.listing_id)) imageByListing.set(image.listing_id, image);
    }
    const listingImagesBucket = getSupabasePublicConfig()?.listingImagesBucket;
    const marketListingIds = new Set((listingMarkets ?? []).map((listing) => listing.listing_id));
    const animalSlugs = new Map(taxonomy.animals.map((animal) => [animal.id, animal.slug]));
    const speciesByListing = new Map<string, string[]>();
    for (const link of listingSpecies ?? []) {
      const slug = animalSlugs.get(link.species_id);
      if (slug) speciesByListing.set(link.listing_id, [...(speciesByListing.get(link.listing_id) ?? []), slug]);
    }
    const products = data.flatMap((row) => {
      const category = categoriesById.get(row.category_id);
      const business = businessesById.get(row.business_id);
      const priceCandidates = priceCandidatesByListing.get(row.id);
      const variantPrice = priceCandidates
        ? [...priceCandidates.variants.values()].sort((a, b) => a.amount_minor - b.amount_minor)[0] ?? null
        : null;
      const price = priceCandidates?.base ?? variantPrice;
      const image = imageByListing.get(row.id);
      if (!category || !business || !marketListingIds.has(row.id)) return [];
      const categorySpecies = taxonomy.categories.find((item) => item.id === category.id)?.species ?? [];
      // Listing-specific species are authoritative. Category relationships describe
      // which species may use a category and must not broaden a specific listing.
      const listingSpeciesSlugs = speciesByListing.get(row.id);
      const speciesSlugs = new Set(listingSpeciesSlugs?.length
        ? listingSpeciesSlugs
        : categorySpecies.flatMap((id) => animalSlugs.get(id) ?? []));
      const imageUrl = image && listingImagesBucket
        ? supabase.storage.from(listingImagesBucket).getPublicUrl(image.storage_object_path).data.publicUrl
        : null;
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description ?? "",
        category: category?.name ?? "",
        categorySlug: category?.slug ?? "",
        categoryId: row.category_id,
        species: [...speciesSlugs],
        brand: null as null,
        sellerName: business?.display_name ?? "",
        priceMinor: price?.amount_minor ?? null,
        priceIsFrom: !priceCandidates?.base && Boolean(variantPrice),
        currencyCode: price?.currency_code ?? market.currency_code,
        imageUrl,
        imageAlt: imageUrl ? image?.alt_text ?? null : null,
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
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
  const result = await getMarketplaceProducts(request, cookies, 1, isUuid ? { productId } : { productSlug: productId });
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

export function formatProductPrice(product: Pick<FeaturedProduct, "priceMinor" | "currencyCode" | "priceIsFrom">): string {
  const price = formatPrice(product.priceMinor, product.currencyCode);
  return product.priceIsFrom && product.priceMinor !== null ? `From ${price}` : price;
}
