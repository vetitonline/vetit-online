export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
  /** Optional public-read Storage bucket for listing_images object paths. */
  listingImagesBucket: string | null;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return null;
  }

  return {
    url,
    publishableKey,
    listingImagesBucket: import.meta.env.PUBLIC_SUPABASE_LISTING_IMAGES_BUCKET?.trim() || null,
  };
}
