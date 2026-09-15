import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import styles from './PasswordFlow.module.css';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [form, setForm] = useState({ password: '', confirmar: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

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
      await api.post('/auth/reset-password', { token, newPassword: form.password });
      setListo(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = axiosErr?.response?.data?.message;
      // El backend ya devuelve un mensaje claro para token vencido/usado
      // ("Token de recuperación inválido o expirado") — se muestra tal cual.
      setError(
        typeof msg === 'string' ? msg : Array.isArray(msg) ? msg[0] : 'No se pudo conectar al servidor.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoWord}>Estixa</div>
          <h1 className={styles.title}>Enlace inválido</h1>
          <p className={styles.sub}>
            Este enlace no es válido. Pide uno nuevo desde "¿Olvidaste tu contraseña?" en el login.
          </p>
          <Link to="/forgot-password" className={styles.backLink}>Pedir un enlace nuevo</Link>
        </div>
      </div>
    );
  }

  if (listo) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoWord}>Estixa</div>
          <div className={styles.okBox}>
            <div className={styles.okIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className={styles.title}>Contraseña actualizada</h1>
            <p className={styles.sub}>Ya podés iniciar sesión con tu nueva contraseña.</p>
          </div>
          <button type="button" className={styles.btn} onClick={() => navigate('/login')}>
            Ir a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWord}>Estixa</div>
        <h1 className={styles.title}>Crear contraseña nueva</h1>
        <p className={styles.sub}>Elegí una contraseña nueva para tu cuenta.</p>
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
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
        <Link to="/login" className={styles.backLink}>← Volver a iniciar sesión</Link>
      </div>
    </div>
  );
}
