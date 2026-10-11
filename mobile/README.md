# Vetit Online mobile foundation

This standalone Expo/React Native app consumes the existing read-only `GET /api/catalog` endpoint through the shared client at `../src/lib/marketplace/catalog-client.js`. It does not connect directly to Supabase and contains no Supabase keys.

## Run locally

Install only this standalone package with `pnpm -C mobile install --ignore-workspace`, copy `.env.example` to `.env`, then run `pnpm -C mobile start` and `pnpm -C mobile typecheck`. The `--ignore-workspace` flag is needed because the root pnpm workspace is dedicated to the web app; it keeps the mobile dependency graph separate. Set `EXPO_PUBLIC_VETIT_API_BASE_URL` to the Astro server origin for local development. A physical phone must use a host-reachable LAN address; Android emulators commonly use `http://10.0.2.2:<port>`. Keep the production setting on the public HTTPS Vetit origin.

The app uses only the public catalogue API for product and taxonomy reads. The in-memory basket is a preview: it is not synced, persisted, submitted as an order, or connected to payment. Authentication, seller, admin, booking, and checkout actions remain web/API dependencies and are not represented as working mobile flows.

Native bundling and simulator/device checks require a complete install of the dependencies in `mobile/package.json`.
