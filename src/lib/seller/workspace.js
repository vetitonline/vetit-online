const states = {
  draft: {label:'Draft / ड्राफ्ट',hint:'Private draft. Complete prices, category, species and photos before submitting for review.',editable:true},
  submitted: {label:'In review / समीक्षा में',hint:'Submitted to Vetit. Editing and publication are controlled by the review workflow.',editable:false},
  published: {label:'Published / प्रकाशित',hint:'Published after Vetit review. Seller editing is unavailable in this state.',editable:false},
  rejected: {label:'Changes needed / बदलाव आवश्यक',hint:'Save corrections and submit again. This is not a published listing.',editable:true},
};
export function sellerListingState(status) { return states[status] ?? {label:'Status unavailable / स्थिति उपलब्ध नहीं है',hint:'Reload the workspace before taking action.',editable:false}; }
export function filterSellerProducts(products, {status='',business='',query=''} = {}) {
  const search = query.trim().toLocaleLowerCase().slice(0,160);
  return products.filter(product => (!status || product.moderation_status === status) && (!business || product.business_id === business) && (!search || `${product.title} ${product.categoryName}`.toLocaleLowerCase().includes(search)));
}
