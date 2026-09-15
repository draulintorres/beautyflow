import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { saApi } from '../../lib/saApi';
import { useSAAuthStore } from '../../store/saAuth';
import estixaMark from '../../assets/estixa-mark.png';
import styles from './SALoginPage.module.css';

const FEATURES = [
  {
    label: 'Gestión de empresas',
    desc: 'Administra todas las peluquerías y salones en la plataforma',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 10l8-5 8 5M6 10v9h12v-9" />
        <rect x="9" y="15" width="6" height="4" />
      </svg>
    ),
  },
  {
    label: 'Reportes y estadísticas',
    desc: 'Métricas SaaS en tiempo real de toda la plataforma',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 20h18M5 20V14m4 6V10m4 10V6m4 14V3" />
      </svg>
    ),
  },
  {
    label: 'Facturación SaaS',
    desc: 'Control de suscripciones, pagos y facturas vencidas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M6 15h4M14 15h4" />
      </svg>
    ),
  },
  {
    label: 'Seguridad y control',
    desc: 'Suspensión de cuentas, auditoría y acceso global',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3L4 7v5c0 5 4 9.3 8 10.5C20 21.3 20 17 20 12V7z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
];

export function SALoginPage() {
  const navigate = useNavigate();
  const setSession = useSAAuthStore((s) => s.setSession);

  const [form, setForm]   = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Ingresa tu correo y contraseña para continuar.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await saApi.post('/admin/login', form);
      setSession(data.accessToken, data.admin);
      navigate('/admin/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string | string[] }; status?: number }; message?: string };
      const response = axiosErr?.response;
      if (!response) {
        setError(`Error de red: ${axiosErr?.message ?? 'No se pudo conectar al servidor'}.`);
      } else {
        const msg = response.data?.message;
        setError(
          typeof msg === 'string' ? msg
          : Array.isArray(msg)   ? msg[0]
          : 'Credenciales incorrectas.',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>

      {/* ────────── PANEL IZQUIERDO ────────── */}
      <div className={styles.left}>
        <div className={styles.leftInner}>

          {/* Card interior — base oscura garantiza legibilidad */}
          <div className={styles.leftCard}>

            {/* Logo — misma marca que el login de salones */}
            <div className={styles.brand}>
              <img src={estixaMark} alt="" className={styles.logoMark} />
              <div className={styles.brandText}>
                <span className={styles.brandName}>Estixa</span>
              </div>
            </div>

            {/* Badge */}
            <div className={styles.adminBadge}>★ SUPER ADMIN PORTAL</div>

            {/* Subtítulo */}
            <p className={styles.subtitle}>
              Administración global de la plataforma SaaS
            </p>

            {/* Separador */}
            <div className={styles.divider} />

            {/* Features */}
            <ul className={styles.features}>
              {FEATURES.map((f) => (
                <li key={f.label} className={styles.feat}>
                  <span className={styles.featIcon}>{f.icon}</span>
                  <div>
                    <b>{f.label}</b>
                    <small>{f.desc}</small>
                  </div>
                </li>
              ))}
            </ul>

          </div>
        </div>

        {/* Glow decorativo */}
        <div className={styles.glow} />
      </div>

      {/* ────────── PANEL DERECHO (FORMULARIO) ────────── */}
      <div className={styles.right}>
        <div className={styles.formWrap}>

          <div className={styles.welcome}>
            <h1>Administración Global</h1>
            <p>Inicia sesión con tus credenciales de administrador</p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>

            {/* Email */}
            <div className={styles.field}>
              <label htmlFor="sa-email">Correo electrónico</label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
                <input
                  id="sa-email"
                  name="email"
                  type="email"
                  placeholder="admin@estixa.com"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className={styles.field}>
              <label htmlFor="sa-password">Contraseña</label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 018 0v3" />
                </svg>
                <input
                  id="sa-password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••••"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    {showPw ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            <button type="submit" className={styles.btnLogin} disabled={loading}>
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
                  </svg>
                  Iniciar sesión
                </>
              )}
            </button>

          </form>
        </div>

        <footer className={styles.foot}>
          © 2026 Estixa — Panel de administración SaaS
        </footer>
      </div>

    </div>
  );
}
