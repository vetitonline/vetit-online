export function sellerListingState(status:string):{label:string;hint:string;editable:boolean};
export type SellerCatalogueFilters={status?:string;business?:string;query?:string};
export function filterSellerProducts<T extends {moderation_status:string;business_id:string;title:string;categoryName?:string}>(products:T[],filters?:SellerCatalogueFilters):T[];
