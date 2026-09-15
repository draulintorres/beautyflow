// "Recordar mi correo": guarda SOLO empresa + correo (nunca la contraseña)
// para prellenar el formulario de login la próxima vez — independiente del
// store de auth (sobrevive incluso un logout, que sí borra la sesión).
const KEY = 'bf-login-recordado';

interface LoginRecordado {
  empresaSlug: string;
  email: string;
}

export function leerLoginRecordado(): LoginRecordado | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function guardarLoginRecordado(empresaSlug: string, email: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ empresaSlug, email }));
  } catch {
    /* noop */
  }
}

export function olvidarLoginRecordado() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
