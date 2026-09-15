import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api } from './api';

const DEVICE_KEY = 'bf-webauthn-device';

interface DispositivoGuardado {
  credentialId: string;
  empresaSlug: string;
  nombre: string;
}

/** Bandera local de "este dispositivo ya tiene huella/Face ID activada" —
 * sin esto, el login no tiene forma de saber si debe ofrecer el atajo. */
export function dispositivoConHuella(): DispositivoGuardado | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function guardarDispositivo(d: DispositivoGuardado) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
  } catch {
    /* noop — si no se puede guardar, el botón de huella simplemente no aparecerá */
  }
}

/** Se llama cuando el servidor ya no reconoce el credentialId guardado
 * (se "olvidó" desde otro lado, o nunca fue válido) — limpia la bandera
 * local para que el botón de huella deje de aparecer en este dispositivo. */
export function olvidarDispositivoLocal() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* noop */
  }
}

export function soportaWebAuthn(): boolean {
  return browserSupportsWebAuthn();
}

/** Etiqueta legible por defecto para el dispositivo (ej. "Chrome en Windows",
 * "Safari en iPhone") — solo para mostrar en la lista de "Ajustes", no
 * afecta el funcionamiento. */
export function adivinarNombreDispositivo(): string {
  const ua = navigator.userAgent;
  let so = 'este dispositivo';
  if (/iPhone/.test(ua)) so = 'iPhone';
  else if (/iPad/.test(ua)) so = 'iPad';
  else if (/Android/.test(ua)) so = 'Android';
  else if (/Macintosh/.test(ua)) so = 'Mac';
  else if (/Windows/.test(ua)) so = 'Windows';
  else if (/Linux/.test(ua)) so = 'Linux';

  let navegador = 'navegador';
  if (/Edg\//.test(ua)) navegador = 'Edge';
  else if (/Chrome\//.test(ua)) navegador = 'Chrome';
  else if (/Firefox\//.test(ua)) navegador = 'Firefox';
  else if (/Safari\//.test(ua)) navegador = 'Safari';

  return `${navegador} en ${so}`;
}

/** Activa huella/Face ID en este dispositivo para el usuario ya logueado. */
export async function activarHuella(
  empresaSlug: string,
  nombre: string,
  deviceLabel?: string,
): Promise<void> {
  const { data: options } = await api.post('/auth/webauthn/register/options');
  const response = await startRegistration({ optionsJSON: options });
  await api.post('/auth/webauthn/register/verify', { response, deviceLabel });
  guardarDispositivo({ credentialId: response.id, empresaSlug, nombre });
}

/** Entra con huella/Face ID usando el credentialId ya guardado en este
 * dispositivo. Devuelve la MISMA forma que un login normal (tokens + user)
 * — quien llama la pasa tal cual a setSession, igual que el login por
 * contraseña. */
export async function loginConHuella(): Promise<{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string; nombre: string; email: string; rol: string;
    modulos?: string[]; empresaId: string; empresaSlug: string;
  };
}> {
  const guardado = dispositivoConHuella();
  if (!guardado) throw new Error('Este dispositivo no tiene huella/Face ID activada.');

  let options;
  try {
    ({ data: options } = await api.post('/auth/webauthn/login/options', {
      credentialId: guardado.credentialId,
    }));
  } catch (err) {
    // El servidor ya no reconoce esta credencial (se revocó desde otro
    // lugar) — limpiar la bandera local para no seguir ofreciendo un
    // atajo que nunca va a funcionar.
    olvidarDispositivoLocal();
    throw err;
  }

  const response = await startAuthentication({ optionsJSON: options });

  const { data } = await api.post('/auth/webauthn/login/verify', {
    credentialId: guardado.credentialId,
    response,
  });
  return data;
}
