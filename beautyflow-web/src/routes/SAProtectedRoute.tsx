import { Navigate, Outlet } from 'react-router-dom';
import { useSAAuthStore } from '../store/saAuth';

export function SAProtectedRoute() {
  const isAuthenticated = useSAAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/admin/login" replace />;
}
