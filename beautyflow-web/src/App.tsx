import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { UpdatePrompt } from './components/UpdatePrompt';

// Tenant app
import { ProtectedRoute }   from './routes/ProtectedRoute';
import { ModuloRoute }      from './routes/ModuloRoute';
import { AppLayout }        from './routes/AppLayout';
import { SinAccesoPage }    from './features/sin-acceso/SinAccesoPage';
import { LoginPage }        from './features/auth/LoginPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage }  from './features/auth/ResetPasswordPage';
import { DashboardPage }    from './features/dashboard/DashboardPage';
import { AgendaPage }       from './features/agenda/AgendaPage';
import { PosPage }          from './features/pos/PosPage';
import { ClientesPage }     from './features/clientes/ClientesPage';
import { InventarioPage }   from './features/inventario/InventarioPage';
import { CatalogoPage }     from './features/catalogo/CatalogoPage';
import { ReportesPage }     from './features/reportes/ReportesPage';
import { UsuariosPage }     from './features/usuarios/UsuariosPage';
import { SucursalesPage }   from './features/sucursales/SucursalesPage';
import { EmpleadosPage }    from './features/empleados/EmpleadosPage';
import { EquipoPage }             from './features/equipo/EquipoPage';
import { AjustesPage }            from './features/ajustes/AjustesPage';
import { CuentasPorCobrarPage }   from './features/cuentas-por-cobrar/CuentasPorCobrarPage';
import { LiquidacionesPage }      from './features/liquidaciones/LiquidacionesPage';
import { AuditoriaPage }          from './features/auditoria/AuditoriaPage';

// Super Admin
import { SAProtectedRoute } from './routes/SAProtectedRoute';
import { SALoginPage }      from './features/super-admin/SALoginPage';
import { SALayout }         from './features/super-admin/SALayout';
import { SADashboardPage }  from './features/super-admin/SADashboardPage';
import { SAEmpresasPage }   from './features/super-admin/SAEmpresasPage';
import { SAPlanesPage }       from './features/super-admin/SAPlanesPage';
import { SAFacturacionPage }  from './features/super-admin/SAFacturacionPage';

// Portal del Cliente
import { PortalProtectedRoute } from './features/portal/PortalProtectedRoute';
import { PortalLoginPage }      from './features/portal/PortalLoginPage';
import { PortalDashboardPage }  from './features/portal/PortalDashboardPage';
import { PortalCitasPage }      from './features/portal/PortalCitasPage';
import { PortalPuntosPage }     from './features/portal/PortalPuntosPage';
import { PortalPerfilPage }     from './features/portal/PortalPerfilPage';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UpdatePrompt />
      <BrowserRouter>
        <Routes>

          {/* ── Tenant app ── */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/sin-acceso" element={<SinAccesoPage />} />
              <Route element={<ModuloRoute />}>
                <Route path="/dashboard"  element={<DashboardPage />} />
                <Route path="/agenda"     element={<AgendaPage />} />
                <Route path="/pos"        element={<PosPage />} />
                <Route path="/clientes"   element={<ClientesPage />} />
                <Route path="/inventario" element={<InventarioPage />} />
                <Route path="/catalogo"   element={<CatalogoPage />} />
                <Route path="/reportes"   element={<ReportesPage />} />
                <Route path="/equipo"              element={<EquipoPage />} />
                <Route path="/empleados"           element={<EquipoPage />} />
                <Route path="/cuentas-por-cobrar"  element={<CuentasPorCobrarPage />} />
                <Route path="/comisiones"          element={<LiquidacionesPage />} />
                <Route path="/usuarios"   element={<UsuariosPage />} />
                <Route path="/sucursales" element={<SucursalesPage />} />
                <Route path="/ajustes"    element={<AjustesPage />} />
                <Route path="/auditoria"  element={<AuditoriaPage />} />
              </Route>
            </Route>
          </Route>

          {/* ── Super Admin ── */}
          <Route path="/admin/login" element={<SALoginPage />} />

          <Route element={<SAProtectedRoute />}>
            <Route element={<SALayout />}>
              <Route path="/admin"           element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/dashboard" element={<SADashboardPage />} />
              <Route path="/admin/empresas" element={<SAEmpresasPage />} />
              <Route path="/admin/planes"       element={<SAPlanesPage />} />
              <Route path="/admin/facturacion" element={<SAFacturacionPage />} />
            </Route>
          </Route>

          {/* ── Portal del Cliente ── */}
          <Route path="/portal/login" element={<PortalLoginPage />} />

          <Route element={<PortalProtectedRoute />}>
            <Route path="/portal"             element={<PortalDashboardPage />} />
            <Route path="/portal/citas"       element={<PortalCitasPage />} />
            <Route path="/portal/puntos"      element={<PortalPuntosPage />} />
            <Route path="/portal/perfil"      element={<PortalPerfilPage />} />
          </Route>

          {/* Catch-all → tenant login */}
          <Route path="*" element={<Navigate to="/login" replace />} />

        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
