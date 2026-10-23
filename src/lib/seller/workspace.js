const states = {
  draft: {label:'Draft / ड्राफ्ट',hint:'Private draft. Complete prices, category, species and photos before submitting for review.',editable:true},
  submitted: {label:'In review / समीक्षा में',hint:'Submitted to Vetit. Editing and publication are controlled by the review workflow.',editable:false},
  published: {label:'Published / प्रकाशित',hint:'Published after Vetit review. Seller editing is unavailable in this state.',editable:false},
  rejected: {label:'Changes needed / बदलाव आवश्यक',hint:'Save corrections and submit again. This is not a published listing.',editable:true},
};
export function sellerListingState(status) { return states[status] ?? {label:'Status unavailable / स्थिति उपलब्ध नहीं है',hint:'Reload the workspace before taking action.',editable:false}; }
export function filterSellerProducts(products, {status='',business='',query=''} = {}) {
  // Keep regional vowel/combining marks; normalize equivalent Unicode spellings
  // without relying on the device's locale or requiring words in title order.
  const fold = value => String(value ?? '').normalize('NFKC').toLowerCase();
  const terms = fold(String(query).slice(0,160)).trim().split(/\s+/u).filter(Boolean);
  return products.filter(product => (!status || product.moderation_status === status) && (!business || product.business_id === business) && terms.every(term => fold(`${product.title ?? ''} ${product.categoryName ?? ''}`).includes(term)));
}
