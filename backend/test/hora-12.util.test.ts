/**
 * Todas las entradas son cadenas con "Z" o "HH:mm" -- a propósito, para
 * que estas pruebas den el mismo resultado sin importar la TZ de la
 * máquina que las corre (correr con TZ=UTC y con TZ=America/Santo_Domingo).
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  horaDe24a12,
  hora12DeNaive,
  hora12DeInstante,
  fechaHora12DeInstante,
} from '../src/core/common/fecha-rd.util';

// ---------- horaDe24a12 (string "HH:mm") ----------

test('horaDe24a12: casos de borde 00:00, 00:05, 11:59, 12:00, 12:30, 13:00, 23:59', () => {
  assert.equal(horaDe24a12('00:00'), '12:00 AM');
  assert.equal(horaDe24a12('00:05'), '12:05 AM');
  assert.equal(horaDe24a12('11:59'), '11:59 AM');
  assert.equal(horaDe24a12('12:00'), '12:00 PM');
  assert.equal(horaDe24a12('12:30'), '12:30 PM');
  assert.equal(horaDe24a12('13:00'), '1:00 PM');
  assert.equal(horaDe24a12('23:59'), '11:59 PM');
});

test('horaDe24a12: sin cero a la izquierda en la hora, con cero en los minutos', () => {
  assert.equal(horaDe24a12('09:05'), '9:05 AM');
  assert.equal(horaDe24a12('21:05'), '9:05 PM');
});

test('horaDe24a12: entrada inválida devuelve la cadena original, sin lanzar', () => {
  for (const invalida of ['', 'abc', '25:00', '12:60', '12', '12:5', 'no es hora']) {
    assert.equal(horaDe24a12(invalida), invalida);
  }
});

// ---------- hora12DeNaive (Date naive, Cita.inicio/fin) ----------

test('hora12DeNaive: lee los dígitos "tal cual" (getUTC*), no resta offset', () => {
  assert.equal(hora12DeNaive(new Date('2026-11-21T00:00:00.000Z')), '12:00 AM');
  assert.equal(hora12DeNaive(new Date('2026-11-21T14:30:00.000Z')), '2:30 PM');
  assert.equal(hora12DeNaive(new Date('2026-11-21T23:59:00.000Z')), '11:59 PM');
});

test('hora12DeNaive: Date inválida no lanza', () => {
  assert.doesNotThrow(() => hora12DeNaive(new Date('fecha-invalida')));
});

// ---------- hora12DeInstante (Date instante real, createdAt) ----------

test('hora12DeInstante: venta a las 20:25 RD (=00:25Z del día siguiente) da "8:25 PM"', () => {
  assert.equal(hora12DeInstante(new Date('2026-11-22T00:25:00.000Z')), '8:25 PM');
});

test('hora12DeInstante: 4h de offset en los bordes del día', () => {
  assert.equal(hora12DeInstante(new Date('2026-11-21T04:00:00.000Z')), '12:00 AM'); // 00:00 RD
  assert.equal(hora12DeInstante(new Date('2026-11-22T03:59:00.000Z')), '11:59 PM'); // 23:59 RD
  assert.equal(hora12DeInstante(new Date('2026-11-21T16:00:00.000Z')), '12:00 PM'); // 12:00 RD (mediodía)
});

test('hora12DeInstante: casos de borde 00:00, 11:59, 12:00, 13:00 RD, expresados como instante real (+4h)', () => {
  assert.equal(hora12DeInstante(new Date('2026-11-21T04:00:00.000Z')), '12:00 AM'); // 00:00 RD
  assert.equal(hora12DeInstante(new Date('2026-11-21T15:59:00.000Z')), '11:59 AM'); // 11:59 RD
  assert.equal(hora12DeInstante(new Date('2026-11-21T16:00:00.000Z')), '12:00 PM'); // 12:00 RD
  assert.equal(hora12DeInstante(new Date('2026-11-21T17:00:00.000Z')), '1:00 PM'); // 13:00 RD
});

test('hora12DeInstante: Date inválida no lanza', () => {
  assert.doesNotThrow(() => hora12DeInstante(new Date('fecha-invalida')));
});

// ---------- fechaHora12DeInstante ----------

test('fechaHora12DeInstante: venta a las 20:25 RD da "21/11/2026 8:25 PM" (fecha del día correcto)', () => {
  assert.equal(fechaHora12DeInstante(new Date('2026-11-22T00:25:00.000Z')), '21/11/2026 8:25 PM');
});

test('fechaHora12DeInstante: medianoche RD da la fecha del día que empieza', () => {
  assert.equal(fechaHora12DeInstante(new Date('2026-11-21T04:00:00.000Z')), '21/11/2026 12:00 AM');
});

test('fechaHora12DeInstante: Date inválida no lanza', () => {
  assert.doesNotThrow(() => fechaHora12DeInstante(new Date('fecha-invalida')));
});
