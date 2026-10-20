export type QueueItem = { id: string; business_id: string; category_id: string; title: string; seller_name: string; seller_verification: string; kind: 'product' | 'service'; moderation_status: 'draft' | 'submitted' | 'published' | 'rejected'; created_at: string; updated_at: string; risk: 'not_assessed' };
export type QueuePage = { items: QueueItem[]; hasMore: boolean };
export type QueueClient = { rpc(name: string, args: object): PromiseLike<{data: unknown; error: {code: string} | null}> };
export class ReviewQueueError extends Error { status: number; constructor(message: string,status?: number); }
export function queueFilters(params: URLSearchParams): {p_status: string; p_kind: string | null; p_market: string | null; p_category: string | null; p_before_created: string | null; p_before_id: string | null; p_limit: number};
export function loadReviewQueue(client: QueueClient, user: {app_metadata?: Record<string, unknown>} | null, params: URLSearchParams): Promise<QueuePage>;
