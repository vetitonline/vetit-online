import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginRun, cleanupRun, createRunManifest, createTestClients, ensureMarketplaceFixtures,
  provisionIdentity, recordBusiness, recordImagePath, recordListing, resolveTestTarget, verifyTestTarget,
} from './seller-test-support.mjs';

const env = process.env;
let target;
try { target = resolveTestTarget(env); } catch { target = null; }
const integrationEnabled = env.VETIT_SELLER_INTEGRATION === '1'
  && target
  && env.SUPABASE_ANON_KEY
  && env.SUPABASE_SERVICE_ROLE_KEY
  && (target.mode === 'local-disposable' || env.SUPABASE_ACCESS_TOKEN);

const productInput = (businessId, categoryId, speciesId, runId, suffix, overrides = {}) => ({
  p_listing_id: null,
  p_business_id: businessId,
  p_title: `Vetit test ${suffix}`,
  p_slug: `vetit-test-${runId.replaceAll('-', '')}-${suffix.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
  p_description: `Isolated test fixture ${runId}; not a real product.`,
  p_category_id: categoryId,
  p_species_ids: [speciesId],
  p_base_amount_minor: 49900,
  p_variants: [],
  ...overrides,
});

async function saveProduct(client, admin, manifest, input) {
  const saved = await client.rpc('save_seller_product', input);
  assert.ifError(saved.error);
  await recordListing(admin, manifest, saved.data, input.p_business_id);
  return saved.data;
}

test('seller backend integration: ownership, moderation, image security and concurrency (Test/local disposable only)', {
  skip: !integrationEnabled,
}, async (t) => {
  const checkedTarget = await verifyTestTarget(env);
  const { anonymous, admin } = createTestClients(env, checkedTarget);
  const manifest = createRunManifest(checkedTarget);
  await beginRun(admin, manifest, env);
  t.after(async () => cleanupRun(admin, manifest, env));

  const taxonomy = await ensureMarketplaceFixtures(admin, manifest, env);
  const [sellerA, sellerB, buyer, vetitAdmin] = await Promise.all([
    provisionIdentity(admin, anonymous, manifest, 'seller-a', env),
    provisionIdentity(admin, anonymous, manifest, 'seller-b', env),
    provisionIdentity(admin, anonymous, manifest, 'buyer', env),
    provisionIdentity(admin, anonymous, manifest, 'admin', env),
  ]);

  let businessA;
  let businessB;
  let draftListing;
  let imageListing;
  let imagePath;

  await t.test('onboarding retries are idempotent and seller profiles stay private', async () => {
    const businessInput = (role) => ({
      p_display_name: `Vetit Test ${manifest.runId} ${role}`,
      p_legal_name: `Private Test Legal ${manifest.runId}`,
      p_business_type: 'individual', p_public_email: null, p_public_phone: null, p_website_url: null,
    });
    const createA = () => sellerA.rpc('create_seller_business', businessInput('Seller A'));
    const [first, retry] = await Promise.all([createA(), createA()]);
    assert.ifError(first.error);
    assert.ifError(retry.error);
    assert.equal(first.data, retry.data);
    businessA = first.data;
    await recordBusiness(admin, manifest, businessA, 'seller-a', env);

    const other = await sellerB.rpc('create_seller_business', businessInput('Seller B'));
    assert.ifError(other.error);
    businessB = other.data;
    assert.notEqual(businessA, businessB);
    await recordBusiness(admin, manifest, businessB, 'seller-b', env);

    const anonymousPrivate = await anonymous.from('businesses').select('legal_name').eq('id', businessA).maybeSingle();
    assert.ok(anonymousPrivate.error, 'anonymous callers cannot select legal_name');
    const sellerPrivate = await sellerA.from('businesses').select('legal_name').eq('id', businessA).maybeSingle();
    assert.ok(sellerPrivate.error, 'authenticated sellers cannot select legal_name directly');
    const own = await sellerA.rpc('get_my_seller_businesses');
    assert.ifError(own.error);
    assert.deepEqual(own.data.map(row => row.id), [businessA]);
    const otherSeller = await sellerB.rpc('get_my_seller_businesses');
    assert.ifError(otherSeller.error);
    assert.ok(!otherSeller.data.some(row => row.id === businessA));
  });

  await t.test('seller ownership, draft editing, submission and rejection review', async () => {
    const badVariants = await sellerA.rpc('save_seller_product', productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'bad-variants', { p_variants: { bad: true }, p_base_amount_minor: null }));
    assert.ok(badVariants.error);
    const wrongOwner = await sellerB.rpc('save_seller_product', productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'cross-business'));
    assert.ok(wrongOwner.error);
    const sellerCannotModerate = await sellerA.rpc('review_seller_business', { p_business_id: businessA, p_decision: 'verified' });
    assert.ok(sellerCannotModerate.error);
    const verifiedBusiness = await vetitAdmin.rpc('review_seller_business', { p_business_id: businessA, p_decision: 'verified' });
    assert.ifError(verifiedBusiness.error);
    const profile = await sellerA.from('profiles').select('id').eq('id', sellerA.vetitTestUserId).single();
    assert.ifError(profile.error);
    assert.equal(profile.data.id, sellerA.vetitTestUserId, 'onboarding initializes/reuses only the signed-in profile');

    draftListing = await saveProduct(sellerA, admin, manifest,
      productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'owned-draft'));
    const hiddenFromOtherSeller = await sellerB.from('listings').select('id').eq('id', draftListing);
    assert.ifError(hiddenFromOtherSeller.error);
    assert.equal(hiddenFromOtherSeller.data.length, 0);
    const crossEdit = await sellerB.rpc('save_seller_product', productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'cross-edit', { p_listing_id: draftListing }));
    assert.ok(crossEdit.error);
    const directStatus = await sellerA.from('listings').update({ moderation_status: 'submitted' }).eq('id', draftListing);
    assert.ok(directStatus.error, 'listing moderation status cannot be changed through direct table writes');

    const edit = await sellerA.rpc('save_seller_product', productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'edited-draft', {
      p_listing_id: draftListing, p_title: 'Vetit test edited draft', p_base_amount_minor: 69900,
    }));
    assert.ifError(edit.error);
    assert.equal(edit.data, draftListing);

    const submit = await sellerA.rpc('submit_seller_product', { p_business_id: businessA, p_listing_id: draftListing });
    assert.ifError(submit.error);
    const reject = await vetitAdmin.rpc('review_seller_listing', { p_listing_id: draftListing, p_decision: 'reject' });
    assert.ifError(reject.error);
    const rejected = await sellerA.from('listings').select('moderation_status').eq('id', draftListing).single();
    assert.ifError(rejected.error);
    assert.equal(rejected.data.moderation_status, 'rejected');
    const rejectedMarket = await sellerA.from('listing_markets').select('compliance_status').eq('listing_id', draftListing).eq('market_code', 'IN').single();
    assert.ifError(rejectedMarket.error);
    assert.equal(rejectedMarket.data.compliance_status, 'rejected');
    const revise = await sellerA.rpc('save_seller_product', productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'resubmitted', {
      p_listing_id: draftListing, p_title: 'Vetit test revised after rejection', p_base_amount_minor: 79900,
    }));
    assert.ifError(revise.error);
    const renewedCompliance = await sellerA.from('listing_markets').select('compliance_status').eq('listing_id', draftListing).eq('market_code', 'IN').single();
    assert.ifError(renewedCompliance.error);
    assert.equal(renewedCompliance.data.compliance_status, 'pending', 'content edits after rejection require fresh compliance review');
    const renewedReview = await sellerA.rpc('submit_seller_product', { p_business_id: businessA, p_listing_id: draftListing });
    assert.ifError(renewedReview.error);
  });

  await t.test('draft image access, canonical paths, MIME and size limits', async () => {
    imageListing = await saveProduct(sellerA, admin, manifest,
      productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'image-permissions'));
    const directory = `${businessA}/${imageListing}`;
    imagePath = `${directory}/${crypto.randomUUID()}.png`;
    const reservation = await sellerA.from('listing_images').insert({
      listing_id: imageListing, storage_object_path: imagePath, alt_text: `Test run ${manifest.runId}`,
    }).select('id').single();
    assert.ifError(reservation.error);
    await recordImagePath(admin, manifest, imagePath, imageListing, env);

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7s8AAAAASUVORK5CYII=', 'base64');
    const uploaded = await sellerA.storage.from('listing-images').upload(imagePath, png, { contentType: 'image/png', upsert: false });
    assert.ifError(uploaded.error);
    const crossSellerRead = await sellerB.storage.from('listing-images').createSignedUrl(imagePath, 60);
    assert.ok(crossSellerRead.error);
    const anonymousDraftRead = await anonymous.storage.from('listing-images').createSignedUrl(imagePath, 60);
    assert.ok(anonymousDraftRead.error);
    const buyerDraftRead = await buyer.storage.from('listing-images').createSignedUrl(imagePath, 60);
    assert.ok(buyerDraftRead.error);

    const wrongMimePath = `${directory}/${crypto.randomUUID()}.png`;
    const wrongMimeReservation = await sellerA.from('listing_images').insert({ listing_id: imageListing, storage_object_path: wrongMimePath }).select('id').single();
    assert.ifError(wrongMimeReservation.error);
    await recordImagePath(admin, manifest, wrongMimePath, imageListing, env);
    const wrongMime = await sellerA.storage.from('listing-images').upload(wrongMimePath, png, { contentType: 'text/plain', upsert: false });
    assert.ok(wrongMime.error, 'Storage rejects MIME types outside the configured image allowlist');
    const cancelWrongMime = await sellerA.rpc('cancel_seller_image_reservation', { p_image_id: wrongMimeReservation.data.id });
    assert.ifError(cancelWrongMime.error);

    const oversizedPath = `${directory}/${crypto.randomUUID()}.png`;
    const oversizedReservation = await sellerA.from('listing_images').insert({ listing_id: imageListing, storage_object_path: oversizedPath }).select('id').single();
    assert.ifError(oversizedReservation.error);
    await recordImagePath(admin, manifest, oversizedPath, imageListing, env);
    const oversized = await sellerA.storage.from('listing-images').upload(oversizedPath, Buffer.alloc(5 * 1024 * 1024 + 1), { contentType: 'image/png', upsert: false });
    assert.ok(oversized.error, 'Storage rejects files above the configured 5 MB cap');
    const cancelOversized = await sellerA.rpc('cancel_seller_image_reservation', { p_image_id: oversizedReservation.data.id });
    assert.ifError(cancelOversized.error);
  });

  await t.test('buyer visibility and trusted moderation; concurrent decisions serialize', async () => {
    const submitImageListing = await sellerA.rpc('submit_seller_product', { p_business_id: businessA, p_listing_id: imageListing });
    assert.ifError(submitImageListing.error);

    const publicBefore = await anonymous.from('listings').select('id').eq('id', imageListing);
    assert.ifError(publicBefore.error);
    assert.equal(publicBefore.data.length, 0);

    const outcomes = await Promise.all([
      vetitAdmin.rpc('review_seller_listing', { p_listing_id: imageListing, p_decision: 'publish' }),
      vetitAdmin.rpc('review_seller_listing', { p_listing_id: imageListing, p_decision: 'reject' }),
    ]);
    assert.equal(outcomes.filter(result => !result.error).length, 1, 'only one concurrent moderation decision can win');
    const finalRow = await admin.from('listings').select('moderation_status').eq('id', imageListing).single();
    assert.ifError(finalRow.error);
    if (finalRow.data.moderation_status === 'published') {
      const buyerRead = await buyer.from('listings').select('id').eq('id', imageListing).single();
      assert.ifError(buyerRead.error);
      const anonymousImage = await anonymous.storage.from('listing-images').createSignedUrl(imagePath, 60);
      assert.ifError(anonymousImage.error);
      const buyerImage = await buyer.storage.from('listing-images').createSignedUrl(imagePath, 60);
      assert.ifError(buyerImage.error);
      const sellerMutation = await sellerA.from('listing_images').delete().eq('storage_object_path', imagePath).select('id');
      assert.ifError(sellerMutation.error);
      assert.equal(sellerMutation.data.length, 0);
    } else {
      const buyerRead = await buyer.from('listings').select('id').eq('id', imageListing);
      assert.ifError(buyerRead.error);
      assert.equal(buyerRead.data.length, 0);
    }
    const sellerAdminAttempt = await sellerB.rpc('review_seller_listing', { p_listing_id: imageListing, p_decision: 'publish' });
    assert.ok(sellerAdminAttempt.error, 'seller JWTs cannot acquire administrator moderation privileges');
  });

  await t.test('concurrent seller edit and submit produce one consistent listing version', async () => {
    const raceListing = await saveProduct(sellerA, admin, manifest,
      productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'save-submit-race'));
    const before = await sellerA.from('listings').select('slug').eq('id', raceListing).single();
    assert.ifError(before.error);
    const results = await Promise.allSettled([
      sellerA.rpc('save_seller_product', productInput(businessA, taxonomy.categoryId, taxonomy.speciesId, manifest.runId, 'race-updated', {
        p_listing_id: raceListing, p_slug: before.data.slug, p_title: 'Vetit test concurrent edit', p_base_amount_minor: 89900,
      })),
      sellerA.rpc('submit_seller_product', { p_business_id: businessA, p_listing_id: raceListing }),
    ]);
    const submitted = await sellerA.from('listings').select('moderation_status,title').eq('id', raceListing).single();
    assert.ifError(submitted.error);
    assert.ok(['submitted', 'draft'].includes(submitted.data.moderation_status));
    const price = await sellerA.from('listing_prices').select('amount_minor,status').eq('listing_id', raceListing).eq('market_code', 'IN').eq('status', 'active');
    assert.ifError(price.error);
    assert.equal(price.data.length, 1);
    assert.ok(['49900', '89900'].includes(String(price.data[0].amount_minor)));
    assert.ok(results.some(result => result.status === 'fulfilled'));
  });
});

if (!integrationEnabled) {
  test('seller backend integration requires explicit Test/local-disposable opt-in and the unapplied cleanup support SQL', {
    skip: 'No remote or local database writes were attempted. Configure dedicated Test-only credentials after cleanup support is reviewed and approved.',
  }, () => {});
}
