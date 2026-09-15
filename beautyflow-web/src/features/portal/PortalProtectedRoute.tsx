import { Navigate, Outlet } from 'react-router-dom';
import { usePortalAuth } from '../../store/portalAuth';

export function PortalProtectedRoute() {
  const token = usePortalAuth((s) => s.accessToken);
  return token ? <Outlet /> : <Navigate to="/portal/login" replace />;
}
