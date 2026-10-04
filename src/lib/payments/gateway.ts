export type PaymentSplit = {
  sellerBusinessId: string;
  amountPaise: number;
};

export type CreateMarketplacePayment = {
  orderId: string;
  totalPaise: number;
  splits: PaymentSplit[];
};

export type MarketplacePaymentResult = {
  providerPaymentId: string;
  checkoutUrl?: string;
};

/** Provider-neutral boundary keeps marketplace logic portable across hosts/gateways. */
export interface MarketplacePaymentGateway {
  createMarketplacePayment(
    input: CreateMarketplacePayment,
  ): Promise<MarketplacePaymentResult>;
}
