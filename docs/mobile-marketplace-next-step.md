# Vetit Online mobile app

The repository now contains a separate Expo/React Native application in `mobile/`. It consumes the existing, versioned `GET /api/catalog` endpoint through the shared client in `src/lib/marketplace/catalog-client.js`; mobile clients do not connect directly to Supabase.

The app currently provides marketplace home/category discovery, search, species and category filters, INR price filters, sorting, pagination, product details, loading/error/empty states, and a device-session preview cart. Services and sign-in link to the existing website. Native OTP, seller/admin management, service booking, cart persistence, checkout, and payments are not implemented.

Set `EXPO_PUBLIC_VETIT_API_BASE_URL` in `mobile/.env` to the API origin. Use the public HTTPS Vetit origin outside local development; use a host-reachable local address for a physical device. No Expo dependencies are installed in the repository yet. Install the dependencies in `mobile/package.json`, then run the Expo start/typecheck scripts and verify on iOS and Android simulators before treating this foundation as release-ready.
