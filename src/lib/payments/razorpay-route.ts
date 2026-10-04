import type {
  CreateMarketplacePayment,
  MarketplacePaymentGateway,
  MarketplacePaymentResult,
} from "./gateway";

export type RazorpayRouteReadiness = {
  credentialsConfigured: boolean;
  routeEnabled: boolean;
  eligibilityConfirmed: boolean;
  livePaymentsReady: boolean;
};

/** Safe to inspect in development; never exposes credentials to browser code. */
export function getRazorpayRouteReadiness(): RazorpayRouteReadiness {
  const credentialsConfigured = Boolean(
    import.meta.env.RAZORPAY_KEY_ID && import.meta.env.RAZORPAY_KEY_SECRET,
  );
  const routeEnabled = import.meta.env.RAZORPAY_ROUTE_ENABLED === "true";
  const eligibilityConfirmed =
    import.meta.env.RAZORPAY_ROUTE_ELIGIBILITY_CONFIRMED === "true";

  return {
    credentialsConfigured,
    routeEnabled,
    eligibilityConfirmed,
    livePaymentsReady:
      credentialsConfigured && routeEnabled && eligibilityConfirmed,
  };
}

/**
 * Prepared server-side integration point. No Razorpay request is made in Phase 1.
 * Live processing must remain gated until credentials and Route eligibility exist.
 */
export class RazorpayRouteGateway implements MarketplacePaymentGateway {
  async createMarketplacePayment(
    _input: CreateMarketplacePayment,
  ): Promise<MarketplacePaymentResult> {
    if (!getRazorpayRouteReadiness().livePaymentsReady) {
      throw new Error(
        "Razorpay Route payments are disabled until credentials are configured and Vetit eligibility is confirmed.",
      );
    }

    throw new Error(
      "Razorpay Route API calls are not implemented in the foundation phase.",
    );
  }
}
