const CATALOG_ROLES = new Set(['owner', 'admin', 'catalog_manager']);

/** Check signed-in identity, active membership, business ownership and allowed role together. */
export function canManageSellerBusiness(membership, userId, businessId, roles = CATALOG_ROLES) {
  return Boolean(membership
    && membership.profile_id === userId
    && membership.business_id === businessId
    && membership.membership_status === 'active'
    && roles.has(membership.member_role));
}

export function hasSellerCatalogRole(role) {
  return CATALOG_ROLES.has(role);
}

export function canEditSellerProduct(status) {
  return status === 'draft' || status === 'rejected';
}

/** Seller actions can request review, but never set a listing to published. */
export function canSellerTransitionListing(status, nextStatus) {
  return (status === 'draft' || status === 'rejected') && nextStatus === 'submitted';
}

export function canManageSellerImage(membership, userId, businessId, listingBusinessId, listingStatus) {
  return businessId === listingBusinessId
    && canManageSellerBusiness(membership, userId, businessId)
    && (listingStatus === 'draft' || listingStatus === 'rejected');
}
