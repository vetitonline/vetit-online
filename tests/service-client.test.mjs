import test from 'node:test';
import assert from 'node:assert/strict';
import { requestServices, ServiceClientError } from '../src/lib/services/service-client.js';

const responseBody = { apiVersion: 1, state: 'available', services: [], categories: [], truncated: false };

test('shared service client uses GET for city and postcode discovery and encodes an API base URL', async () => {
  let captured;
  const result = await requestServices({
    baseUrl: 'https://vetit.example', filters: { city: 'Pune', postalCode: '411 001' },
    fetchImpl: async (url, init) => { captured = { url, init }; return new Response(JSON.stringify(responseBody)); },
  });
  assert.equal(result.state, 'available');
  assert.equal(captured.init.method, 'GET');
  assert.match(captured.url, /^https:\/\/vetit\.example\/api\/services\?/);
  assert.match(captured.url, /postalCode=411\+001/);
});

test('shared service client sends permission-based coordinates in a POST body, not the URL', async () => {
  let captured;
  await requestServices({
    baseUrl: 'https://vetit.example', filters: { city: 'Pune' }, location: { latitude: 18.5, longitude: 73.9, radiusKm: 10 },
    fetchImpl: async (url, init) => { captured = { url, init }; return new Response(JSON.stringify(responseBody)); },
  });
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.url, 'https://vetit.example/api/services');
  assert.equal(JSON.parse(captured.init.body).latitude, 18.5);
  assert.equal(captured.init.headers['content-type'], 'application/json');
});

test('shared service client rejects invalid API origins, malformed responses and network errors safely', async () => {
  await assert.rejects(() => requestServices({ baseUrl: 'https://user:password@vetit.example' }), ServiceClientError);
  await assert.rejects(() => requestServices({ fetchImpl: async () => new Response('{bad') }), ServiceClientError);
  await assert.rejects(() => requestServices({ fetchImpl: async () => { throw new Error('network'); } }), ServiceClientError);
});

test('web and mobile discovery reject null service/category entries through the shared error contract',async()=>{
  for(const body of [ {...responseBody,services:[null]}, {...responseBody,categories:[null]}, {...responseBody,categories:[{}]} ]) {
    await assert.rejects(()=>requestServices({fetchImpl:async()=>new Response(JSON.stringify(body))}),error=>error instanceof ServiceClientError && /unsupported response/.test(error.message));
  }
  const categories=[{slug:'grooming',name:'Grooming',parentSlug:null,requiresProfessionalVerification:false,requiresLegalReview:false}];
  const result=await requestServices({fetchImpl:async()=>new Response(JSON.stringify({...responseBody,categories}))});assert.deepEqual(result.categories,categories);
});
