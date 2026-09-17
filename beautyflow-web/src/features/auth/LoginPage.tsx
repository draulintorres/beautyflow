import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { rutaInicial } from '../../lib/modulos';
import { dispositivoConHuella, loginConHuella, soportaWebAuthn } from '../../lib/webauthn';
import { guardarLoginRecordado, leerLoginRecordado, olvidarLoginRecordado } from '../../lib/loginRecordado';
import { linkWhatsAppSoporte } from '../../lib/soporte';
import estixaMark from '../../assets/estixa-mark.png';
import styles from './LoginPage.module.css';

const APP_VERSION = '1.0.0';

interface LoginResultado {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string; nombre: string; email: string; rol: string;
    modulos?: string[]; empresaId: string; empresaSlug: string;
  };
}

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const recordado = leerLoginRecordado();
  const [form, setForm] = useState({
    empresaSlug: recordado?.empresaSlug ?? '',
    email: recordado?.email ?? '',
    password: '',
  });
  const [showPw, setShowPw] = useState(false);
  // "Recordar mi correo": ya NO decide dónde vive la sesión (eso ahora es
  // fijo — ver store/auth.ts) — solo si se guarda empresa+correo para
  // prellenar el formulario la próxima vez. Arranca marcado si ya había
  // algo recordado de una vez anterior.
  const [recordarCorreo, setRecordarCorreo] = useState(!!recordado);
  // Con empresa+correo ya recordados de una vez anterior, el formulario
  // arranca colapsado (solo contraseña) — "Cambiar" fuerza los 3 campos
  // de vuelta, para el caso de alguien con cuenta en más de una empresa
  // en el mismo dispositivo (ej. el propio Draulin).
  const [modoCambiar, setModoCambiar] = useState(false);
  const modoColapsado = !!recordado && !modoCambiar;
  const [loading, setLoading] = useState(false);
  const [loadingHuella, setLoadingHuella] = useState(false);
  const [error, setError] = useState('');

  const dispositivo = dispositivoConHuella();
  const mostrarBotonHuella = !!dispositivo && soportaWebAuthn();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  // Común a login por contraseña y por huella: ambos terminan con la misma
  // forma (tokens + user básico) — de ahí se completa igual con /auth/me.
  // `persist` decide dónde vive la sesión en este dispositivo: 'session'
  // para contraseña (se pierde al cerrar pestaña/app), 'local' para huella
  // (persiste hasta 7 días) — ver store/auth.ts.
  async function finalizarLogin(loginData: LoginResultado, persist: 'session' | 'local') {
    const { data: meData } = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${loginData.accessToken}` },
    });
    setSession({
      accessToken: loginData.accessToken,
      refreshToken: loginData.refreshToken,
      user: loginData.user,
      empresa: meData.empresa,
      persist,
    });
    navigate(rutaInicial(loginData.user.modulos ?? []));
  }

  function mostrarErrorLogin(err: unknown) {
    console.error('[Login error]', err);
    const axiosErr = err as { response?: { status?: number; data?: { message?: string | string[] } }; message?: string; code?: string };
    const response = axiosErr?.response;

    if (!response) {
      // Error de red: CORS, servidor caído, etc.
      setError(`Error de red: ${axiosErr?.message ?? 'No se pudo conectar al servidor'}. Asegúrate que el backend esté corriendo en el puerto 3000.`);
    } else {
      const msg = response.data?.message;
      setError(
        typeof msg === 'string'
          ? msg
          : Array.isArray(msg)
          ? msg[0]
          : `Error ${response.status}: Credenciales incorrectas.`,
      );
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.empresaSlug || !form.email || !form.password) {
      setError('Completa todos los campos para continuar.');
      return;
    }
    setLoading(true);
    try {
      const { data: loginData } = await api.post('/auth/login', form);
      if (recordarCorreo) {
        guardarLoginRecordado(form.empresaSlug, form.email);
      } else {
        olvidarLoginRecordado();
      }
      await finalizarLogin(loginData, 'session');
    } catch (err: unknown) {
      mostrarErrorLogin(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoginHuella() {
    setError('');
    setLoadingHuella(true);
    try {
      const loginData = await loginConHuella();
      await finalizarLogin(loginData, 'local');
    } catch (err: unknown) {
      // Cancelar el diálogo del navegador (o que falle el lector) no debe
      // verse como un error de servidor — solo se vuelve a mostrar el
      // formulario normal para que el usuario pueda entrar con contraseña.
      const isAbort = err instanceof Error && err.name === 'NotAllowedError';
      if (!isAbort) mostrarErrorLogin(err);
    } finally {
      setLoadingHuella(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ============ ARTE / COLLAGE ============ */}
        <div className={styles.art}>
          <div className={styles.collage}>
            <div className={`${styles.tile} ${styles.t1}`} />
            <div className={`${styles.tile} ${styles.t2}`} />
            <div className={`${styles.tile} ${styles.t3}`} />
            <div className={`${styles.tile} ${styles.t4}`} />
            <div className={`${styles.tile} ${styles.t5}`} />
            <div className={`${styles.tile} ${styles.t6}`} />
          </div>

          <div className={styles.barberBadge}>
            <b>BARBER</b>
            <small>SHOP</small>
          </div>
          <div className={styles.neon}>Nail Bar</div>

          <div className={styles.artCenter}>
            <img src={estixaMark} alt="" className={styles.logoMark} />

            <div className={styles.logoWord}>Estixa</div>
            <div className={styles.bizName}>Estixa Business</div>
            <p className={styles.bizSub}>Gestión profesional para salones y barberías</p>
            <p className={styles.tagline}>
              La plataforma <b>líder</b> para<br />la industria de la belleza
            </p>

            <div className={styles.verticals}>
              {[
                {
                  label: 'Salones de belleza',
                  icon: <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8 L20 18 M8 16 L20 6"/></svg>,
                },
                {
                  label: 'Barberías',
                  icon: <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="18" rx="3"/><path d="M9 8h6M9 13h6"/></svg>,
                },
                {
                  label: 'Nail Bar',
                  icon: <svg viewBox="0 0 24 24"><path d="M12 3c-2 4-4 6-4 10a4 4 0 008 0c0-4-2-6-4-10z"/></svg>,
                },
                {
                  label: 'Centros estéticos',
                  icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5"/><path d="M6 21c0-4 3-6 6-6s6 2 6 6"/></svg>,
                },
                {
                  label: 'Spa y masajes',
                  icon: <svg viewBox="0 0 24 24"><path d="M4 16c2-1 4-1 6 0M14 16c2-1 4-1 6 0"/><circle cx="12" cy="8" r="3"/></svg>,
                },
                {
                  label: 'Negocios mixtos',
                  icon: <svg viewBox="0 0 24 24"><path d="M4 10l8-5 8 5M6 10v9h12v-9"/></svg>,
                },
              ].map((v) => (
                <div key={v.label} className={styles.vert}>
                  <span className={styles.vertIcon}>{v.icon}</span>
                  <span>{v.label}</span>
                </div>
              ))}
            </div>
          </div>

          <svg className={styles.wave} viewBox="0 0 600 80" preserveAspectRatio="none">
            <path d="M0 50 Q150 20 300 45 T600 35 L600 80 L0 80 Z" fill="rgba(201,162,75,.16)" />
            <path d="M0 58 Q150 32 300 54 T600 46" fill="none" stroke="rgba(201,162,75,.7)" strokeWidth="1.5" />
          </svg>
        </div>

        {/* ============ FORMULARIO ============ */}
        <div className={styles.panel}>
          <div className={styles.panelTop}>
            <button type="button" className={styles.langBtn}>🌐 Español ▾</button>
          </div>

          <div className={styles.welcome}>
            <h1>Acceso Business</h1>
            <p>Inicia sesión para continuar</p>
          </div>

          {mostrarBotonHuella && (
            <div className={styles.huellaBlock}>
              <button
                type="button"
                className={styles.btnHuella}
                onClick={handleLoginHuella}
                disabled={loadingHuella || loading}
              >
                {loadingHuella ? (
                  <span className={styles.spinner} />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M12 2a7 7 0 00-7 7c0 2 .5 3.5 1.5 5M12 2a7 7 0 017 7c0 3-1 5-1 8M8.5 20.5c1-2 1-4 1-6.5a2.5 2.5 0 015 0c0 3 .3 5 1.3 7M12 8a5 5 0 00-5 5c0 2.5-.3 4-1 5.5M12 8a5 5 0 015 5c0 1 .05 1.9.2 2.7" />
                    </svg>
                    Entrar con huella / Face ID{dispositivo?.nombre ? ` · ${dispositivo.nombre}` : ''}
                  </>
                )}
              </button>
              <div className={styles.divider}><span>o con tu contraseña</span></div>
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>

            {modoColapsado ? (
              /* Empresa + correo ya recordados: se muestran como texto,
                 no como campos — "Cambiar" trae de vuelta el formulario
                 completo y editable. */
              <div className={styles.recordadoBar}>
                <svg className={styles.recordadoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
                </svg>
                <div className={styles.recordadoInfo}>
                  <b>{recordado!.empresaSlug}</b>
                  <span>{recordado!.email}</span>
                </div>
                <button
                  type="button"
                  className={styles.cambiarBtn}
                  onClick={() => setModoCambiar(true)}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                {/* Empresa slug */}
                <div className={styles.field}>
                  <label htmlFor="empresaSlug">Empresa</label>
                  <div className={styles.inputWrap}>
                    <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 10l8-5 8 5M6 10v9h12v-9" />
                    </svg>
                    <input
                      id="empresaSlug"
                      name="empresaSlug"
                      type="text"
                      placeholder="ej: beauty-glam"
                      value={form.empresaSlug}
                      onChange={handleChange}
                      autoComplete="organization"
                    />
                  </div>
                  <p className={styles.fieldHint}>El nombre corto de tu negocio. Ej: beauty-glam</p>
                </div>

                {/* Email */}
                <div className={styles.field}>
                  <label htmlFor="email">Correo electrónico</label>
                  <div className={styles.inputWrap}>
                    <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
                    </svg>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="Ingresa tu correo electrónico"
                      value={form.email}
                      onChange={handleChange}
                      autoComplete="email"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Contraseña */}
            <div className={styles.field}>
              <label htmlFor="password">Contraseña</label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" />
                </svg>
                <input
                  id="password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Ingresa tu contraseña"
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

            {/* Error */}
            {error && <div className={styles.errorMsg}>{error}</div>}

            <div className={styles.row}>
              {modoColapsado ? (
                <span />
              ) : (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={recordarCorreo}
                    onChange={(e) => setRecordarCorreo(e.target.checked)}
                  />
                  Recordar mi correo
                </label>
              )}
              <Link to="/forgot-password" className={styles.forgot}>¿Olvidaste tu contraseña?</Link>
            </div>
            {!modoColapsado && (
              <p className={styles.fieldHint} style={{ marginTop: -10, marginBottom: 14 }}>
                Solo recuerda empresa y correo para no volver a escribirlos — la contraseña nunca se
                guarda. Para entrar sin escribir nada, activa la huella/Face ID desde Ajustes.
              </p>
            )}

            <button type="submit" className={styles.btnLogin} disabled={loading}>
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
                  </svg>
                  Iniciar sesión
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </>
              )}
            </button>

            <div className={styles.help}>
              🎧 ¿Necesitas ayuda? Contáctanos por{' '}
              <a
                href={linkWhatsAppSoporte('Hola, necesito ayuda para entrar a Estixa')}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>{' '}
              💬
            </div>
          </form>

          <div className={styles.legal}>
            <span>© 2026 Estixa. Todos los derechos reservados.</span>
            <div className={styles.legalLinks}>
              <a href="#">Términos y condiciones</a>
              <a href="#">Política de privacidad</a>
              <a href="#">Soporte</a>
            </div>
          </div>
          <div className={styles.version}>
            <span>© 2026 Estixa</span>
            <span>Versión {APP_VERSION}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
