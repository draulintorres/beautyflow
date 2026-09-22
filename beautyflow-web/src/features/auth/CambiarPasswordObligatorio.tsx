import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import styles from './PasswordFlow.module.css';

/**
 * Pantalla bloqueante: se muestra en vez de <Outlet/> (ver ProtectedRoute)
 * cuando `user.debeChangePassword` es true — el dueño de una empresa nueva
 * o un empleado con acceso recién creado, en su primer login con la
 * contraseña que le asignaron. No pide la contraseña actual (ya está
 * autenticado); al completar, actualiza el store en memoria y
 * ProtectedRoute deja pasar a <Outlet/> sin recargar ni volver a loguear.
 */
export function CambiarPasswordObligatorio() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const [form, setForm] = useState({ password: '', confirmar: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (form.password !== form.confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/cambiar-password-inicial', { newPassword: form.password });
      if (user) setUser({ ...user, debeChangePassword: false });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = axiosErr?.response?.data?.message;
      setError(
        typeof msg === 'string' ? msg : Array.isArray(msg) ? msg[0] : 'No se pudo conectar al servidor.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWord}>Estixa</div>
        <h1 className={styles.title}>Creá tu contraseña</h1>
        <p className={styles.sub}>
          Por seguridad, tenés que elegir tu propia contraseña antes de continuar.
        </p>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="password">Contraseña nueva</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirmar">Confirmar contraseña</label>
            <input
              id="confirmar"
              type="password"
              value={form.confirmar}
              onChange={(e) => setForm((f) => ({ ...f, confirmar: e.target.value }))}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
            />
          </div>
          {error && <div className={styles.errorMsg}>{error}</div>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </form>
        <button
          type="button"
          className={styles.backLink}
          onClick={logout}
          style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', font: 'inherit' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
