# Customer marketplace data requirements

The customer marketplace routes use the existing `public.listings` and `public.businesses` tables and only return published India product listings. The service discovery routes continue to use the provider/service foundation. No migration is applied by this implementation.

## Current behavior with the existing production schema

- Listing title, description, legacy category text, INR price, seller name, and publication status come from existing Supabase tables.
- Category browsing uses an extensible application taxonomy and matches the existing free-text listing category/title/description. The taxonomy does not fabricate products.
- Product images are category illustrations because the current production listings schema has no confirmed product-photo field. Product detail pages label them as illustrations.
- Brand is not returned because the current schema does not have a confirmed brand column. Brand filtering becomes available when seller brand data is stored.
- “Active published marketplace listing” describes listing publication status only; it is not an inventory/stock guarantee.
- Product detail routes show only an active published India listing. Cart persistence remains browser-local and checkout is not enabled.

## Database work required before richer catalog fields

Extend the un-applied marketplace migration (or create a subsequent additive migration) to:

1. Seed `product_categories` with the complete dog and cat subcategory hierarchy (puppy, adult, senior and veterinary/diet dog food; kitten/adult cat food; treats, litter, toys, grooming, accessories, and health/care) and livestock categories (cattle feed, calf products, supplements, animal care, farm supplies, equipment). Preserve parent-category relationships and allow adding other animal roots later.
2. Add a nullable `brand text` column to `public.listings` (or a normalized brand table if brand management/search becomes substantial). Existing rows should remain valid and null until sellers provide the value.
3. Use the planned nullable `public_image_url` listing field for seller-provided product photos, after that migration has been applied to production and image moderation/storage policy is decided. Do not populate it with inferred images.
4. If customers need actual stock availability, add an explicit inventory/availability model later. Listing status is moderation/publication status and must not be treated as stock quantity.

No web-only catalog schema is proposed: the same `listings`, category, seller, and future catalog fields can be consumed by the website and mobile API.
