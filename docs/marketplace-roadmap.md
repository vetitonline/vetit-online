# Vetit Online marketplace roadmap

This roadmap extends the Astro/Supabase product marketplace into an India-first pet, livestock, and local animal-care services marketplace. It preserves the existing homepage brand and visual structure. This document distinguishes working features from foundations and planned work; sample homepage product cards are illustrative and are never service-provider or booking records.

## Architecture

- **Website:** Astro SSR on Vercel. Server-rendered routes use request-scoped Supabase clients and the existing Supabase authentication cookies.
- **Data and identity:** Supabase PostgreSQL in the Mumbai region, PostGIS for service locations, Supabase Auth for email and Indian phone OTP. Row-level security is the common access boundary.
- **Mobile app:** Use the same Supabase tables, Auth, RLS, and narrowly scoped RPCs. `search_services_nearby` is the shared geospatial query foundation; do not duplicate marketplace rules in a second database.
- **Payments:** Razorpay Route remains conditional on Vetit onboarding and eligibility. Trusted server code must create orders/transfers and process signed webhooks. The browser cart is not an order.
- **Trust and moderation:** Only verified businesses and providers with Vetit-published profiles can surface. Veterinary credentials and regulated-category review are explicit gates. Never store raw identity documents in public profile fields.

## Service and provider model

`businesses` remains the account/business owner boundary and supports provider-only or seller/provider accounts. `provider_profiles` holds the public profile, provider type, and Vetit-controlled verification/publication fields. `provider_locations` supports clinics, fixed sites, and mobile/farm service areas. `service_categories` contains the pet-care, veterinary, livestock, grooming, daycare/boarding, walking/training, transport, photography, activities, and extensible animal-care taxonomy. `listings` remains the common moderated product/service catalogue; its service fields carry category, delivery mode, price, duration, city/locality, geospatial area, and provider location.

Opening-hour rules and date exceptions are distinct from generated appointment slots. Slots must be generated from provider-entered availability; no sample provider, time slot, review, or booking should be seeded. `provider_appointment_slots`, `bookings`, and `booking_events` are the foundation for a transactional request/accept/pay/confirm workflow. Appointment transitions, cancellations, refunds, and payment state belong in trusted server operations, not client writes. Booking rows preserve timezone and a snapshot of the cancellation terms shown to the customer.

Product categories keep pet and livestock/cattle products first-class. Feed, supplements, farm supplies, and animal-care products have distinct categories. Veterinary medicines and pharmacy services require documented legal review before publication. Regulatory requirements must be reviewed before any regulated listings are activated.

## Routes and current behavior

- `/` keeps the existing Vetit homepage and original product artwork. Its service category links lead to discovery; its unsupported booking/provider metrics are labeled as previews or coming soon.
- `/products` reads published India product listings from Supabase.
- `/cart` stores a customer-side cart in the browser. Checkout and order placement are not implemented.
- `/login` uses the existing email and Indian-phone OTP helpers. Provider onboarding/verification is a separate, future flow.
- `/services` reads only real published service listings and filters by service category, city, and locality. Empty and error states do not invent providers.
- `/providers/[slug]` displays a published provider profile, real services, listed location/contact details, prices, and configured weekly hours. Reviews and appointment actions are explicitly unavailable until implemented.

The service route does not yet offer GPS permission, distance controls, same-day availability, or booking submission. The nearby-search RPC and PostGIS indexes are foundations for those features.

## Phased delivery

1. **Service foundation:** Apply the additive service-marketplace migration after reviewing it against the live Supabase schema. Verify RLS and the PostGIS RPC against the Mumbai project. No existing rows are deleted; category rows are taxonomy, not provider data.
2. **Provider onboarding and listings:** Build provider application/profile management, identity and credential verification, service creation, location management, opening hours, and moderation queue. Providers may manage drafts/submissions and archive published listings. Keep legal review separate for regulated categories.
3. **Discovery and trust:** Add distance/GPS search with explicit customer permission, availability-aware results, service details, verified-booking reviews, provider favorites, and saved products. Do not show ratings before verified reviews exist.
4. **Appointments:** Generate actual slots from provider rules and exceptions; implement an atomic slot hold plus booking-request endpoint. The flow is customer request → provider accepts → customer pays → booking confirmed. Add provider response expiry, reschedule/cancel actions, event history, and the approved cancellation/refund terms. Never confirm on request submission.
5. **Commerce and customer care:** Add trusted product order creation, Route split transfers only after eligibility, webhooks, shipment/delivery tracking, returns, and seller order management. Add customer accounts with multiple pet profiles, then reminders and carefully permissioned health records.
6. **Community and adjacent services:** Introduce location-based discussion spaces for pet owners, veterinarians, farmers, and local professionals with reporting/moderation. Add adoption/rescue only after operational and legal review. Keep livestock/cattle products, veterinary care, and farm services in all discovery and account flows.

## Current implementation limits

The repository migration is a proposal for the next Supabase schema version; it has not been applied to the hosted project. The live schema and data therefore remain unverified from this workspace. The service browse/profile routes require that migration before they can query their new tables. There is no provider onboarding UI, trusted booking endpoint, active checkout, notification service, review submission, pet-profile UI, or community feature yet.
