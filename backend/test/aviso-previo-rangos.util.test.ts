/**
 * Todas las entradas son cadenas/instantes con "Z" -- a propósito, para
 * que estas pruebas den el mismo resultado sin importar la TZ de la
 * máquina que las corre (TZ=UTC y TZ=America/Santo_Domingo).
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  ventanaAvisoPrevio,
  umbralCitaPasada,
  minutosHastaLaCita,
} from '../src/modules/notificaciones-internas/aviso-previo-rangos.util';

const INTERVALO_CRON_MIN = 5;

test('cita 14:30 con aviso de 30 min: la ventana cae en [14:30Z,14:35Z) cuando "ahora real" es 18:00Z (14:00 RD)', () => {
  const citaInicio = new Date('2026-11-23T14:30:00.000Z'); // naive: 14:30 RD
  const ahoraReal = new Date('2026-11-23T18:00:00.000Z'); // 14:00 RD real

  const { gte, lt } = ventanaAvisoPrevio(ahoraReal, 30, INTERVALO_CRON_MIN, true);
  assert.equal(gte.toISOString(), '2026-11-23T14:30:00.000Z');
  assert.equal(lt!.toISOString(), '2026-11-23T14:35:00.000Z');
  assert.equal(citaInicio.getTime() >= gte.getTime(), true);
  assert.equal(citaInicio.getTime() < lt!.getTime(), true);
});

test('el mismo caso NO dispara si "ahora real" es 14:00Z (el bug viejo -- 4h antes de lo configurado)', () => {
  const citaInicio = new Date('2026-11-23T14:30:00.000Z');
  const ahoraRealBugViejo = new Date('2026-11-23T14:00:00.000Z');

  const { gte, lt } = ventanaAvisoPrevio(ahoraRealBugViejo, 30, INTERVALO_CRON_MIN, true);
  const dentroDeLaVentana = citaInicio.getTime() >= gte.getTime() && citaInicio.getTime() < lt!.getTime();
  assert.equal(dentroDeLaVentana, false);
});

test('minutosHastaLaCita: con "ahora real"=18:00Z y cita=14:30Z (naive), da 30 minutos', () => {
  const citaInicio = new Date('2026-11-23T14:30:00.000Z');
  const ahoraReal = new Date('2026-11-23T18:00:00.000Z');
  assert.equal(minutosHastaLaCita(citaInicio, ahoraReal), 30);
});

test('minutosHastaLaCita: nunca negativo (cita ya empezada)', () => {
  const citaInicio = new Date('2026-11-23T14:00:00.000Z');
  const ahoraReal = new Date('2026-11-23T18:30:00.000Z'); // 14:30 RD real -- cita ya pasó
  assert.equal(minutosHastaLaCita(citaInicio, ahoraReal), 0);
});

test('ventanaAvisoPrevio sin respetarVentana (modo dev): sin cota superior, gte = ahora naive', () => {
  const ahoraReal = new Date('2026-11-23T18:00:00.000Z');
  const { gte, lt } = ventanaAvisoPrevio(ahoraReal, 30, INTERVALO_CRON_MIN, false);
  assert.equal(gte.toISOString(), '2026-11-23T14:00:00.000Z');
  assert.equal(lt, undefined);
});

test('umbralCitaPasada: borde exacto -- una cita en ese instante naive NO es "ya pasada" (lt estricto)', () => {
  const ahoraReal = new Date('2026-11-23T18:00:00.000Z'); // 14:00 RD real
  const umbral = umbralCitaPasada(ahoraReal);
  assert.equal(umbral.toISOString(), '2026-11-23T14:00:00.000Z');

  const citaJustoAhora = new Date('2026-11-23T14:00:00.000Z');
  assert.equal(citaJustoAhora.getTime() < umbral.getTime(), false);

  const citaUnMinutoAntes = new Date('2026-11-23T13:59:00.000Z');
  assert.equal(citaUnMinutoAntes.getTime() < umbral.getTime(), true);
});
