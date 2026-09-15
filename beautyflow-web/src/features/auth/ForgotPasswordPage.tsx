import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import styles from './PasswordFlow.module.css';

export function ForgotPasswordPage() {
  const [form, setForm] = useState({ empresaSlug: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.empresaSlug || !form.email) {
      setError('Completa empresa y correo para continuar.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', form);
      // Misma pantalla de éxito exista o no la cuenta — el backend ya
      // responde igual en ambos casos, nunca hay que distinguir acá.
      setEnviado(true);
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

        {enviado ? (
          <div className={styles.okBox}>
            <div className={styles.okIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v16H4z" opacity="0" /><path d="M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
              </svg>
            </div>
            <h1 className={styles.title}>Revisa tu correo</h1>
            <p className={styles.sub}>
              Si <b>{form.email}</b> tiene una cuenta en <b>{form.empresaSlug}</b>, te enviamos un
              enlace para crear una contraseña nueva. El enlace vence en 1 hora.
            </p>
          </div>
        ) : (
          <>
            <h1 className={styles.title}>Restablecer contraseña</h1>
            <p className={styles.sub}>
              Ingresa la empresa y el correo con el que iniciás sesión — te mandamos un enlace para
              crear una contraseña nueva.
            </p>
            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.field}>
                <label htmlFor="empresaSlug">Empresa</label>
                <input
                  id="empresaSlug"
                  value={form.empresaSlug}
                  onChange={(e) => setForm((f) => ({ ...f, empresaSlug: e.target.value }))}
                  placeholder="ej: beauty-glam"
                  autoComplete="organization"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="email">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="tu@correo.com"
                  autoComplete="email"
                />
              </div>
              {error && <div className={styles.errorMsg}>{error}</div>}
              <button type="submit" className={styles.btn} disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </form>
          </>
        )}

        <Link to="/login" className={styles.backLink}>← Volver a iniciar sesión</Link>
      </div>
    </div>
  );
}
