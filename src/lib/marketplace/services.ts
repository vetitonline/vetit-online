import type { AstroCookies } from "astro";
import { createSupabaseServerClient } from "../supabase/server";
import { getSupabasePublicConfig } from "../supabase/config";

export type ServiceCategory = { slug: string; name: string; parentSlug: string | null; requiresProfessionalVerification: boolean; requiresLegalReview: boolean };
export type PublicService = {
  id: string; businessId: string; title: string; description: string; categorySlug: string | null; categoryName: string;
  mode: string | null; city: string | null; locality: string | null; pricePaise: number | null; durationMinutes: number | null;
  providerName: string; providerSlug: string | null;
};
export type ServicesResult = { state: "unconfigured" | "available" | "error"; services: PublicService[]; categories: ServiceCategory[] };
export type ServiceSearch = { category?: string; city?: string; locality?: string; limit?: number };

const unavailable = (state: ServicesResult["state"], categories: ServiceCategory[] = []): ServicesResult => ({ state, services: [], categories });

/** Read public service categories and published, verified provider listings from the shared marketplace schema. */
export async function getPublicServices(request: Request, cookies: AstroCookies, filters: ServiceSearch = {}): Promise<ServicesResult> {
  if (!getSupabasePublicConfig()) return unavailable("unconfigured");
  try {
    const supabase = createSupabaseServerClient({ request, cookies });
    const [{ data: categoryRows, error: categoryError }, { data: market, error: marketError }] = await Promise.all([
      supabase.from("categories").select("id, slug, name, parent_id, moderation_status").in("kind", ["service", "both"]).eq("moderation_status", "active").order("sort_order"),
      supabase.from("markets").select("currency_code, market_status").eq("country_code", "IN").maybeSingle(),
    ]);
    if (categoryError) throw categoryError;
    if (marketError) throw marketError;
    const categories: ServiceCategory[] = (categoryRows ?? []).map((row) => ({ slug: row.slug, name: row.name, parentSlug: categoryRows?.find((parent) => parent.id === row.parent_id)?.slug ?? null, requiresProfessionalVerification: false, requiresLegalReview: false }));
    if (!market || market.market_status !== "active") return unavailable("available", categories);
    const now = new Date().toISOString();
    let query = supabase.from("listings").select(`
      id, business_id, title, description, created_at, category_id,
      categories!inner(id, slug, name, moderation_status),
      businesses!inner(id, display_name, is_active, archived_at, verification_status),
      listing_prices!inner(amount_minor, currency_code, market_code, status, valid_from, valid_to, product_variant_id),
      listing_markets!inner(market_code, availability_status, compliance_status),
      service_offerings(duration_minutes, delivery_mode, provider_location_id, provider_locations(city, locality, is_public, is_active))
    `).eq("kind", "service").eq("moderation_status", "published").is("archived_at", null)
      .eq("categories.moderation_status", "active").eq("businesses.is_active", true).is("businesses.archived_at", null)
      .eq("businesses.verification_status", "verified").eq("listing_prices.market_code", "IN").eq("listing_prices.currency_code", market.currency_code)
      .eq("listing_prices.status", "active").is("listing_prices.product_variant_id", null).lte("listing_prices.valid_from", now)
      .or(`valid_to.is.null,valid_to.gt.${now}`, { referencedTable: "listing_prices" })
      .eq("listing_markets.market_code", "IN").eq("listing_markets.availability_status", "available").eq("listing_markets.compliance_status", "approved")
      .order("created_at", { ascending: false }).limit(Math.min(100, Math.max(1, Math.floor(filters.limit ?? 60))));
    if (filters.category) {
      const selected = categories.find((item) => item.slug === filters.category);
      if (!selected) return unavailable("available", categories);
      const selectedId = (categoryRows ?? []).find((row) => row.slug === selected.slug)?.id;
      const matching = (categoryRows ?? []).filter((row) => row.id === selectedId || row.parent_id === selectedId).map((row) => row.id);
      query = query.in("category_id", matching);
    }
    const { data: rows, error } = await query;
    if (error) throw error;
    const businessIds = [...new Set((rows ?? []).map((row) => row.business_id))];
    if (!businessIds.length) return unavailable("available", categories);
    const { data: providerProfiles, error: profileError } = await supabase.from("provider_profiles").select("business_id, provider_type, biography, credential_verification_status, published_status").in("business_id", businessIds).eq("published_status", "published").eq("credential_verification_status", "verified");
    if (profileError) throw profileError;
    const publicProviders = new Set((providerProfiles ?? []).map((profile) => profile.business_id));
    const categoryNames = new Map(categories.map((item) => [item.slug, item.name]));
    const services = (rows ?? []).flatMap((row) => {
      if (!publicProviders.has(row.business_id)) return [];
      const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
      const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
      const price = Array.isArray(row.listing_prices) ? row.listing_prices[0] : row.listing_prices;
      const offering = Array.isArray(row.service_offerings) ? row.service_offerings[0] : row.service_offerings;
      const location = offering && (Array.isArray(offering.provider_locations) ? offering.provider_locations[0] : offering.provider_locations);
      const city = location?.is_public && location.is_active ? location.city : null;
      const locality = location?.is_public && location.is_active ? location.locality : null;
      if (filters.city && !(city ?? "").toLocaleLowerCase().includes(filters.city.toLocaleLowerCase())) return [];
      if (filters.locality && !(locality ?? "").toLocaleLowerCase().includes(filters.locality.toLocaleLowerCase())) return [];
      return [{ id: row.id, businessId: row.business_id, title: row.title, description: row.description ?? "", categorySlug: category?.slug ?? null,
        categoryName: categoryNames.get(category?.slug ?? "") ?? category?.name ?? "", mode: offering?.delivery_mode ?? null, city, locality,
        pricePaise: price?.amount_minor ?? null, durationMinutes: offering?.duration_minutes ?? null, providerName: business?.display_name ?? "", providerSlug: row.business_id }];
    });
    return { state: "available", services, categories };
  } catch (error) {
    console.error("[services] Could not load published service listings.", error instanceof Error ? error.message : "Unknown Supabase error");
    return unavailable("error");
  }
}
