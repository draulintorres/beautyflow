import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import {
  activarHuella,
  adivinarNombreDispositivo,
  dispositivoConHuella,
  olvidarDispositivoLocal,
  soportaWebAuthn,
} from '../../lib/webauthn';
import styles from './AjustesPage.module.css';

interface DispositivoHuella {
  id: string;
  credentialId: string;
  deviceLabel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface MetodoPago {
  id: string;
  nombre: string;
  esEfectivo: boolean;
  activo: boolean;
  orden: number;
}

interface EmpresaAjustes {
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  direccion: string | null;
  horaRecordatorio: string;
  minutosAvisoCita: number;
  itbisPct: number;
  pinAnulacionActivo: boolean;
  pinAnulacionConfigurado: boolean;
}

const errMsg = (e: unknown) => {
  const msg = (e as any)?.response?.data?.message;
  return msg ? (Array.isArray(msg) ? msg.join(' · ') : String(msg)) : 'Error inesperado.';
};

export function AjustesPage() {
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const esOwner = authUser?.rol === 'OWNER';
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3800);
  };

  // Login biométrico: la bandera vive en localStorage (no en el store de
  // auth), así que se refleja en un estado propio para poder re-renderizar
  // el botón "Activar"/lista tras activar o revocar sin recargar la página.
  const [huellaLocal, setHuellaLocal] = useState(() => dispositivoConHuella());
  const webauthnSoportado = soportaWebAuthn();

  const { data: dispositivos } = useQuery<DispositivoHuella[]>({
    queryKey: ['webauthn-devices'],
    queryFn: () => api.get('/auth/webauthn/devices').then((r) => r.data),
    enabled: webauthnSoportado,
  });

  const activarMutation = useMutation({
    mutationFn: () =>
      activarHuella(
        authUser!.empresaSlug,
        authUser!.nombre,
        adivinarNombreDispositivo(),
      ),
    onSuccess: () => {
      setHuellaLocal(dispositivoConHuella());
      qc.invalidateQueries({ queryKey: ['webauthn-devices'] });
      showToast('Huella/Face ID activada en este dispositivo.');
    },
    onError: (e) => showToast(errMsg(e), false),
  });

  const revocarMutation = useMutation({
    mutationFn: (dispositivo: DispositivoHuella) =>
      api.post(`/auth/webauthn/devices/${dispositivo.id}/revoke`).then(() => dispositivo),
    onSuccess: (dispositivoRevocado) => {
      // Si el dispositivo revocado es justo ESTE (mismo credentialId que
      // localStorage), hay que limpiar la bandera local también — si no,
      // el login seguiría ofreciendo un atajo que ya no funciona.
      if (huellaLocal && dispositivoRevocado.credentialId === huellaLocal.credentialId) {
        olvidarDispositivoLocal();
        setHuellaLocal(null);
      }
      qc.invalidateQueries({ queryKey: ['webauthn-devices'] });
      showToast('Dispositivo olvidado.');
    },
    onError: (e) => showToast(errMsg(e), false),
  });

  const { data: empresa, isLoading } = useQuery<EmpresaAjustes>({
    queryKey: ['empresa-info'],
    queryFn: () => api.get('/empresa').then((r) => r.data),
  });

  const [form, setForm] = useState({
    nombre: '', rnc: '', telefono: '', direccion: '', horaRecordatorio: '07:00',
    minutosAvisoCita: 30,
    itbisPct: 18,
    pinAnulacionActivo: false,
  });
  // PIN nuevo: campo transitorio, nunca se precarga con el valor del
  // servidor (el backend jamás devuelve el PIN, solo si ya hay uno
  // configurado) — vacío = "no cambiar el PIN actual".
  const [pinNuevo, setPinNuevo] = useState('');

  // Sincroniza el form con el valor real del servidor al cargar / tras guardar.
  useEffect(() => {
    if (!empresa) return;
    setForm({
      nombre: empresa.nombre ?? '',
      rnc: empresa.rnc ?? '',
      telefono: empresa.telefono ?? '',
      direccion: empresa.direccion ?? '',
      horaRecordatorio: empresa.horaRecordatorio ?? '07:00',
      minutosAvisoCita: empresa.minutosAvisoCita ?? 30,
      itbisPct: empresa.itbisPct ?? 18,
      pinAnulacionActivo: empresa.pinAnulacionActivo ?? false,
    });
  }, [empresa]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setEmpresaStore = useAuthStore((s) => s.setEmpresa);

  const guardar = useMutation({
    mutationFn: () =>
      api.patch('/empresa', {
        nombre: form.nombre,
        rnc: form.rnc,
        telefono: form.telefono,
        direccion: form.direccion,
        horaRecordatorio: form.horaRecordatorio,
        minutosAvisoCita: form.minutosAvisoCita,
        // Igual que el PIN: si cambia si el negocio cobra ITBIS o no, es
        // EXCLUSIVO de OWNER — un ADMIN ni siquiera manda este campo, para
        // no reenviar sin querer un valor que el backend rechazaría con 403.
        ...(esOwner && { itbisPct: form.itbisPct }),
        // El candado de PIN es EXCLUSIVO de OWNER (el backend también lo
        // exige) — si un ADMIN guarda el resto de Ajustes, ni siquiera se
        // manda este campo, para no reenviar sin querer un valor que el
        // backend rechazaría con 403.
        ...(esOwner && { pinAnulacionActivo: form.pinAnulacionActivo }),
        ...(esOwner && pinNuevo && { pinAnulacion: pinNuevo }),
      }).then((r) => r.data),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['empresa-info'] });
      setPinNuevo(''); // campo write-only: nunca se re-muestra tras guardar
      // El sidebar (y cualquier otro lugar que lea del store de auth) muestra
      // empresa.nombre desde useAuthStore, no desde este GET local — sin
      // esto, el nombre quedaba "guardado" en BD pero viejo en pantalla
      // hasta recargar la página. /auth/me devuelve la empresa ya
      // actualizada con la forma exacta que espera el store.
      try {
        const me = await api.get('/auth/me').then((r) => r.data);
        if (me?.empresa) setEmpresaStore(me.empresa);
      } catch { /* el guardado ya fue exitoso; esto es solo refrescar la UI */ }
      showToast('Ajustes guardados.');
    },
    onError: (e) => showToast(errMsg(e), false),
  });

  // Métodos de pago (Ajustes, exclusivo OWNER) — mismo endpoint que ya usa
  // el POS (PosPage/PosMobile/CuentasPorCobrar), así que hay que invalidar
  // AMBAS query keys que ellos usan para el mismo GET (`metodos-pago` y
  // `pos-metodos` — quedaron con nombres distintos de antes, no es algo
  // que valga la pena unificar en esta ronda) para que un cambio acá se
  // refleje ahí sin recargar la página.
  const { data: metodosPago = [] } = useQuery<MetodoPago[]>({
    queryKey: ['metodos-pago'],
    queryFn: () => api.get('/metodos-pago').then((r) => r.data),
    enabled: esOwner,
  });

  function invalidarMetodosPago() {
    qc.invalidateQueries({ queryKey: ['metodos-pago'] });
    qc.invalidateQueries({ queryKey: ['pos-metodos'] });
  }

  const patchMetodo = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<MetodoPago, 'activo' | 'orden'>> }) =>
      api.patch(`/metodos-pago/${id}`, data).then((r) => r.data),
    onSuccess: () => invalidarMetodosPago(),
    onError: (e) => showToast(errMsg(e), false),
  });

  function toggleActivo(m: MetodoPago) {
    // Apagar el último método activo no se bloquea (el POS ya avisa y
    // bloquea el cobro cuando no hay ninguno) — solo se advierte antes,
    // para que no pase por accidente.
    if (m.activo && metodosPago.filter((x) => x.activo).length === 1) {
      const ok = window.confirm(
        'Este es tu único método de pago activo. Si lo desactivas, no podrás cobrar hasta activar otro. ¿Confirmar?',
      );
      if (!ok) return;
    }
    patchMetodo.mutate({ id: m.id, data: { activo: !m.activo } });
  }

  function moverMetodo(m: MetodoPago, direccion: -1 | 1) {
    const ordenados = [...metodosPago].sort((a, b) => a.orden - b.orden);
    const idx = ordenados.findIndex((x) => x.id === m.id);
    const vecino = ordenados[idx + direccion];
    if (!vecino) return;
    // Swap de `orden` entre los dos — dos PATCH secuenciales, no hay
    // endpoint de reordenamiento masivo y no hace falta para 2 filas.
    patchMetodo.mutate({ id: m.id, data: { orden: vecino.orden } });
    patchMetodo.mutate({ id: vecino.id, data: { orden: m.orden } });
  }

  const pinInvalido = pinNuevo.length > 0 && !/^\d{4,8}$/.test(pinNuevo);

  if (isLoading || !empresa) {
    return (
      <div className={styles.page}>
        <div className={styles.loadWrap}><div className={styles.spinner} /></div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Ajustes</h1>
        <p className={styles.sub}>Datos del negocio y notificaciones</p>
      </div>

      {/* Apariencia: preferencia visual PERSONAL, no de negocio — visible
          para cualquier usuario logueado (a diferencia de "Seguridad" más
          abajo, que sí es solo-OWNER). Se guarda solo en este dispositivo
          (ver src/store/theme.ts), no se manda al backend. */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Apariencia</h2>
        <p className={styles.fieldHint} style={{ marginBottom: 12 }}>
          Elige cómo se ve la aplicación en este dispositivo. Tu elección se guarda aquí mismo —
          si entras desde otro dispositivo, verás el tema oscuro hasta que elijas ahí también.
        </p>
        <div className={styles.themeSeg}>
          <button
            type="button"
            className={`${styles.themeOpt} ${theme === 'dark' ? styles.themeOptActivo : ''}`}
            onClick={() => setTheme('dark')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.5 14.3A8.5 8.5 0 019.7 3.5a8.5 8.5 0 1010.8 10.8z" />
            </svg>
            Oscuro
          </button>
          <button
            type="button"
            className={`${styles.themeOpt} ${theme === 'light' ? styles.themeOptActivo : ''}`}
            onClick={() => setTheme('light')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
            </svg>
            Claro
          </button>
        </div>
      </div>

      {/* Acceso rápido (login biométrico): PERSONAL, por dispositivo —
          visible a cualquier usuario logueado, igual que "Apariencia". El
          atajo nunca reemplaza el login por contraseña, que sigue
          funcionando igual esté o no activado. */}
      {webauthnSoportado && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Acceso rápido</h2>
          <p className={styles.fieldHint} style={{ marginBottom: 12 }}>
            Activa tu huella o Face ID para entrar más rápido en este dispositivo, sin escribir
            la contraseña. Es un atajo adicional — tu contraseña sigue funcionando igual.
          </p>

          {!huellaLocal && (
            <button
              type="button"
              className={styles.btnSave}
              style={{ marginBottom: dispositivos?.length ? 16 : 0 }}
              disabled={activarMutation.isPending}
              onClick={() => activarMutation.mutate()}
            >
              {activarMutation.isPending ? 'Activando…' : 'Activar en este dispositivo'}
            </button>
          )}
          {huellaLocal && (
            <p className={styles.pinEstado} style={{ marginBottom: 16 }}>
              ✓ Activada en este dispositivo
            </p>
          )}

          {dispositivos && dispositivos.length > 0 && (
            <div className={styles.dispositivosList}>
              {dispositivos.map((d) => (
                <div key={d.id} className={styles.dispositivoRow}>
                  <div>
                    <div className={styles.dispositivoNombre}>
                      {d.deviceLabel || 'Dispositivo sin nombre'}
                      {huellaLocal?.credentialId === d.credentialId && (
                        <span className={styles.dispositivoTag}>este dispositivo</span>
                      )}
                    </div>
                    <div className={styles.fieldHint}>
                      Activado el {new Date(d.createdAt).toLocaleDateString('es-DO')}
                      {d.lastUsedAt && ` · último uso ${new Date(d.lastUsedAt).toLocaleDateString('es-DO')}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.dispositivoOlvidar}
                    disabled={revocarMutation.isPending}
                    onClick={() => revocarMutation.mutate(d)}
                  >
                    Olvidar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Datos del negocio</h2>
        <div className={styles.formGrid}>
          <div className={`${styles.formField} ${styles.fieldFull}`}>
            <label htmlFor="ajNombre">Nombre *</label>
            <input
              id="ajNombre"
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              maxLength={150}
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor="ajRnc">RNC / Cédula</label>
            <input
              id="ajRnc"
              value={form.rnc}
              onChange={(e) => set('rnc', e.target.value)}
              maxLength={20}
            />
            <p className={styles.fieldHint}>Estos datos aparecen en los recibos de venta.</p>
          </div>
          <div className={styles.formField}>
            <label htmlFor="ajTelefono">Teléfono</label>
            <input
              id="ajTelefono"
              value={form.telefono}
              onChange={(e) => set('telefono', e.target.value)}
              maxLength={30}
            />
          </div>
          <div className={`${styles.formField} ${styles.fieldFull}`}>
            <label htmlFor="ajDireccion">Dirección</label>
            <input
              id="ajDireccion"
              value={form.direccion}
              onChange={(e) => set('direccion', e.target.value)}
              maxLength={255}
            />
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Notificaciones</h2>
        <div className={styles.notifBody}>
          <div className={styles.formField}>
            <label htmlFor="ajHora">Hora del recordatorio diario</label>
            <input
              id="ajHora"
              type="time"
              value={form.horaRecordatorio}
              onChange={(e) => set('horaRecordatorio', e.target.value)}
              className={styles.timeInput}
            />
            <p className={styles.fieldHint}>
              Cada mañana a esta hora, el sistema enviará a la campana 🔔 un resumen de las citas del día. Hora de República Dominicana.
            </p>
          </div>
          <div className={styles.formField}>
            <label htmlFor="ajMinutosAviso">Aviso antes de cada cita</label>
            <input
              id="ajMinutosAviso"
              type="number"
              min={5}
              max={120}
              value={form.minutosAvisoCita}
              onChange={(e) => set('minutosAvisoCita', Number(e.target.value))}
              className={styles.timeInput}
            />
            <p className={styles.fieldHint}>
              Minutos antes de cada cita en que se enviará el aviso a la campana 🔔.
            </p>
          </div>
        </div>
      </div>

      {esOwner && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Impuestos</h2>
          <div className={styles.toggleSection}>
            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <span className={styles.toggleLabel}>
                  ¿Tu negocio está registrado como contribuyente ante la DGII (tienes RNC y comprobantes fiscales)?
                </span>
                <span className={styles.toggleHint}>
                  Si respondes "Sí", las nuevas ventas cobrarán {form.itbisPct}% de ITBIS. Si respondes "No",
                  las nuevas ventas no cobrarán ITBIS (0%). Esto no afecta ventas ya realizadas — solo aplica
                  desde el momento en que lo cambies. Si tienes dudas, consulta a tu contador.
                </span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={form.itbisPct > 0}
                  onChange={(e) => set('itbisPct', e.target.checked ? 18 : 0)}
                />
                <span className={styles.toggleTrack} />
              </label>
            </div>
          </div>
        </div>
      )}

      {esOwner && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Métodos de Pago</h2>
          <p className={styles.fieldHint} style={{ marginBottom: 12 }}>
            Los métodos activos son los que aparecen para elegir al cobrar en el POS. Activa los que
            uses en tu negocio — "Efectivo" ya viene activado.
          </p>

          {metodosPago.length > 0 && (
            <div className={styles.dispositivosList} style={{ marginBottom: 14 }}>
              {[...metodosPago].sort((a, b) => a.orden - b.orden).map((m, i, arr) => (
                <div key={m.id} className={styles.dispositivoRow}>
                  <div className={styles.metodoOrdenBtns}>
                    <button
                      type="button"
                      className={styles.metodoOrdenBtn}
                      disabled={i === 0 || patchMetodo.isPending}
                      onClick={() => moverMetodo(m, -1)}
                      title="Subir"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className={styles.metodoOrdenBtn}
                      disabled={i === arr.length - 1 || patchMetodo.isPending}
                      onClick={() => moverMetodo(m, 1)}
                      title="Bajar"
                    >
                      ▼
                    </button>
                  </div>
                  <div className={styles.dispositivoNombre} style={{ flex: 1 }}>
                    {m.nombre}
                    {m.esEfectivo && <span className={styles.dispositivoTag}>efectivo</span>}
                    {!m.activo && <span className={styles.fieldHint}>· inactivo</span>}
                  </div>
                  <label className={styles.toggleSwitch}>
                    <input
                      type="checkbox"
                      checked={m.activo}
                      disabled={patchMetodo.isPending}
                      onChange={() => toggleActivo(m)}
                    />
                    <span className={styles.toggleTrack} />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {esOwner && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Seguridad</h2>
          <div className={styles.toggleSection}>
            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <span className={styles.toggleLabel}>Requerir PIN para anular ventas</span>
                <span className={styles.toggleHint}>
                  Si está activo, además del motivo se pedirá este PIN de la empresa para anular cualquier venta (Punto de venta y Agenda).
                </span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={form.pinAnulacionActivo}
                  onChange={(e) => set('pinAnulacionActivo', e.target.checked)}
                />
                <span className={styles.toggleTrack} />
              </label>
            </div>
            <div className={styles.pinRow}>
              <div className={styles.formField}>
                <label htmlFor="ajPin">{empresa.pinAnulacionConfigurado ? 'Cambiar PIN' : 'Definir PIN'}</label>
                <input
                  id="ajPin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="••••"
                  value={pinNuevo}
                  onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                />
              </div>
              {empresa.pinAnulacionConfigurado && !pinNuevo && (
                <span className={styles.pinEstado}>✓ Ya hay un PIN configurado</span>
              )}
            </div>
            {pinInvalido && (
              <p className={styles.fieldHint} style={{ color: 'var(--err)', marginTop: 6 }}>
                El PIN debe ser numérico, de 4 a 8 dígitos.
              </p>
            )}
            <p className={styles.fieldHint} style={{ marginTop: 8 }}>
              Deja el campo de PIN vacío para no cambiarlo. No hay forma de recuperarlo si se olvida — solo puedes definir uno nuevo aquí.
            </p>
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnSave}
          disabled={guardar.isPending || pinInvalido}
          onClick={() => guardar.mutate()}
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
