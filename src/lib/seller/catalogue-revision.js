// Opaque decimal tokens: never parse revisions as JavaScript numbers or dates.
export function isCatalogueRevision(value){
 return typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)
  &&(value.length<19||value<='9223372036854775807');
}
export function validCatalogueReceipt(data,listingId,expectedRevision){
 return data?.apiVersion===2&&typeof data.listingId==='string'
  &&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.listingId)
  &&(!listingId||data.listingId.toLowerCase()===listingId.toLowerCase())
  &&isCatalogueRevision(data.revision)&&(!listingId||isCatalogueRevision(expectedRevision)
    &&(data.revision.length>expectedRevision.length||data.revision.length===expectedRevision.length&&data.revision>expectedRevision));
}
