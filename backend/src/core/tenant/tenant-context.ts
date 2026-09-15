import { AsyncLocalStorage } from 'async_hooks';

/**
 * Contexto de tenant propagado por request vía AsyncLocalStorage.
 * Permite que PrismaService inyecte empresaId automáticamente sin
 * pasarlo manualmente en cada llamada.
 */
export interface TenantStore {
  empresaId: string;
  usuarioId: string;
  rol: string;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

/** Devuelve el empresaId del contexto actual o lanza si no existe. */
export function getEmpresaId(): string {
  const store = tenantContext.getStore();
  if (!store?.empresaId) {
    throw new Error('Tenant context no disponible (empresaId)');
  }
  return store.empresaId;
}

/** Devuelve el usuario actual del contexto o lanza si no existe. */
export function getCurrentUser(): TenantStore {
  const store = tenantContext.getStore();
  if (!store) {
    throw new Error('User context no disponible');
  }
  return store;
}

/** Devuelve el contexto si existe, o null (para rutas públicas). */
export function getTenantStoreOrNull(): TenantStore | null {
  return tenantContext.getStore() ?? null;
}
