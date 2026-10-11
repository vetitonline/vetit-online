const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POSTAL = /^[a-z0-9][a-z0-9 -]{0,19}$/i;

export class ServiceSearchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceSearchError';
  }
}

function optionalText(value, label, max = 100) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw new ServiceSearchError(`${label} is invalid.`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new ServiceSearchError(`${label} is invalid.`);
  return text;
}

function getValue(input, key) {
  return input instanceof URLSearchParams ? input.get(key) : input?.[key];
}

function numberValue(value, label) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new ServiceSearchError(`${label} is invalid.`);
  if (typeof value === 'string' && !/^-?\d+(?:\.\d+)?$/.test(value.trim())) throw new ServiceSearchError(`${label} is invalid.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ServiceSearchError(`${label} is invalid.`);
  return number;
}

/** Shared, bounded search contract for the Astro routes and native API clients. */
export function normalizeServiceSearch(input = {}) {
  const category = optionalText(getValue(input, 'category'), 'Service category', 120);
  const city = optionalText(getValue(input, 'city'), 'City');
  const locality = optionalText(getValue(input, 'locality'), 'Area or locality');
  const postalCode = optionalText(getValue(input, 'postalCode') ?? getValue(input, 'postal_code'), 'Postal code', 20);
  const countryCode = optionalText(getValue(input, 'countryCode') ?? getValue(input, 'country_code') ?? 'IN', 'Country code', 2).toUpperCase();
  const latitudeValue = getValue(input, 'latitude');
  const longitudeValue = getValue(input, 'longitude');
  const latitude = latitudeValue == null || latitudeValue === '' ? null : numberValue(latitudeValue, 'Latitude');
  const longitude = longitudeValue == null || longitudeValue === '' ? null : numberValue(longitudeValue, 'Longitude');
  const radiusValue = getValue(input, 'radiusKm');
  const radiusKm = radiusValue == null || radiusValue === '' ? null : numberValue(radiusValue, 'Search radius');
  const limitValue = getValue(input, 'limit');
  const limit = limitValue == null || limitValue === '' ? 60 : numberValue(limitValue, 'Result limit');

  if (category && !SLUG.test(category)) throw new ServiceSearchError('Service category is invalid.');
  if (countryCode.length !== 2 || !/^[A-Z]{2}$/.test(countryCode)) throw new ServiceSearchError('Country code is invalid.');
  if (postalCode && !POSTAL.test(postalCode)) throw new ServiceSearchError('Postal code is invalid.');
  if ((latitude === null) !== (longitude === null)
    || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
    || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    throw new ServiceSearchError('Location coordinates are invalid.');
  }
  if (radiusKm !== null && (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100 || latitude === null)) {
    throw new ServiceSearchError('Distance search needs a current location and a radius from 1 to 100 km.');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ServiceSearchError('Result limit is invalid.');

  return { category, city, locality, postalCode, countryCode, latitude, longitude, radiusKm, limit };
}

export function haversineDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const toRadians = value => value * Math.PI / 180;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizePostalCode(value) {
  return String(value ?? '').toLocaleLowerCase().replace(/[\s-]/g, '');
}

export function matchServiceLocation(location, search) {
  const hasLocationFilter = Boolean(search.city || search.locality || search.postalCode || search.latitude !== null);
  if (!hasLocationFilter) return { matches: true, distanceKm: null };
  if (!location || !location.is_public || !location.is_active || location.country_code !== search.countryCode) return { matches: false, distanceKm: null };
  if (search.city && !String(location.city ?? '').toLocaleLowerCase().includes(search.city.toLocaleLowerCase())) return { matches: false, distanceKm: null };
  if (search.locality && !String(location.locality ?? '').toLocaleLowerCase().includes(search.locality.toLocaleLowerCase())) return { matches: false, distanceKm: null };
  if (search.postalCode && !normalizePostalCode(location.postal_code).startsWith(normalizePostalCode(search.postalCode))) return { matches: false, distanceKm: null };

  if (search.latitude === null) return { matches: true, distanceKm: null };
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return { matches: false, distanceKm: null };
  const distance = haversineDistanceKm(search.latitude, search.longitude, location.latitude, location.longitude);
  const radius = search.radiusKm ?? 25;
  return { matches: distance <= radius, distanceKm: distance <= radius ? Math.round(distance * 10) / 10 : null };
}
