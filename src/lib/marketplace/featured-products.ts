import type { AstroCookies } from "astro";
import { createSupabaseServerClient } from "../supabase/server";
import { getSupabasePublicConfig } from "../supabase/config";

export type FeaturedProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  sellerName: string;
  pricePaise: number | null;
  imageUrl: string;
};

export type FeaturedProductsResult = {
  state: "unconfigured" | "available" | "error";
  products: FeaturedProduct[];
};

const categoryImages: Array<{ match: RegExp; imageUrl: string }> = [
  {
    match: /cattle|livestock|farm|feed|herd/i,
    imageUrl:
      "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=800&q=80",
  },
  {
    match: /cat|feline/i,
    imageUrl:
      "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80",
  },
  {
    match: /toy|play/i,
    imageUrl:
      "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=800&q=80",
  },
];

const defaultProductImage =
  "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=800&q=80";

function imageForCategory(category: string): string {
  return categoryImages.find(({ match }) => match.test(category))?.imageUrl ?? defaultProductImage;
}

/** Fetch public, moderation-approved India product listings. */
export async function getMarketplaceProducts(
  cookies: AstroCookies,
  requestedLimit = 100,
): Promise<FeaturedProductsResult> {
  if (!getSupabasePublicConfig()) {
    return { state: "unconfigured", products: [] };
  }

  try {
    const supabase = createSupabaseServerClient({ cookies });
    const { data: listings, error } = await supabase
      .from("listings")
      .select("id, business_id, title, description, category, price_paise")
      .eq("kind", "product")
      .eq("status", "published")
      .eq("country_code", "IN")
      .order("published_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, Math.floor(requestedLimit))));

    if (error) {
      throw error;
    }

    if (!listings?.length) {
      return { state: "available", products: [] };
    }

    const businessIds = [...new Set(listings.map((listing) => listing.business_id))];
    const { data: businesses, error: businessesError } = await supabase
      .from("businesses")
      .select("id, display_name")
      .in("id", businessIds);

    if (businessesError) {
      throw businessesError;
    }

    const sellerNames = new Map(
      (businesses ?? []).map((business) => [business.id, business.display_name]),
    );

    return {
      state: "available",
      products: listings.map((listing) => ({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        sellerName: sellerNames.get(listing.business_id) ?? "Verified Vetit seller",
        pricePaise: listing.price_paise,
        imageUrl: imageForCategory(listing.category),
      })),
    };
  } catch (error) {
    console.error(
      "[marketplace] Could not load featured products from Supabase.",
      error instanceof Error ? error.message : "Unknown Supabase error",
    );
    return { state: "error", products: [] };
  }
}

/** Fetch the small set used by the homepage. */
export function getFeaturedProducts(cookies: AstroCookies): Promise<FeaturedProductsResult> {
  return getMarketplaceProducts(cookies, 4);
}

export function formatPrice(pricePaise: number | null): string {
  if (pricePaise === null) {
    return "Price on request";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(pricePaise / 100);
}
