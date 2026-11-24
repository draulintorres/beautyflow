import { useEffect, useRef, useState, type FormEvent } from 'react';
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

type Paso = 'credenciales' | 'codigo' | 'alta';

interface AdminPublico {
  id: string;
  nombre: string;
  email: string;
}

/** Extrae el mensaje de error de una respuesta de axios (string o primer
 * elemento de un arreglo), con un texto de respaldo genérico. */
function mensajeDeError(err: unknown, fallback: string): { status?: number; mensaje: string } {
  const axiosErr = err as { response?: { data?: { message?: string | string[] }; status?: number }; message?: string };
  const response = axiosErr?.response;
  if (!response) {
    return { mensaje: `Error de red: ${axiosErr?.message ?? 'No se pudo conectar al servidor'}.` };
  }
  const msg = response.data?.message;
  const mensaje = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg[0] : fallback;
  return { status: response.status, mensaje };
}

/** Un 401 de iniciar-alta/confirmar-alta/verificar-totp puede venir de dos
 * causas muy distintas: el CÓDIGO está mal (quedarse en el mismo paso, con
 * un mensaje genérico) o el TOKEN DE DESAFÍO venció/es inválido (volver al
 * paso 1 -- no tiene sentido seguir pidiendo un código para un desafío que
 * el servidor ya no reconoce). El backend (verificarChallenge() en
 * superadmin-totp.service.ts) solo usa estos 2 mensajes exactos para esa
 * segunda causa -- comparación exacta, no una palabra suelta, para que un
 * cambio futuro de texto rompa esto de forma ruidosa (ya no detecta nada)
 * en vez de silenciosa (detecta de más por una coincidencia parcial). */
const MENSAJES_CHALLENGE_INVALIDO = new Set([
  'Token de desafío inválido o expirado.',
  'Token de desafío inválido.',
]);
function esChallengeVencido(mensaje: string): boolean {
  return MENSAJES_CHALLENGE_INVALIDO.has(mensaje);
}

export function SALoginPage() {
  const navigate = useNavigate();
  const setSession = useSAAuthStore((s) => s.setSession);

  const [paso, setPaso] = useState<Paso>('credenciales');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Token de desafío: SOLO en memoria de React -- nunca en localStorage,
  // sessionStorage, URL ni en el store persistido (saAuth). Lo mismo para
  // el secreto manual y los códigos de respaldo más abajo.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  // ---------- paso 1: credenciales ----------
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);

  function handleChangeForm(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmitCredenciales(e: FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Ingresa tu correo y contraseña para continuar.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await saApi.post('/admin/login', form);
      setChallengeToken(data.challengeToken);
      setPaso(data.requiereAlta ? 'alta' : 'codigo');
    } catch (err) {
      const { mensaje } = mensajeDeError(err, 'Credenciales incorrectas.');
      setError(mensaje);
    } finally {
      setLoading(false);
    }
  }

  // ---------- paso 2: código (TOTP ya activo) ----------
  const [codigo, setCodigo] = useState('');
  const [usarRespaldo, setUsarRespaldo] = useState(false);
  const [codigoRespaldo, setCodigoRespaldo] = useState('');
  const codigoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paso === 'codigo') codigoInputRef.current?.focus();
  }, [paso, usarRespaldo]);

  // Vuelve al paso 1 y limpia TODO el estado del flujo (código y alta) --
  // así, si el admin vuelve a llegar a la pantalla de alta después de esto
  // (ej. challenge vencido durante la alta), altaIniciadaRef en false
  // obliga a pedir un QR nuevo en vez de reusar uno viejo o un secreto que
  // ya no coincide con lo que el servidor tiene pendiente.
  function volverAPaso1(mensaje: string) {
    setChallengeToken(null);
    setLoading(false);
    setError(mensaje);
    setPaso('credenciales');

    // paso 2 (código)
    setCodigo('');
    setCodigoRespaldo('');
    setUsarRespaldo(false);

    // paso 3 (alta)
    altaIniciadaRef.current = false;
    setQr(null);
    setSecretoManual(null);
    setCodigoAlta('');
    setCodigosRespaldo(null);
    setConfirmoGuardado(false);
    setCopiado(null);
    // sessionDataPendienteRef NO se toca acá: solo se llena tras un
    // confirmarAlta exitoso, momento en el que ya se pasó a la pantalla de
    // códigos de respaldo -- desde ahí no hay ningún camino de vuelta a
    // volverAPaso1 (ese paso ya no vuelve a llamar a ningún endpoint que
    // pueda fallar con un challenge vencido), así que en todo punto donde
    // volverAPaso1 sí se invoca, esta ref ya está en null por construcción.
  }

  async function handleSubmitCodigo(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    if (!usarRespaldo && codigo.length !== 6) {
      setError('Ingresa el código de 6 dígitos.');
      return;
    }
    if (usarRespaldo && !codigoRespaldo.trim()) {
      setError('Ingresa el código de respaldo.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await saApi.post('/admin/login/verificar-totp', {
        challengeToken,
        ...(usarRespaldo ? { codigoRespaldo: codigoRespaldo.trim() } : { codigo }),
      });
      setSession(data.accessToken, data.admin as AdminPublico);
      navigate('/admin/dashboard');
    } catch (err) {
      const { status, mensaje } = mensajeDeError(err, 'Código incorrecto o vencido.');
      if (status === 429) {
        setError(mensaje);
      } else if (status === 401 && esChallengeVencido(mensaje)) {
        volverAPaso1('La sesión de inicio venció, vuelve a empezar.');
      } else if (status === 401) {
        setError('Código incorrecto o vencido.');
        setCodigo('');
      } else {
        setError(mensaje);
      }
    } finally {
      setLoading(false);
    }
  }

  // ---------- paso 3: alta del 2FA (primera vez) ----------
  const [qr, setQr] = useState<string | null>(null);
  const [secretoManual, setSecretoManual] = useState<string | null>(null);
  const [codigoAlta, setCodigoAlta] = useState('');
  const [codigosRespaldo, setCodigosRespaldo] = useState<string[] | null>(null);
  const [confirmoGuardado, setConfirmoGuardado] = useState(false);
  const [copiado, setCopiado] = useState<'secreto' | 'codigos' | null>(null);
  const codigoAltaRef = useRef<HTMLInputElement>(null);
  const altaIniciadaRef = useRef(false);

  useEffect(() => {
    if (paso !== 'alta' || !challengeToken || altaIniciadaRef.current) return;
    altaIniciadaRef.current = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await saApi.post('/admin/login/totp/iniciar-alta', { challengeToken });
        setQr(data.qr);
        setSecretoManual(data.secretoManual);
      } catch (err) {
        const { status, mensaje } = mensajeDeError(err, 'No se pudo generar el código QR.');
        if (status === 401 && esChallengeVencido(mensaje)) {
          volverAPaso1('La sesión de inicio venció, vuelve a empezar.');
        } else {
          setError(mensaje);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [paso, challengeToken]);

  useEffect(() => {
    if (paso === 'alta' && qr && !codigosRespaldo) codigoAltaRef.current?.focus();
  }, [paso, qr, codigosRespaldo]);

  // accessToken/admin ya confirmados por el backend, en espera de que el
  // admin marque la casilla de "ya guardé los códigos" -- en una ref (no
  // state) porque nunca se renderiza ni se persiste, solo se usa una vez
  // al pulsar "Continuar".
  const sessionDataPendienteRef = useRef<{ accessToken: string; admin: AdminPublico } | null>(null);

  async function handleSubmitConfirmarAlta(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken || codigoAlta.length !== 6) {
      setError('Ingresa el código de 6 dígitos que muestra la aplicación.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await saApi.post('/admin/login/totp/confirmar-alta', {
        challengeToken,
        codigo: codigoAlta,
      });
      // Se guardan los códigos de respaldo (solo en memoria, se muestran
      // una vez) -- la sesión NO se guarda todavía: solo tras marcar la
      // casilla y pulsar "Continuar" más abajo.
      setCodigosRespaldo(data.codigosRespaldo);
      sessionDataPendienteRef.current = { accessToken: data.accessToken, admin: data.admin };
    } catch (err) {
      const { status, mensaje } = mensajeDeError(err, 'Código incorrecto o vencido.');
      if (status === 401 && esChallengeVencido(mensaje)) {
        volverAPaso1('La sesión de inicio venció, vuelve a empezar.');
      } else if (status === 401) {
        setError('Código incorrecto o vencido.');
        setCodigoAlta('');
      } else {
        setError(mensaje);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleContinuarTrasAlta() {
    if (!confirmoGuardado || !sessionDataPendienteRef.current) return;
    const { accessToken, admin } = sessionDataPendienteRef.current;
    setSession(accessToken, admin);
    navigate('/admin/dashboard');
  }

  async function copiar(texto: string, cual: 'secreto' | 'codigos') {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles -- no es crítico, el texto sigue visible.
    }
  }

  return (
    <div className={styles.page}>

      {/* ────────── PANEL IZQUIERDO ────────── */}
      <div className={styles.left}>
        <div className={styles.leftInner}>
          <div className={styles.leftCard}>
            <div className={styles.brand}>
              <img src={estixaMark} alt="" className={styles.logoMark} />
              <div className={styles.brandText}>
                <span className={styles.brandName}>Estixa</span>
              </div>
            </div>
            <div className={styles.adminBadge}>★ SUPER ADMIN PORTAL</div>
            <p className={styles.subtitle}>Administración global de la plataforma SaaS</p>
            <div className={styles.divider} />
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
        <div className={styles.glow} />
      </div>

      {/* ────────── PANEL DERECHO (FORMULARIO) ────────── */}
      <div className={styles.right}>
        <div className={styles.formWrap}>

          {paso === 'credenciales' && (
            <>
              <div className={styles.welcome}>
                <h1>Administración Global</h1>
                <p>Inicia sesión con tus credenciales de administrador</p>
              </div>

              <form className={styles.form} onSubmit={handleSubmitCredenciales} noValidate>
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
                      onChange={handleChangeForm}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

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
                      onChange={handleChangeForm}
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
            </>
          )}

          {paso === 'codigo' && (
            <>
              <div className={styles.welcome}>
                <h1>Verificación en dos pasos</h1>
                <p>
                  {usarRespaldo
                    ? 'Ingresa uno de tus códigos de respaldo.'
                    : 'Abre tu app de autenticación e ingresa el código de 6 dígitos.'}
                </p>
              </div>

              <form className={styles.form} onSubmit={handleSubmitCodigo} noValidate>
                {!usarRespaldo ? (
                  <div className={styles.field}>
                    <label htmlFor="sa-codigo">Código de verificación</label>
                    <input
                      id="sa-codigo"
                      ref={codigoInputRef}
                      className={styles.codeInput}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                ) : (
                  <div className={styles.field}>
                    <label htmlFor="sa-codigo-respaldo">Código de respaldo</label>
                    <div className={styles.inputWrap}>
                      <input
                        id="sa-codigo-respaldo"
                        ref={codigoInputRef}
                        type="text"
                        placeholder="abcd-efgh-jkmn-pqrs"
                        value={codigoRespaldo}
                        onChange={(e) => setCodigoRespaldo(e.target.value)}
                        maxLength={40}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}

                {error && <div className={styles.errorMsg}>{error}</div>}

                <button type="submit" className={styles.btnLogin} disabled={loading}>
                  {loading ? <span className={styles.spinner} /> : 'Entrar'}
                </button>

                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    setUsarRespaldo((v) => !v);
                    setCodigo('');
                    setCodigoRespaldo('');
                    setError('');
                  }}
                >
                  {usarRespaldo ? 'Usar el código de la app' : 'Usar un código de respaldo'}
                </button>
              </form>
            </>
          )}

          {paso === 'alta' && (
            <>
              <div className={styles.welcome}>
                <h1>Activa la verificación en dos pasos</h1>
                <p>Es obligatoria para entrar al panel de Super Admin.</p>
              </div>

              {!codigosRespaldo ? (
                <div className={styles.form}>
                  {qr ? (
                    <>
                      <ol className={styles.instructions}>
                        <li>Abre Google Authenticator (o una app similar) en tu teléfono.</li>
                        <li>Escanea este código QR.</li>
                        <li>Escribe abajo el código de 6 dígitos que te muestre la app.</li>
                      </ol>

                      <div className={styles.qrWrap}>
                        <img src={qr} alt="Código QR para activar la verificación en dos pasos" />
                      </div>

                      {secretoManual && (
                        <div className={styles.secretRow}>
                          <span>¿No puedes escanear? Código manual:</span>
                          <code>{secretoManual}</code>
                          <button type="button" onClick={() => copiar(secretoManual, 'secreto')}>
                            {copiado === 'secreto' ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                      )}

                      <form className={styles.form} onSubmit={handleSubmitConfirmarAlta} noValidate>
                        <div className={styles.field}>
                          <label htmlFor="sa-codigo-alta">Código de 6 dígitos</label>
                          <input
                            id="sa-codigo-alta"
                            ref={codigoAltaRef}
                            className={styles.codeInput}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="000000"
                            value={codigoAlta}
                            onChange={(e) => setCodigoAlta(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          />
                        </div>

                        {error && <div className={styles.errorMsg}>{error}</div>}

                        <button type="submit" className={styles.btnLogin} disabled={loading}>
                          {loading ? <span className={styles.spinner} /> : 'Confirmar'}
                        </button>
                      </form>
                    </>
                  ) : (
                    <>
                      {error && <div className={styles.errorMsg}>{error}</div>}
                      {loading && <span className={styles.spinner} />}
                    </>
                  )}
                </div>
              ) : (
                <div className={styles.form}>
                  <p className={styles.subtitle}>
                    Guarda estos 8 códigos de respaldo en un lugar seguro. Cada uno funciona una
                    sola vez y es la única forma de entrar si pierdes tu teléfono. No se mostrarán
                    de nuevo.
                  </p>

                  <ul className={styles.backupList}>
                    {codigosRespaldo.map((c) => (
                      <li key={c} className={styles.backupItem}>{c}</li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => copiar(codigosRespaldo.join('\n'), 'codigos')}
                  >
                    {copiado === 'codigos' ? 'Códigos copiados' : 'Copiar todos'}
                  </button>

                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={confirmoGuardado}
                      onChange={(e) => setConfirmoGuardado(e.target.checked)}
                    />
                    Ya guardé estos códigos en un lugar seguro
                  </label>

                  <button
                    type="button"
                    className={styles.btnLogin}
                    disabled={!confirmoGuardado}
                    onClick={handleContinuarTrasAlta}
                  >
                    Continuar
                  </button>
                </div>
              )}
            </>
          )}

        </div>

        <footer className={styles.foot}>
          © 2026 Estixa — Panel de administración SaaS
        </footer>
      </div>

    </div>
  );
}
