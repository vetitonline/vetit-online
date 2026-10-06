import type { AstroCookies } from "astro";
import { createSupabaseServerClient } from "../supabase/server";
import { getSupabasePublicConfig } from "../supabase/config";

export type ServiceCategory = {
  slug: string;
  name: string;
  parentSlug: string | null;
  requiresProfessionalVerification: boolean;
  requiresLegalReview: boolean;
};

export type PublicService = {
  id: string;
  businessId: string;
  title: string;
  description: string;
  categorySlug: string | null;
  categoryName: string;
  mode: string | null;
  city: string | null;
  locality: string | null;
  pricePaise: number | null;
  durationMinutes: number | null;
  providerName: string;
  providerSlug: string | null;
};

export type ServicesResult = {
  state: "unconfigured" | "available" | "error";
  services: PublicService[];
  categories: ServiceCategory[];
};

export type ServiceSearch = {
  category?: string;
  city?: string;
  locality?: string;
  limit?: number;
};

function searchPattern(value: string): string {
  return `%${value.trim().slice(0, 100)}%`;
}

export async function getServiceCategories(cookies: AstroCookies): Promise<{
  state: ServicesResult["state"];
  categories: ServiceCategory[];
}> {
  if (!getSupabasePublicConfig()) return { state: "unconfigured", categories: [] };

  try {
    const supabase = createSupabaseServerClient({ cookies });
    const { data, error } = await supabase
      .from("service_categories")
      .select("slug, name, parent_slug, requires_professional_verification, requires_legal_review")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return {
      state: "available",
      categories: (data ?? []).map((category) => ({
        slug: category.slug,
        name: category.name,
        parentSlug: category.parent_slug,
        requiresProfessionalVerification: category.requires_professional_verification,
        requiresLegalReview: category.requires_legal_review,
      })),
    };
  } catch (error) {
    console.error("[services] Could not load service categories.", error instanceof Error ? error.message : "Unknown Supabase error");
    return { state: "error", categories: [] };
  }
}

/** Fetch only real, published services from verified providers. */
export async function getPublicServices(cookies: AstroCookies, filters: ServiceSearch = {}): Promise<ServicesResult> {
  if (!getSupabasePublicConfig()) return { state: "unconfigured", services: [], categories: [] };

  try {
    const supabase = createSupabaseServerClient({ cookies });
    const buildListingQuery = () => supabase
      .from("listings")
      .select("id, business_id, title, description, category, service_category_slug, service_mode, provider_location_id, service_city, service_locality, price_paise, service_duration_minutes, published_at")
      .eq("kind", "service")
      .eq("status", "published")
      .eq("country_code", "IN")
      .order("published_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, Math.floor(filters.limit ?? 60))));

    let directQuery = buildListingQuery();
    if (filters.category) directQuery = directQuery.eq("service_category_slug", filters.category);
    if (filters.city?.trim()) directQuery = directQuery.ilike("service_city", searchPattern(filters.city));
    if (filters.locality?.trim()) directQuery = directQuery.ilike("service_locality", searchPattern(filters.locality));

    const locationQuery = supabase
      .from("provider_locations")
      .select("id, business_id, city, locality")
      .eq("is_public", true);
    if (filters.city?.trim()) locationQuery.ilike("city", searchPattern(filters.city));
    if (filters.locality?.trim()) locationQuery.ilike("locality", searchPattern(filters.locality));

    const [{ data: directListings, error }, { categories, state: categoryState }, locationResult] = await Promise.all([
      directQuery,
      getServiceCategories(cookies),
      filters.city?.trim() || filters.locality?.trim()
        ? locationQuery
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (error) throw error;
    if (locationResult.error) throw locationResult.error;
    if (categoryState === "error") throw new Error("Service categories could not be loaded.");

    const matchingLocationIds = (locationResult.data ?? []).map((location) => location.id);
    let locationListings = [];
    if (matchingLocationIds.length) {
      let byLocationQuery = buildListingQuery().in("provider_location_id", matchingLocationIds);
      if (filters.category) byLocationQuery = byLocationQuery.eq("service_category_slug", filters.category);
      const { data, error: locationListingsError } = await byLocationQuery;
      if (locationListingsError) throw locationListingsError;
      locationListings = data ?? [];
    }

    const listingMap = new Map([...(directListings ?? []), ...locationListings].map((listing) => [listing.id, listing]));
    const listings = [...listingMap.values()]
      .sort((a, b) => Date.parse(b.published_at ?? "") - Date.parse(a.published_at ?? ""))
      .slice(0, Math.min(100, Math.max(1, Math.floor(filters.limit ?? 60))));

    if (!listings?.length) return { state: "available", services: [], categories };

    const businessIds = [...new Set(listings.map((listing) => listing.business_id))];
    const locationIds = [...new Set(listings.map((listing) => listing.provider_location_id).filter((id): id is string => Boolean(id)))];
    const [{ data: businesses, error: businessesError }, { data: profiles, error: profilesError }, { data: providerLocations, error: providerLocationsError }] = await Promise.all([
      supabase.from("businesses").select("id, display_name").in("id", businessIds),
      supabase.from("provider_profiles").select("business_id, slug").in("business_id", businessIds),
      locationIds.length
        ? supabase.from("provider_locations").select("id, city, locality").in("id", locationIds).eq("is_public", true)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (businessesError) throw businessesError;
    if (profilesError) throw profilesError;
    if (providerLocationsError) throw providerLocationsError;

    const names = new Map((businesses ?? []).map((business) => [business.id, business.display_name]));
    const slugs = new Map((profiles ?? []).map((profile) => [profile.business_id, profile.slug]));
    const providerLocationsById = new Map((providerLocations ?? []).map((location) => [location.id, location]));
    const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));

    return {
      state: "available",
      categories,
      services: listings.map((listing) => ({
        id: listing.id,
        businessId: listing.business_id,
        title: listing.title,
        description: listing.description,
        categorySlug: listing.service_category_slug,
        categoryName: (listing.service_category_slug && categoryNames.get(listing.service_category_slug)) || listing.category,
        mode: listing.service_mode,
        city: listing.service_city ?? providerLocationsById.get(listing.provider_location_id ?? "")?.city ?? null,
        locality: listing.service_locality ?? providerLocationsById.get(listing.provider_location_id ?? "")?.locality ?? null,
        pricePaise: listing.price_paise,
        durationMinutes: listing.service_duration_minutes,
        providerName: names.get(listing.business_id) ?? "Verified Vetit provider",
        providerSlug: slugs.get(listing.business_id) ?? null,
      })),
    };
  } catch (error) {
    console.error("[services] Could not load published service listings.", error instanceof Error ? error.message : "Unknown Supabase error");
    return { state: "error", services: [], categories: [] };
  }
}
