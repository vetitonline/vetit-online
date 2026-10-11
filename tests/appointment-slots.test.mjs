import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPOINTMENT_SLOT_WINDOW_MAX_DAYS,
  AppointmentSlotQueryError,
  parseAppointmentSlotQuery,
} from '../src/lib/services/appointment-slots.js';

const serviceId = '11111111-1111-4111-8111-111111111111';
const now = Date.parse('2026-10-10T12:00:00Z');

test('appointment slot query defaults to a bounded future India service window', () => {
  const query = parseAppointmentSlotQuery(new URLSearchParams({ serviceListingId: serviceId }), now);
  assert.equal(query.serviceListingId, serviceId);
  assert.equal(query.from, '2026-10-10T12:00:00.000Z');
  assert.equal(query.to, '2026-10-24T12:00:00.000Z');
});

test('appointment slot query normalizes timezone offsets and rejects invalid or excessive windows', () => {
  const query = parseAppointmentSlotQuery(new URLSearchParams({
    serviceListingId: serviceId,
    from: '2026-10-10T13:00:00+01:00',
    to: '2026-10-11T13:00:00+01:00',
  }), now);
  assert.equal(query.from, '2026-10-10T12:00:00.000Z');
  assert.throws(() => parseAppointmentSlotQuery(new URLSearchParams({ serviceListingId: 'bad' }), now), AppointmentSlotQueryError);
  assert.throws(() => parseAppointmentSlotQuery(new URLSearchParams({ serviceListingId: serviceId, from: 'yesterday' }), now), AppointmentSlotQueryError);
  const tooWide = new URLSearchParams({
    serviceListingId: serviceId,
    from: new Date(now).toISOString(),
    to: new Date(now + (APPOINTMENT_SLOT_WINDOW_MAX_DAYS + 1) * 86400000).toISOString(),
  });
  assert.throws(() => parseAppointmentSlotQuery(tooWide, now), AppointmentSlotQueryError);
  assert.throws(() => parseAppointmentSlotQuery(new URLSearchParams({
    serviceListingId: serviceId, from: new Date(now - 120000).toISOString(),
  }), now), AppointmentSlotQueryError);
});
