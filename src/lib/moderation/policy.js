import { sellerBusinessInput } from '../seller/validation.js';

/** Advisory rules only. Never accept these inputs/results as publication authority.
 * The future server coordinator must load policy and evidence from trusted storage,
 * bind checks to the current revision, and commit its decision under a row lock.
 */
export const INDIA_POLICY = Object.freeze({
  version: 'IN-2026-10-19.1', market: 'IN', currency: 'INR',
  automaticApproval: false,
});
const PASS = 'passed';
const KNOWN = new Set(['passed', 'failed', 'uncertain', 'unavailable']);
const REGULATED = new Set(['veterinary', 'live_animal', 'regulated']);

/** Reuse seller form validation without retaining personal application fields.
 * Duplicate/category results must come from authoritative server lookups.
 */
export function validateSellerApplication(input, {market = 'IN', duplicateStatus = 'unavailable', categoryEligible = false} = {}) {
  const reasons = [];
  if (!input || typeof input !== 'object') return {status:'failed',reasons:['APPLICATION_REQUIRED']};
  try {
    const form = {get:key=>input[key] ?? null,has:key=>Object.hasOwn(input,key)};
    sellerBusinessInput(form);
  } catch { reasons.push('BUSINESS_DETAILS_INVALID'); }
  if (typeof input.profileName !== 'string' || input.profileName.trim().length < 2 || input.profileName.trim().length > 120) reasons.push('PROFILE_REQUIRED');
  if (input.country !== market || !/^[A-Z]{2}$/.test(market)) reasons.push('MARKET_NOT_ELIGIBLE');
  if (!input.public_email && !input.public_phone) reasons.push('CONTACT_REQUIRED');
  if (input.public_phone && !/^\+?[0-9 ()-]{7,32}$/.test(input.public_phone)) reasons.push('CONTACT_INVALID');
  if (categoryEligible !== true) reasons.push('CATEGORY_NOT_ELIGIBLE');
  if (duplicateStatus !== 'passed') reasons.push('DUPLICATE_NOT_PASSED');
  return {status: reasons.length ? 'failed' : 'passed',reasons};
}

/** Configured phrase lists are operational policy, not a legal-compliance model.
 * Unknown policy cannot certify content. No terms or personal text are returned.
 */
export function evaluateTextRules(text, rules) {
  const groups = ['prohibited', 'restricted', 'suspicious'];
  if (typeof text !== 'string' || text.length > 10000 || !rules
      || !groups.every(key => Array.isArray(rules[key]) && rules[key].length <= 100
        && rules[key].every(term => typeof term === 'string' && term.trim().length > 1 && term.length <= 120))) {
    return { status: 'unavailable', reasons: ['TEXT_POLICY_UNAVAILABLE'] };
  }
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('en-IN').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const content = ` ${normalize(text)} `;
  const reasons = groups.filter(group => rules[group].some(term => {
    const phrase = normalize(term);
    return phrase && content.includes(` ${phrase} `);
  })).map(group => `TEXT_${group.toUpperCase()}`);
  return { status: reasons.length ? 'failed' : 'passed', reasons };
}

/** No personal identity documents or raw provider responses belong in this DTO. */
export function assessSubmission(snapshot, policy = INDIA_POLICY) {
  const reasons = new Set();
  let blocked = false;
  const add = (code, block = false) => { reasons.add(code); blocked ||= block; };
  if (!snapshot || !['seller', 'product', 'service'].includes(snapshot.type)) {
    return { policyVersion: policy?.version ?? 'unavailable', outcome: 'review', risk: 'unknown', reasons: ['INVALID_SNAPSHOT'], canPublish: false };
  }
  if (!policy || typeof policy.version !== 'string' || !policy.version || !/^[A-Z]{2}$/.test(policy.market ?? '') || !/^[A-Z]{3}$/.test(policy.currency ?? '')) add('POLICY_UNAVAILABLE');
  if (snapshot.market !== policy?.market || snapshot.country !== policy?.market) add('MARKET_NOT_ELIGIBLE');
  if (!snapshot.revision || typeof snapshot.revision !== 'string') add('REVISION_MISSING');
  const check = (name) => {
    const evidence = snapshot.checks?.[name];
    if (!evidence || !KNOWN.has(evidence.status) || evidence.revision !== snapshot.revision || evidence.status !== PASS) add(`${name.toUpperCase()}_NOT_PASSED`);
  };
  // Category classification must be authoritative, never inferred from seller text.
  if (!['ordinary', ...REGULATED].includes(snapshot.categoryClass)) add('CATEGORY_CLASSIFICATION_MISSING');
  for (const name of ['profile', 'business', 'ownership', 'category', 'duplicate', 'content']) check(name);
  if (snapshot.prohibited === true) add('PROHIBITED', true);
  else if (snapshot.prohibited !== false) add('PROHIBITION_CHECK_MISSING');
  if (snapshot.suspicious !== false) add('SUSPICIOUS_OR_UNCERTAIN');
  if (REGULATED.has(snapshot.categoryClass)) {
    check('professionalVerification');
    add('REGULATED_HUMAN_REVIEW');
  }
  if (snapshot.type !== 'seller') {
    check('species'); check('attributes'); check('sellerVerification');
    if (snapshot.currency !== policy?.currency || !Number.isSafeInteger(snapshot.priceMinor) || snapshot.priceMinor <= 0) add('INVALID_PRICE');
    if (!Array.isArray(snapshot.images) || !snapshot.images.length || snapshot.images.length > 5) add('IMAGES_REQUIRED');
    else {
      const identities = new Set();
      for (const image of snapshot.images) {
        if (!image || !image.contentHash || identities.has(image.contentHash) || image.revision !== snapshot.revision || image.status !== PASS) add('IMAGE_NOT_SCREENED');
        identities.add(image?.contentHash);
      }
    }
  }
  if (policy?.automaticApproval !== true || snapshot.categoryAllowsAutomaticApproval !== true) add('AUTOMATIC_APPROVAL_DISABLED');
  const codes = [...reasons].sort();
  return {
    policyVersion: policy?.version ?? 'unavailable',
    outcome: blocked ? 'blocked' : codes.length ? 'review' : 'eligible',
    risk: blocked ? 'prohibited' : REGULATED.has(snapshot.categoryClass) || snapshot.suspicious === true ? 'high' : codes.length ? 'unknown' : 'low',
    reasons: codes,
    // Eligibility is not authorization, even with a policy that permits automation.
    canPublish: false,
  };
}

/** Adapter boundary: no provider configured means unavailable, never passed.
 * Provider use requires separate approval/configuration; no network client here.
 */
export async function screenContent(input, { provider, timeoutMs = 2000 } = {}) {
  const unavailable = { status: 'unavailable', revision: input?.revision ?? null };
  if (!input?.revision || typeof provider?.screen !== 'function') return unavailable;
  let timer;
  const controller = new AbortController();
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => provider.screen(input, {signal:controller.signal})),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, Math.min(5000, Math.max(1, timeoutMs))); }),
    ]);
    if (!result || !KNOWN.has(result.status) || result.revision !== input.revision) return unavailable;
    return { status: result.status, revision: result.revision };
  } catch { return unavailable; }
  finally { clearTimeout(timer); controller.abort(); }
}
