export type MarketplaceDestinationKey='products'|'animals'|'services'|'appointments';
export function marketplaceDestinations(language?:string):{key:MarketplaceDestinationKey;title:string;description:string;href:string;image:string;art:string}[];
export function marketplaceNavigation(key:MarketplaceDestinationKey):{tab:'shop'|'services'|null;path:string|null;clearFilters:boolean};
