/**
 * Todas las aserciones comparan contra cadenas con "Z" o valores derivados
 * de Date.UTC -- a propósito, para que estas pruebas den el mismo
 * resultado sin importar la TZ de la máquina que las corre (ver
 * instrucciones de ETAPA zona-horaria: correr dos veces, con TZ=UTC y con
 * TZ=America/Santo_Domingo).
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  rangoDiaRDReal,
  rangoMesRDReal,
  rangoAnioRDReal,
  fechaRDDeInstante,
  mesRDDeInstante,
  ahoraNaiveRD,
  rangoDiaRDNaive,
  rangoDiaRD,
  rangoFechasRDReal,
} from '../src/core/common/fecha-rd.util';

// ---------- rangoDiaRDReal: caso del bug original ----------

test('venta a las 20:25 RD (=00:25Z del día siguiente) queda dentro de su día RD', () => {
  const { gte, lt } = rangoDiaRDReal('2026-11-21');
  const createdAt = new Date('2026-11-22T00:25:00.000Z'); // instante real
  assert.equal(createdAt.getTime() >= gte.getTime(), true);
  assert.equal(createdAt.getTime() < lt.getTime(), true);
});

test('ventas a las 19:59 y 20:00 RD: ambas dentro del mismo día (sin corte falso a las 8pm)', () => {
  const { gte, lt } = rangoDiaRDReal('2026-11-21');
  const a1959 = new Date('2026-11-21T23:59:00.000Z'); // 19:59 RD real
  const a2000 = new Date('2026-11-22T00:00:00.000Z'); // 20:00 RD real
  for (const d of [a1959, a2000]) {
    assert.equal(d.getTime() >= gte.getTime(), true);
    assert.equal(d.getTime() < lt.getTime(), true);
  }
});

test('00:00 RD cae en el día que empieza; 23:59:59.999 RD cae en el mismo día (último instante)', () => {
  const { gte, lt } = rangoDiaRDReal('2026-11-21');
  const medianocheRD = new Date('2026-11-21T04:00:00.000Z'); // 00:00 RD real
  const finDiaRD = new Date('2026-11-22T03:59:59.999Z'); // 23:59:59.999 RD real
  assert.equal(medianocheRD.getTime(), gte.getTime());
  assert.equal(finDiaRD.getTime() >= gte.getTime(), true);
  assert.equal(finDiaRD.getTime() < lt.getTime(), true);
});

test('límite exacto del día: 04:00:00.000Z entra al día NUEVO, 03:59:59.999Z al día ANTERIOR', () => {
  const dia21 = rangoDiaRDReal('2026-11-21');
  const dia22 = rangoDiaRDReal('2026-11-22');

  const bordeExacto = new Date('2026-11-22T04:00:00.000Z');
  assert.equal(bordeExacto.getTime(), dia22.gte.getTime());
  assert.equal(bordeExacto.getTime() < dia21.lt.getTime(), false); // no es < lt del día 21 (es ==)
  assert.equal(bordeExacto.getTime() >= dia21.lt.getTime(), true); // cae fuera del día 21

  const unMsAntes = new Date('2026-11-22T03:59:59.999Z');
  assert.equal(unMsAntes.getTime() < dia21.lt.getTime(), true); // dentro del día 21
  assert.equal(unMsAntes.getTime() < dia22.gte.getTime(), true); // fuera del día 22
});

test('29/02 de año bisiesto: el día siguiente es 1 de marzo (Date.UTC normaliza el overflow)', () => {
  const { lt } = rangoDiaRDReal('2028-02-29'); // 2028 es bisiesto
  assert.equal(lt.toISOString(), '2028-03-01T04:00:00.000Z');
});

// ---------- rangoMesRDReal ----------

test('fin de mes: una venta del 30/11 a las 21:00 RD (01:00Z del 1/12) cae en noviembre, no en diciembre', () => {
  const noviembre = rangoMesRDReal('2026-11');
  const createdAt = new Date('2026-12-01T01:00:00.000Z'); // 30/11 21:00 RD real
  assert.equal(createdAt.getTime() >= noviembre.gte.getTime(), true);
  assert.equal(createdAt.getTime() < noviembre.lt.getTime(), true);

  const diciembre = rangoMesRDReal('2026-12');
  assert.equal(createdAt.getTime() < diciembre.gte.getTime(), true); // todavía no es diciembre
});

test('rangoMesRDReal: diciembre pasa a enero del año siguiente', () => {
  const diciembre = rangoMesRDReal('2026-12');
  assert.equal(diciembre.lt.toISOString(), '2027-01-01T04:00:00.000Z');
});

// ---------- rangoAnioRDReal ----------

test('fin de año: una venta del 31/12 a las 21:00 RD (01:00Z del 1/1) cae en el año viejo, no en el nuevo', () => {
  const anioViejo = rangoAnioRDReal(2026);
  const anioNuevo = rangoAnioRDReal(2027);
  const createdAt = new Date('2027-01-01T01:00:00.000Z'); // 31/12/2026 21:00 RD real

  assert.equal(createdAt.getTime() >= anioViejo.gte.getTime(), true);
  assert.equal(createdAt.getTime() < anioViejo.lt.getTime(), true);
  assert.equal(createdAt.getTime() < anioNuevo.gte.getTime(), true);
});

// ---------- fechaRDDeInstante / mesRDDeInstante ----------

test('fechaRDDeInstante: venta de las 20:25 RD da la fecha-calendario correcta (no la del día siguiente)', () => {
  assert.equal(fechaRDDeInstante(new Date('2026-11-22T00:25:00.000Z')), '2026-11-21');
});

test('fechaRDDeInstante en los bordes exactos del día', () => {
  assert.equal(fechaRDDeInstante(new Date('2026-11-21T04:00:00.000Z')), '2026-11-21'); // 00:00 RD
  assert.equal(fechaRDDeInstante(new Date('2026-11-22T03:59:59.999Z')), '2026-11-21'); // 23:59:59.999 RD
  assert.equal(fechaRDDeInstante(new Date('2026-11-22T04:00:00.000Z')), '2026-11-22'); // 00:00 RD del día siguiente
});

test('mesRDDeInstante: venta del 30/11 a las 21:00 RD da "2026-11", no "2026-12"', () => {
  assert.equal(mesRDDeInstante(new Date('2026-12-01T01:00:00.000Z')), '2026-11');
});

test('fechaRDDeInstante / mesRDDeInstante: 29/02 de año bisiesto', () => {
  const d = new Date('2028-02-29T10:00:00.000Z'); // 06:00 RD del 29/02
  assert.equal(fechaRDDeInstante(d), '2028-02-29');
  assert.equal(mesRDDeInstante(d), '2028-02');
});

// ---------- ahoraNaiveRD ----------

test('ahoraNaiveRD: convierte un instante real al equivalente naive (resta 4h)', () => {
  const real = new Date('2026-11-23T18:30:00.000Z'); // 14:30 RD real -- ver aviso-previo-cita
  const naive = ahoraNaiveRD(real);
  assert.equal(naive.toISOString(), '2026-11-23T14:30:00.000Z');
});

test('ahoraNaiveRD: por defecto usa Date.now()', () => {
  const antes = Date.now();
  const naive = ahoraNaiveRD();
  const despues = Date.now();
  assert.equal(naive.getTime() >= antes - 4 * 60 * 60 * 1000, true);
  assert.equal(naive.getTime() <= despues - 4 * 60 * 60 * 1000, true);
});

// ---------- rangoDiaRDNaive / alias deprecado ----------

test('rangoDiaRDNaive: mismo comportamiento que el rangoDiaRD original (naive, con Z)', () => {
  const r = rangoDiaRDNaive('2026-11-21');
  assert.equal(r.inicio.toISOString(), '2026-11-21T00:00:00.000Z');
  assert.equal(r.fin.toISOString(), '2026-11-21T23:59:59.999Z');
});

test('rangoDiaRD (alias deprecado) sigue funcionando igual que rangoDiaRDNaive', () => {
  assert.equal(rangoDiaRD, rangoDiaRDNaive);
  const r = rangoDiaRD('2026-11-21');
  assert.equal(r.inicio.toISOString(), '2026-11-21T00:00:00.000Z');
  assert.equal(r.fin.toISOString(), '2026-11-21T23:59:59.999Z');
});

// ---------- rangoFechasRDReal ----------

test('rangoFechasRDReal: desde y hasta dan [gte, lt), "hasta" entra completo', () => {
  const { gte, lt } = rangoFechasRDReal('2026-11-01', '2026-11-30');
  assert.equal(gte!.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(lt!.toISOString(), '2026-12-01T04:00:00.000Z'); // 1 ms después del último instante del 30

  // Una venta del 30/11 a las 23:59 RD (03:59Z del 1/12) todavía entra.
  const finDelHasta = new Date('2026-12-01T03:59:00.000Z');
  assert.equal(finDelHasta.getTime() < lt!.getTime(), true);
});

test('rangoFechasRDReal: solo "desde" -- filtro abierto hacia adelante (sin lt)', () => {
  const r = rangoFechasRDReal('2026-11-01', undefined);
  assert.equal(r.gte!.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal('lt' in r, false);
});

test('rangoFechasRDReal: solo "hasta" -- filtro abierto hacia atrás (sin gte)', () => {
  const r = rangoFechasRDReal(undefined, '2026-11-30');
  assert.equal(r.lt!.toISOString(), '2026-12-01T04:00:00.000Z');
  assert.equal('gte' in r, false);
});

test('rangoFechasRDReal: ninguno de los dos -- sin filtro ({})', () => {
  assert.deepEqual(rangoFechasRDReal(undefined, undefined), {});
});

test('rangoFechasRDReal: entrada inválida da el mismo fallo que antes (Invalid Date -> RangeError al serializar), no lanza acá', () => {
  const r = rangoFechasRDReal('no-es-una-fecha', undefined);
  assert.equal(isNaN(r.gte!.getTime()), true);
  assert.throws(() => r.gte!.toISOString(), RangeError);
});
