import test from 'node:test';
import * as assert from 'node:assert/strict';
import { validateProcessTimezone } from '../src/core/common/process-timezone.util';

test('producción con offset 0 (UTC real): no lanza', () => {
  assert.doesNotThrow(() => validateProcessTimezone({ NODE_ENV: 'production' }, 0));
});

test('producción con offset -240 (no UTC): lanza', () => {
  assert.throws(() => validateProcessTimezone({ NODE_ENV: 'production' }, -240), /UTC/);
});

test('desarrollo con offset -240 (no UTC): NO lanza, solo advierte', () => {
  assert.doesNotThrow(() => validateProcessTimezone({ NODE_ENV: 'development' }, -240));
});

test('desarrollo con offset 0: no lanza', () => {
  assert.doesNotThrow(() => validateProcessTimezone({ NODE_ENV: 'development' }, 0));
});

test('sin NODE_ENV definido (no es "production"): se comporta como fuera de producción', () => {
  assert.doesNotThrow(() => validateProcessTimezone({}, -240));
});
