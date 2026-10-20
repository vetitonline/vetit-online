export function sellerListingState(status:string):{label:string;hint:string;editable:boolean};
export function filterSellerProducts<T extends {title:string;categoryName:string;moderation_status:string;business_id:string}>(products:T[], filters?:{status?:string;business?:string;query?:string}):T[];
