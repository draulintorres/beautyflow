import { Injectable } from '@nestjs/common';

interface Entry {
  count: number;
  windowStart: number;
  /** Ventana con la que se creó esta entrada — cada llamador (login de
   * personal, /admin/login, forgot-password, OTP del portal) puede pasar
   * su propia ventana/tope usando la MISMA instancia del servicio, así que
   * la limpieza de una entrada debe usar la ventana con la que se creó,
   * no la que traiga la llamada que dispara la limpieza. */
  windowMs: number;
}

export interface RateLimitCheck {
  allowed: boolean;
  /** Intentos restantes antes de bloquear (nunca negativo). */
  remaining: number;
  /** Solo > 0 cuando allowed=false. */
  retryAfterSeconds: number;
}

/**
 * Límite de intentos en memoria, de un solo proceso (no hay Redis en esta
 * etapa de la infraestructura). Pensado para ser una ÚNICA instancia
 * compartida (ver CommonModule, @Global()) entre todos los flujos que
 * necesitan limitar intentos — cada flujo namespacea sus llaves con un
 * prefijo propio (ej. "login:", "admin-login:", "forgot:", "otp:") para no
 * pisarse entre sí dentro del mismo Map.
 *
 * Ventana fija por llave (no deslizante): el contador arranca en el primer
 * fallo y expira windowMs después, momento en el que el siguiente fallo
 * abre una ventana nueva desde cero. Es más simple que una ventana
 * deslizante y suficiente para frenar fuerza bruta — no necesita ser exacta
 * al segundo.
 */
@Injectable()
export class RateLimiterService {
  private readonly buckets = new Map<string, Entry>();

  /** Reloj inyectable solo para pruebas (node:test con reloj simulado). En
   * producción nunca se llama — Date.now por defecto. */
  private clock: () => number = () => Date.now();

  setClockForTesting(fn: () => number): void {
    this.clock = fn;
  }

  private static readonly MAX_ENTRIES = 10_000;
  // Cubre llaves compuestas tipo "ip|empresaSlug|email" sin cortar emails
  // válidos (RFC 5321 tope 254) ni slugs razonables.
  private static readonly MAX_KEY_LENGTH = 300;

  /** Misma normalización que resolverEmpresaPorSlug() en auth.service.ts
   * (trim, minúsculas, espacios→guión) — así una llave compuesta con un
   * nombre de empresa escrito distinto ("Chenar Barber Shop" vs
   * "chenar-barber-shop") cae en el mismo contador en vez de dejar un
   * atajo para resetear intentos cambiando mayúsculas/espacios. */
  private normalizeKey(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, RateLimiterService.MAX_KEY_LENGTH);
  }

  /**
   * Solo consulta si una llave está bloqueada — no cuenta un intento nuevo.
   * Debe llamarse ANTES de tocar la base de datos o bcrypt: si ya está
   * bloqueada, la ruta debe responder 429 sin hacer ese trabajo.
   */
  estaBloqueado(rawKey: string, maxAttempts: number, windowMs: number): RateLimitCheck {
    const key = this.normalizeKey(rawKey);
    const now = this.clock();
    const entry = this.buckets.get(key);

    if (!entry || now - entry.windowStart >= entry.windowMs) {
      return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 };
    }

    const bloqueado = entry.count >= maxAttempts;
    const retryAfterMs = entry.windowMs - (now - entry.windowStart);
    return {
      allowed: !bloqueado,
      remaining: Math.max(0, maxAttempts - entry.count),
      retryAfterSeconds: bloqueado ? Math.max(0, Math.ceil(retryAfterMs / 1000)) : 0,
    };
  }

  /** Registra un fallo bajo `rawKey`. Llamar solo DESPUÉS de confirmar que
   * el intento falló (login inválido, OTP incorrecto, etc.). */
  registrarFallo(rawKey: string, windowMs: number): void {
    const key = this.normalizeKey(rawKey);
    const now = this.clock();
    this.limpiarVencidas(now);

    let entry = this.buckets.get(key);
    if (!entry || now - entry.windowStart >= entry.windowMs) {
      entry = { count: 0, windowStart: now, windowMs };
    }
    entry.count += 1;
    this.buckets.set(key, entry);

    this.aplicarTope();
  }

  /** Reinicia el contador de una llave — llamar en un intento exitoso. */
  reset(rawKey: string): void {
    this.buckets.delete(this.normalizeKey(rawKey));
  }

  /** Solo para pruebas: tamaño actual del mapa interno. */
  size(): number {
    return this.buckets.size;
  }

  private limpiarVencidas(now: number): void {
    for (const [key, entry] of this.buckets) {
      if (now - entry.windowStart >= entry.windowMs) {
        this.buckets.delete(key);
      }
    }
  }

  /** Si se llena (ej. una ráfaga de IPs distintas), descarta las entradas
   * más viejas por windowStart hasta volver al tope — nunca crece sin
   * límite en memoria. */
  private aplicarTope(): void {
    const exceso = this.buckets.size - RateLimiterService.MAX_ENTRIES;
    if (exceso <= 0) return;

    const porAntiguedad = [...this.buckets.entries()].sort(
      (a, b) => a[1].windowStart - b[1].windowStart,
    );
    for (let i = 0; i < exceso; i++) {
      this.buckets.delete(porAntiguedad[i][0]);
    }
  }
}
