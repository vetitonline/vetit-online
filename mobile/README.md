# Vetit Online mobile foundation

This standalone Expo/React Native app consumes the existing read-only `GET /api/catalog` endpoint through the shared client at `../src/lib/marketplace/catalog-client.js`, and published service discovery through `GET/POST /api/services` using `../src/lib/services/service-client.js`. It does not connect directly to Supabase and contains no Supabase keys.

Service filters use the shared city, locality, postcode, category and country-code contract. Location-based searches send latitude/longitude in a same-origin `POST` body rather than putting coordinates in a URL; the API returns a rounded distance and never returns provider coordinates. The mobile screen currently supports city/postcode search and links to the website for browser permission-based device location. A native location permission flow needs an approved Expo location module before it can be added.

## Run locally

Install only this standalone package with `pnpm -C mobile install --ignore-workspace`, copy `.env.example` to `.env`, then run `pnpm -C mobile start` and `pnpm -C mobile typecheck`. The `--ignore-workspace` flag is needed because the root pnpm workspace is dedicated to the web app; it keeps the mobile dependency graph separate. Set `EXPO_PUBLIC_VETIT_API_BASE_URL` to the Astro server origin for local development. A physical phone must use a host-reachable LAN address; Android emulators commonly use `http://10.0.2.2:<port>`. Keep the production setting on the public HTTPS Vetit origin.

The app uses public catalogue and service APIs for browsing. The in-memory basket is a preview: it is not synced, persisted, submitted as an order, or connected to payment. Appointment slots can be read through the existing API; booking, saved addresses, persistent carts and order creation remain dependent on the unapproved/unapplied commerce and appointment database proposals. Authentication, seller and admin operations are not represented as working mobile flows.

Native bundling and simulator/device checks require a complete install of the dependencies in `mobile/package.json`.
