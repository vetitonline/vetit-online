import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistanceKm,
  matchServiceLocation,
  normalizePostalCode,
  normalizeServiceSearch,
  ServiceSearchError,
} from '../src/lib/services/service-search.js';

const publicLocation = {
  country_code: 'IN', is_public: true, is_active: true,
  city: 'Pune', locality: 'Koregaon Park', postal_code: '411 001', latitude: 18.5362, longitude: 73.8939,
};

test('shared service search normalizes India defaults and bounds location/radius input', () => {
  assert.deepEqual(normalizeServiceSearch(new URLSearchParams('city=%20Pune%20&postalCode=411-001')), {
    category: '', city: 'Pune', locality: '', postalCode: '411-001', countryCode: 'IN',
    latitude: null, longitude: null, radiusKm: null, limit: 60,
  });
  assert.throws(() => normalizeServiceSearch({ latitude: 91, longitude: 0 }), ServiceSearchError);
  assert.throws(() => normalizeServiceSearch({ latitude: 18, radiusKm: 25 }), ServiceSearchError);
  assert.throws(() => normalizeServiceSearch({ latitude: 18, longitude: 73, radiusKm: 101 }), ServiceSearchError);
  assert.throws(() => normalizeServiceSearch({ postalCode: '*%' }), ServiceSearchError);
  assert.throws(() => normalizeServiceSearch({ latitude: false, longitude: 73 }), ServiceSearchError);
  assert.throws(() => normalizeServiceSearch({ limit: true }), ServiceSearchError);
});

test('service discovery filters public locations by city, locality, postcode and country without exposing coordinates', () => {
  const search = normalizeServiceSearch({ city: 'pun', locality: 'Koregaon', postalCode: '4110', countryCode: 'IN' });
  assert.deepEqual(matchServiceLocation(publicLocation, search), { matches: true, distanceKm: null });
  assert.equal(normalizePostalCode('411 001'), normalizePostalCode('411-001'));
  assert.equal(matchServiceLocation({ ...publicLocation, country_code: 'GB' }, search).matches, false);
  assert.equal(matchServiceLocation({ ...publicLocation, is_public: false }, search).matches, false);
});

test('distance search uses a bounded Haversine radius and returns only a rounded distance', () => {
  const search = normalizeServiceSearch({ latitude: 18.5362, longitude: 73.8939, radiusKm: 10 });
  assert.deepEqual(matchServiceLocation(publicLocation, search), { matches: true, distanceKm: 0 });
  assert.equal(matchServiceLocation({ ...publicLocation, latitude: 19.076, longitude: 72.8777 }, search).matches, false);
  assert.ok(haversineDistanceKm(18.5362, 73.8939, 19.076, 72.8777) > 100);
  assert.deepEqual(matchServiceLocation({ ...publicLocation, latitude: null, longitude: null }, search), { matches: false, distanceKm: null });
});
