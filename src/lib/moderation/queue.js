export class ReviewQueueError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function queueFilters(params) {
  const value = key => params.get(key) || null;
  const status = value('status') ?? 'submitted';
  const kind = value('kind'), market = value('market'), category = value('category');
  const before = value('before'), id = value('id');
  if (!['draft','submitted','published','rejected'].includes(status)
    || kind && !['product','service'].includes(kind)
    || market && !/^[A-Z]{2}$/.test(market)
    || category && !uuid.test(category)
    || Boolean(before) !== Boolean(id)
    || before && (!Number.isFinite(Date.parse(before)) || before.length > 40 || !uuid.test(id))
    || params.has('risk')) throw new ReviewQueueError('Invalid or unsupported queue filters.', 400);
  return { p_status: status, p_kind: kind, p_market: market, p_category: category, p_before_created: before, p_before_id: id, p_limit: 25 };
}
/** Caller MUST supply a user verified by getUser(), never decoded client claims. */
export async function loadReviewQueue(client, user, params) {
  if (!user || ![true,'true'].includes(user.app_metadata?.vetit_reviewer)) throw new ReviewQueueError('Reviewer access required.',403);
  const { data, error } = await client.rpc('admin_listing_queue', queueFilters(params));
  if (error) throw new ReviewQueueError('Review queue unavailable.',error.code === '42501' ? 403 : 503);
  if (!data || !Array.isArray(data.items) || data.items.length > 25 || typeof data.hasMore !== 'boolean'
      || data.items.some(item => !item || !uuid.test(item.id) || !uuid.test(item.business_id) || !uuid.test(item.category_id)
        || typeof item.title !== 'string' || typeof item.seller_name !== 'string'
        || !['draft','submitted','published','rejected'].includes(item.moderation_status)
        || !['product','service'].includes(item.kind) || item.risk !== 'not_assessed'
        || !Number.isFinite(Date.parse(item.created_at)) || !Number.isFinite(Date.parse(item.updated_at))
        || typeof item.seller_verification !== 'string')) throw new ReviewQueueError('Invalid review queue response.');
  return data;
}
