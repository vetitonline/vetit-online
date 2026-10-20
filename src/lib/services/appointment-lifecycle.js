/** Shared command validation and policy previews. PostgreSQL remains authoritative. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCE_KEY = /^[a-zA-Z0-9_-]{1,80}$/;
export const DEFAULT_PROVIDER_TIMEZONE = 'Asia/Kolkata';
export const INITIAL_APPOINTMENT_POLICY = Object.freeze({
  allowCustomerCancellation: true, allowReschedule: true, allowLateCancellation: false,
  noticeMinutes: 1440, refundBasisPoints: 10000, lateRefundBasisPoints: 0, offerExpiryMinutes: 15,
  lateCancellationChargePermitted: false, lateCancellationChargeDisclosure: '',
});
export class AppointmentLifecycleError extends Error {
  constructor(message, status = 422) { super(message); this.name = 'AppointmentLifecycleError'; this.status = status; }
}
export function appointmentId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new AppointmentLifecycleError('Appointment identifier is invalid.');
  return value.toLowerCase();
}
/** Validate a future provider-local display/scheduling timezone without adding it to current RPC commands. */
export function normalizeProviderTimezone(value = DEFAULT_PROVIDER_TIMEZONE) {
  if (typeof value !== 'string' || value.length > 64 || /[\u0000-\u001f\u007f\s]/.test(value)) {
    throw new AppointmentLifecycleError('Provider timezone is invalid.');
  }
  try { new Intl.DateTimeFormat('en', { timeZone: value }); }
  catch { throw new AppointmentLifecycleError('Provider timezone is invalid.'); }
  return value;
}
/** The launch model is one booking per named resource; pooled capacity is deliberately unsupported. */
export function normalizeAppointmentResourceKey(value = 'default') {
  if (typeof value !== 'string' || !RESOURCE_KEY.test(value)) throw new AppointmentLifecycleError('Schedule resource is invalid.');
  return value;
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new AppointmentLifecycleError('Appointment policy value is invalid.');
  return value;
}
function boolean(value) {
  if (typeof value !== 'boolean') throw new AppointmentLifecycleError('Appointment policy flag is invalid.');
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new AppointmentLifecycleError('Appointment time must include a timezone.');
  }
  return new Date(value).toISOString();
}
function window(from, to, days) {
  const startsAt = timestamp(from), endsAt = timestamp(to);
  if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > days * 86400000) {
    throw new AppointmentLifecycleError('Appointment time window is invalid.');
  }
  return { startsAt, endsAt };
}
export function normalizeAppointmentPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppointmentLifecycleError('Appointment policy is required.');
  const policy = {
    allowCustomerCancellation: boolean(value.allowCustomerCancellation),
    allowReschedule: boolean(value.allowReschedule),
    allowLateCancellation: boolean(value.allowLateCancellation),
    noticeMinutes: integer(value.noticeMinutes, 0, 43200),
    refundBasisPoints: integer(value.refundBasisPoints, 0, 10000),
    lateRefundBasisPoints: integer(value.lateRefundBasisPoints, 0, 10000),
    offerExpiryMinutes: integer(value.offerExpiryMinutes, 1, 1440),
    lateCancellationChargePermitted: boolean(value.lateCancellationChargePermitted ?? false),
    lateCancellationChargeDisclosure: value.lateCancellationChargeDisclosure ?? '',
  };
  if (typeof policy.lateCancellationChargeDisclosure !== 'string' || policy.lateCancellationChargeDisclosure.length > 500
    || /[\u0000-\u001f\u007f]/.test(policy.lateCancellationChargeDisclosure)) throw new AppointmentLifecycleError('Late cancellation disclosure is invalid.');
  if (policy.allowLateCancellation && policy.lateRefundBasisPoints < 10000
    && (!policy.lateCancellationChargePermitted || policy.lateCancellationChargeDisclosure.trim().length < 10)) {
    throw new AppointmentLifecycleError('A late cancellation charge must be permitted and disclosed before it can be configured.');
  }
  return policy;
}
export function normalizeAppointmentCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppointmentLifecycleError('Appointment command is invalid.');
  const id = (key) => appointmentId(input[key]);
  const revision = input.expectedRevision === undefined ? {} : { expectedRevision: integer(input.expectedRevision,1,2147483647) };
  switch (input.action) {
    case 'book': {
      const marketCode = input.marketCode ?? 'IN';
      if (typeof marketCode !== 'string' || !/^[A-Z]{2}$/.test(marketCode)) throw new AppointmentLifecycleError('Market is invalid.');
      let quote = {};
      if (input.expectedPriceMinor !== undefined || input.expectedCurrencyCode !== undefined) {
        if (typeof input.expectedCurrencyCode !== 'string' || !/^[A-Z]{3}$/.test(input.expectedCurrencyCode)) throw new AppointmentLifecycleError('Quoted currency is invalid.');
        quote = { expectedPriceMinor: integer(input.expectedPriceMinor, 0, Number.MAX_SAFE_INTEGER), expectedCurrencyCode: input.expectedCurrencyCode };
      }
      return { action: input.action, slotId: id('slotId'), marketCode, ...quote,
        ...(input.expectedPolicy === undefined ? {} : { expectedPolicy: normalizeAppointmentPolicy(input.expectedPolicy) }) };
    }
    case 'cancel':
      return { action: input.action, bookingId: id('bookingId'), ...revision, ...(input.providerCancellation === undefined ? {} : { providerCancellation: boolean(input.providerCancellation) }) };
    case 'confirm': case 'complete':
      return { action: input.action, bookingId: id('bookingId'), ...revision };
    case 'reschedule': return { action: input.action, bookingId: id('bookingId'), slotId: id('slotId'), ...revision };
    case 'joinWaitlist': {
      const marketCode = input.marketCode ?? 'IN';
      if (typeof marketCode !== 'string' || !/^[A-Z]{2}$/.test(marketCode)) throw new AppointmentLifecycleError('Market is invalid.');
      return { action: input.action, serviceListingId: id('serviceListingId'), marketCode, ...window(input.startsAt, input.endsAt, 31) };
    }
    case 'leaveWaitlist': return { action: input.action, entryId: id('entryId') };
    case 'acceptOffer': case 'declineOffer': return { action: input.action, offerId: id('offerId') };
    case 'setPolicy': return { action: input.action, serviceListingId: id('serviceListingId'), policy: normalizeAppointmentPolicy(input.policy) };
    case 'scheduleSlot': {
      const resourceKey = normalizeAppointmentResourceKey(input.resourceKey ?? 'default');
      return { action: input.action, serviceListingId: id('serviceListingId'), ...window(input.startsAt, input.endsAt, 1), resourceKey };
    }
    case 'blockSlot': case 'reopenSlot': return { action: input.action, slotId: id('slotId') };
    case 'readNotification': return { action: input.action, notificationId: id('notificationId') };
    default: throw new AppointmentLifecycleError('Appointment action is unsupported.');
  }
}
/** Display-only estimate. Never used to authorize a mutation or execute a refund. */
export function previewAppointmentCancellation({ policy, startsAt, now = Date.now(), capturedMinor = 0, providerCancellation = false }) {
  const rules = normalizeAppointmentPolicy(policy);
  const start = Date.parse(timestamp(startsAt));
  if (!Number.isFinite(now) || !Number.isSafeInteger(capturedMinor) || capturedMinor < 0) throw new AppointmentLifecycleError('Cancellation preview is invalid.');
  const timely = now <= start - rules.noticeMinutes * 60000;
  const allowed = providerCancellation || (now < start && rules.allowCustomerCancellation && (timely || rules.allowLateCancellation));
  const basisPoints = providerCancellation ? 10000 : timely ? rules.refundBasisPoints : rules.lateRefundBasisPoints;
  return { allowed, refundMinor: allowed ? Number(BigInt(capturedMinor) * BigInt(basisPoints) / 10000n) : 0, paymentAction: capturedMinor > 0 ? 'review_required' : 'none' };
}
export function previewAppointmentReschedule({ policy, startsAt, now = Date.now() }) {
  const rules = normalizeAppointmentPolicy(policy), start = Date.parse(timestamp(startsAt));
  if (!Number.isFinite(now)) throw new AppointmentLifecycleError('Rescheduling preview is invalid.');
  return rules.allowReschedule && now < start && now <= start - rules.noticeMinutes * 60000;
}
export function formatAppointmentAmount(minor, currencyCode) {
  if (!Number.isSafeInteger(minor) || minor < 0 || typeof currencyCode !== 'string' || !/^[A-Z]{3}$/.test(currencyCode)) throw new AppointmentLifecycleError('Appointment amount is invalid.');
  const formatter = new Intl.NumberFormat('en-IN',{ style:'currency', currency:currencyCode });
  return formatter.format(minor / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
}
