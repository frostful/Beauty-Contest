import assert from 'node:assert/strict';
import test from 'node:test';
import { readApiResponse } from '../lib/api-response.ts';

test('empty and HTML server failures show a useful message', async () => {
  for (const body of ['', '<html>Internal error</html>']) {
    await assert.rejects(readApiResponse(new Response(body,{status:500})), /game service is temporarily unavailable/);
  }
});
test('invalid successful responses never surface a JSON parser exception', async () => {
  for (const body of ['', 'null', '[]', 'true']) {
    await assert.rejects(readApiResponse(new Response(body)), /incomplete response/);
  }
});
test('actionable API errors and valid state are preserved', async () => {
  await assert.rejects(readApiResponse(Response.json({error:'That room is full.'},{status:409})), /That room is full/);
  assert.deepEqual(await readApiResponse(Response.json({code:'ABCD'})),{code:'ABCD'});
});
