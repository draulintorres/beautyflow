import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { CambiarPasswordObligatorio } from '../features/auth/CambiarPasswordObligatorio';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  // Sesiones antiguas persisted sin modulos → hidratar desde /auth/me
  // (bloqueante, solo para ese caso — evita un flash de "sin acceso" antes
  // de tener algo que mostrar).
  const [hydrating, setHydrating] = useState(
    isAuthenticated && user !== null && user.modulos === undefined,
  );

  useEffect(() => {
    if (!hydrating) return;
    api
      .get('/auth/me')
      .then(({ data }) => {
        // /auth/me devuelve el usuario plano en la raíz (no bajo data.user)
        const modulos: string[] = data.modulos ?? [];
        useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, modulos });
      })
      .catch(() => useAuthStore.getState().logout())
      .finally(() => setHydrating(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresco silencioso (NO bloqueante) de `modulos` Y `empresa` en cada
  // carga de la app: una sesión ya logueada trae lo que había al momento
  // del login, guardado en localStorage — si después se activa un módulo
  // nuevo (como pasó con "Auditoría") o se cambia un ajuste de empresa
  // (ej. "ver agenda de inquilinos"), esa sesión nunca se enteraba hasta
  // cerrar sesión y volver a entrar. Este refresco no bloquea el render
  // (no hay pantalla en blanco) y actualiza en cuanto responde, sin que el
  // usuario tenga que hacer nada — alcanza con recargar la pantalla donde
  // esté (no hace falta cerrar sesión).
  useEffect(() => {
    if (!isAuthenticated) return;
    api
      .get('/auth/me')
      .then(({ data }) => {
        const modulos: string[] = data.modulos ?? [];
        const current = useAuthStore.getState().user;
        if (current) useAuthStore.getState().setUser({ ...current, modulos });
        if (data.empresa) useAuthStore.getState().setEmpresa(data.empresa);
      })
      .catch(() => { /* silencioso — si falla, se queda con lo que ya tenía */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (hydrating) return null;
  // Contraseña asignada por otra persona (dueño de empresa nueva, o
  // empleado con acceso recién creado) — bloquea CUALQUIER módulo hasta
  // que la cambie, sin importar a qué ruta haya llegado.
  if (user?.debeChangePassword) return <CambiarPasswordObligatorio />;
  return <Outlet />;
}