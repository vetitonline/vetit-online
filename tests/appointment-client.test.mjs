import test from 'node:test';
import assert from 'node:assert/strict';
import { AppointmentClientError, formatAppointmentAvailability, requestAppointmentSlots } from '../src/lib/services/appointment-client.js';
import { APPOINTMENT_SLOT_DEFAULT_WINDOW_DAYS, parseAppointmentSlotQuery } from '../src/lib/services/appointment-slots.js';

const serviceListingId = '11111111-1111-4111-8111-111111111111';
const slot = {
  id: '22222222-2222-4222-8222-222222222222',
  service_listing_id: serviceListingId,
  starts_at: '2026-10-20T10:00:00Z',
  ends_at: '2026-10-20T10:30:00Z',
};

test('shared slot client reads the bounded public availability endpoint and normalizes results', async () => {
  let captured;
  const result = await requestAppointmentSlots({
    baseUrl: 'https://vetit.example/', serviceListingId,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ apiVersion: 1, state: 'available', serviceListingId, slots: [slot], truncated: false }));
    },
  });
  assert.equal(captured.init.method, 'GET');
  assert.equal(captured.url, `https://vetit.example/api/services/slots?serviceListingId=${serviceListingId}`);
  assert.equal(result.slots[0].startsAt, slot.starts_at);
  assert.equal(result.slots[0].endsAt, slot.ends_at);
});

test('slot client validates empty responses, listing identity, time order, and malformed IDs', async () => {
  const empty = await requestAppointmentSlots({
    serviceListingId,
    fetchImpl: async () => new Response(JSON.stringify({ apiVersion: 1, state: 'empty', serviceListingId, slots: [], truncated: false })),
  });
  assert.equal(empty.state, 'empty');
  await assert.rejects(() => requestAppointmentSlots({ serviceListingId: 'bad' }), AppointmentClientError);
  await assert.rejects(() => requestAppointmentSlots({
    serviceListingId,
    fetchImpl: async () => new Response(JSON.stringify({ apiVersion: 1, state: 'available', serviceListingId, slots: [{ ...slot, ends_at: slot.starts_at }], truncated: false })),
  }), /unsupported response/i);
});

test('slot client reports server and network failures without exposing response details', async () => {
  await assert.rejects(() => requestAppointmentSlots({
    serviceListingId,
    fetchImpl: async () => new Response(JSON.stringify({ apiVersion: 1, state: 'unavailable', serviceListingId, slots: [], truncated: false }), { status: 503 }),
  }), /temporarily unavailable/i);
  await assert.rejects(() => requestAppointmentSlots({
    serviceListingId, fetchImpl: async () => { throw new Error('private host detail'); },
  }), (error) => error instanceof AppointmentClientError && !error.message.includes('private host detail'));
});

test('actual sparse API 503 response is temporarily unavailable with its HTTP status preserved', async () => {
  await assert.rejects(() => requestAppointmentSlots({
    serviceListingId,
    // This is the endpoint's error envelope, not its listing/slots success envelope.
    fetchImpl: async () => new Response(JSON.stringify({ apiVersion: 1, state: 'unavailable' }), { status: 503 }),
  }), (error) => error instanceof AppointmentClientError
    && error.status === 503
    && error.message === 'Appointment availability is temporarily unavailable.');
});

test('HTTP failures remain unavailable even when a proxy returns non-JSON details', async () => {
  await assert.rejects(() => requestAppointmentSlots({
    serviceListingId,
    fetchImpl: async () => new Response('private upstream failure', { status: 503 }),
  }), (error) => error instanceof AppointmentClientError
    && error.status === 503
    && error.message === 'Appointment availability is temporarily unavailable.');
});

test('empty availability message is bounded to the same 14-day window as the API query', async () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  let query;
  const availability = await requestAppointmentSlots({
    serviceListingId,
    fetchImpl: async (url) => {
      query = parseAppointmentSlotQuery(new URL(url).searchParams, now);
      return new Response(JSON.stringify({ apiVersion: 1, state: 'empty', serviceListingId, slots: [], truncated: false }));
    },
  });
  assert.equal(APPOINTMENT_SLOT_DEFAULT_WINDOW_DAYS, 14);
  assert.equal(Date.parse(query.to) - Date.parse(query.from), 14 * 86400000);
  assert.equal(formatAppointmentAvailability(availability), 'No appointment times found in the next 14 days.');
});

test('available and capped results describe the search window without promising extra slots', async () => {
  for (const truncated of [false, true]) {
    const availability = await requestAppointmentSlots({
      serviceListingId,
      fetchImpl: async () => new Response(JSON.stringify({ apiVersion: 1, state: 'available', serviceListingId, slots: [slot], truncated })),
    });
    assert.equal(formatAppointmentAvailability(availability, (value) => {
      assert.equal(value, slot.starts_at);
      return '20 Oct, 10:00';
    }), `Next available (next 14 days): 20 Oct, 10:00${truncated ? ' · Results are limited.' : ''}`);
  }
});

test('successful HTTP responses still reject malformed JSON and another listing identity', async () => {
  await assert.rejects(() => requestAppointmentSlots({
    serviceListingId, fetchImpl: async () => new Response('not JSON'),
  }), /invalid response/i);
  await assert.rejects(() => requestAppointmentSlots({
    serviceListingId,
    fetchImpl: async () => new Response(JSON.stringify({ apiVersion: 1, state: 'available', serviceListingId: slot.id, slots: [slot], truncated: false })),
  }), /unsupported response/i);
});

test('malformed slot entries reject with a safe client error instead of a TypeError', async () => {
  for (const entry of [null, false, 0, 'private upstream detail', [], {}]) {
    await assert.rejects(() => requestAppointmentSlots({
      serviceListingId,
      fetchImpl: async () => new Response(JSON.stringify({
        apiVersion: 1, state: 'available', serviceListingId, slots: [slot, entry], truncated: false,
      })),
    }), (error) => error instanceof AppointmentClientError
      && error.status === 200
      && error.message === 'Appointment availability returned an unsupported response.');
  }
});
