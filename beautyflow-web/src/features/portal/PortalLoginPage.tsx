import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { usePortalAuth } from '../../store/portalAuth';
import { PortalShell } from './PortalShell';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { linkWhatsAppSoporte } from '../../lib/soporte';
import estixaMark from '../../assets/estixa-mark.png';
import styles from './PortalLoginPage.module.css';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const EMPRESA_SLUG = 'beauty-glam';
const TIMER_SECS = 600; // 10 min — expiración real del OTP

export function PortalLoginPage() {
  const navigate = useNavigate();
  const setTokens = usePortalAuth((s) => s.setTokens);

  const [paso, setPaso] = useState<1 | 2>(1);
  const [destino, setDestino] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [oauthMsg, setOauthMsg] = useState(false);

  // 6 cajas OTP
  const [digits, setDigits] = useState<string[]>(new Array(6).fill(''));
  const digitRefs = useRef<(HTMLInputElement | null)[]>(new Array(6).fill(null));

  // Temporizador de 10 min
  const [timeLeft, setTimeLeft] = useState(TIMER_SECS);

  useEffect(() => {
    if (paso !== 2) return;
    setTimeLeft(TIMER_SECS);
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(id); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paso]);

  // Enfoca primera caja al entrar al paso 2
  useEffect(() => {
    if (paso === 2) {
      setTimeout(() => digitRefs.current[0]?.focus(), 80);
    }
  }, [paso]);

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  const codigo = digits.join('');

  async function solicitar() {
    setErr(null); setLoading(true);
    try {
      const { data } = await axios.post(`${BASE}/portal/auth/solicitar-otp`, {
        empresaSlug: EMPRESA_SLUG,
        destino: destino.trim(),
      });
      setDevOtp(data.devOtp ?? null);
      setDigits(new Array(6).fill(''));
      setPaso(2);
    } catch {
      setErr('No se pudo enviar el código. Verifica tu teléfono o correo.');
    } finally { setLoading(false); }
  }

  async function verificar() {
    setErr(null); setLoading(true);
    try {
      const { data } = await axios.post(`${BASE}/portal/auth/verificar-otp`, {
        empresaSlug: EMPRESA_SLUG,
        destino: destino.trim(),
        codigo,
      });
      setTokens(data.accessToken, data.refreshToken);
      navigate('/portal');
    } catch {
      setErr('Código incorrecto o expirado. Intenta de nuevo.');
    } finally { setLoading(false); }
  }

  // Manejadores de las 6 cajas
  function handleDigit(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '');
    const newDigits = [...digits];
    newDigits[idx] = val.slice(0, 1);
    setDigits(newDigits);
    if (val && idx < 5) digitRefs.current[idx + 1]?.focus();
  }

  function handleDigitKey(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const newDigits = [...digits];
        newDigits[idx] = '';
        setDigits(newDigits);
      } else if (idx > 0) {
        digitRefs.current[idx - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      digitRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      digitRefs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent, startIdx: number) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6 - startIdx);
    if (!text) return;
    e.preventDefault();
    const newDigits = [...digits];
    for (let i = 0; i < text.length; i++) {
      if (startIdx + i < 6) newDigits[startIdx + i] = text[i];
    }
    setDigits(newDigits);
    digitRefs.current[Math.min(startIdx + text.length, 5)]?.focus();
  }

  function handleOAuth() {
    setOauthMsg(true);
    setTimeout(() => setOauthMsg(false), 3000);
  }

  // ─────────────── RENDER ───────────────

  if (paso === 2) {
    return (
      <PortalShell>
        <div className={styles.page2}>

          {/* Top bar */}
          <div className={styles.topBar}>
            <button className={styles.backBtn}
              onClick={() => { setPaso(1); setErr(null); setDigits(new Array(6).fill('')); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <div className={styles.topBarRight}>
              <ThemeToggleButton className={styles.themeBtn} />
              <button className={styles.ayudaBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                </svg>
                Ayuda
              </button>
            </div>
          </div>

          {/* Contenido */}
          <div className={styles.p2Body}>
            <div className={styles.shieldWrap}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>

            <h2 className={styles.verTitle}>Verificación</h2>
            <p className={styles.verSub}>Hemos enviado un código de 6 dígitos a</p>

            <div className={styles.destinoRow}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15" style={{ stroke: 'var(--gold-soft)', flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 015.19 12.9a19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
              </svg>
              <span className={styles.destinoTxt}>{destino}</span>
              <button className={styles.editBtn} onClick={() => { setPaso(1); setErr(null); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>

            {devOtp && (
              <div className={styles.devBox}>
                🔧 Código de prueba: <b>{devOtp}</b>
              </div>
            )}

            {/* 6 cajas individuales */}
            <div className={styles.otpRow}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { digitRefs.current[i] = el; }}
                  className={`${styles.otpBox} ${d ? styles.otpFilled : ''}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e)}
                  onKeyDown={e => handleDigitKey(i, e)}
                  onFocus={e => e.target.select()}
                  onPaste={e => handlePaste(e, i)}
                />
              ))}
            </div>

            <p className={styles.timerTxt}>
              {timeLeft > 0
                ? <>El código expira en <b>{fmtTime(timeLeft)}</b></>
                : <>El código ha expirado. Reenvía para continuar.</>}
            </p>

            {err && <p className={styles.err}>{err}</p>}

            <button
              className={styles.btnPrimary}
              disabled={codigo.length < 6 || loading}
              onClick={verificar}
            >
              {loading ? <span className={styles.spinner} /> : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                    <path d="M5 11l4 4L19 7"/>
                  </svg>
                  Verificar código
                </>
              )}
            </button>

            <button
              className={styles.btnSecondary}
              disabled={timeLeft > 0 || loading}
              onClick={solicitar}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
              </svg>
              {timeLeft > 0 ? `Reenviar código (${fmtTime(timeLeft)})` : 'Reenviar código'}
            </button>

            <div className={styles.verFooter}>
              <div className={styles.secureMsg}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="1.5" width="14" height="14">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Tu información está 100% segura y encriptada
              </div>
              <a
                className={styles.helpMsg}
                href={linkWhatsAppSoporte('Hola, necesito ayuda para entrar al portal de cliente de Estixa')}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                  <path d="M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>
                </svg>
                <span>¿Necesitas ayuda? <b>Contáctanos por WhatsApp</b></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </PortalShell>
    );
  }

  // ─── PASO 1 ───
  return (
    <PortalShell>
      <div className={styles.page1}>

        {/* HERO con collage de salón */}
        <div className={styles.hero}>
          <div className={styles.collage}>
            <div className={`${styles.tile} ${styles.t1}`} />
            <div className={`${styles.tile} ${styles.t2}`} />
            <div className={`${styles.tile} ${styles.t3}`} />
            <div className={`${styles.tile} ${styles.t4}`} />
            <div className={`${styles.tile} ${styles.t5}`} />
            <div className={`${styles.tile} ${styles.t6}`} />
          </div>
          <div className={styles.heroOverlay} />

          <ThemeToggleButton className={styles.themeBtnHero} />
          <button className={styles.langBtn}>🌐 ES ▾</button>

          <div className={styles.heroCenter}>
            {/* Logo: marca Estixa */}
            <div className={styles.logoBadge}>
              <img src={estixaMark} alt="" width={52} height={52} />
            </div>

            <div className={styles.brandWord}>
              <span className={styles.flow}>Estixa</span>
            </div>

            <div className={styles.brandSub}>
              <i className={styles.lineL} />
              <span>PORTAL DEL CLIENTE</span>
              <i className={styles.lineR} />
            </div>

            <p className={styles.tagline}>La plataforma <b>líder</b> para<br />la industria de la belleza</p>

            {/* Línea de corazón decorativa */}
            <svg viewBox="0 0 60 20" fill="none" width="60" style={{ marginTop: 8, opacity: 0.65 }}>
              <path d="M30 14 C28 10 22 6 22 11 C22 15 26 17 30 20 C34 17 38 15 38 11 C38 6 32 10 30 14Z"
                fill="var(--gold)" opacity="0.7" />
            </svg>
          </div>
        </div>

        {/* CUERPO DEL FORMULARIO */}
        <div className={styles.body}>
          <h2 className={styles.hola}>Hola 👋</h2>
          <p className={styles.lead}>Ingresa tu teléfono o correo<br />para recibir un código de acceso.</p>

          <div className={styles.inputWrap}>
            <svg className={styles.inputIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 015.19 12.9a19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
            </svg>
            <input
              className={styles.input}
              placeholder="809-000-0000 o tu correo"
              value={destino}
              onChange={e => { setDestino(e.target.value); setErr(null); }}
              onKeyDown={e => e.key === 'Enter' && destino.trim() && !loading && solicitar()}
            />
          </div>

          {err && <p className={styles.err}>{err}</p>}

          <button
            className={styles.btnPrimary}
            disabled={!destino.trim() || loading}
            onClick={solicitar}
          >
            {loading ? <span className={styles.spinner} /> : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                  <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>
                </svg>
                Recibir código
              </>
            )}
          </button>

          {oauthMsg && (
            <div className={styles.oauthMsg}>Disponible próximamente</div>
          )}

          <div className={styles.divider}>O continúa con</div>

          <div className={styles.socials}>
            <button className={styles.soc} onClick={handleOAuth}>
              {/* Google G icon */}
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="#EA4335" d="M12 11v3.2h4.5c-.2 1.2-1.4 3.5-4.5 3.5-2.7 0-4.9-2.2-4.9-5s2.2-5 4.9-5c1.5 0 2.6.7 3.2 1.2l2.2-2.1C16.1 4.6 14.2 3.7 12 3.7 7.6 3.7 4 7.3 4 11.7s3.6 8 8 8c4.6 0 7.7-3.2 7.7-7.8 0-.5 0-.9-.1-1.3H12z"/>
              </svg>
              Google
            </button>
            <button className={styles.soc} onClick={handleOAuth}>
              {/* Apple icon */}
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="#fff" d="M16 1.5c-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4.6-.8 1.1-1.9 1-3zM18.5 12.5c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.2-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.2.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9z"/>
              </svg>
              Apple
            </button>
          </div>

          <div className={styles.features}>
            <div className={styles.feat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>Seguro</span>
            </div>
            <div className={styles.feat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <span>Rápido</span>
            </div>
            <div className={styles.feat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
                <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>
              </svg>
              <span>Personalizado</span>
            </div>
          </div>

          <p className={styles.secured}>🔒 Tus datos están protegidos</p>
        </div>
      </div>
    </PortalShell>
  );
}
