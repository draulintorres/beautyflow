import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { puedeVer } from '../lib/modulos';

/**
 * Layout route que valida módulo además de autenticación.
 * Si el usuario no tiene acceso a la ruta actual → /sin-acceso.
 * Debe anidarse DENTRO de <ProtectedRoute> y <AppLayout>.
 */
export function ModuloRoute() {
  const { pathname } = useLocation();
  const modulos = useAuthStore((s) => s.user?.modulos);

  if (!puedeVer(modulos, pathname)) {
    return <Navigate to="/sin-acceso" replace state={{ from: pathname }} />;
  }
  return <Outlet />;
}