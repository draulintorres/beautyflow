import axios from 'axios';
import { useSAAuthStore } from '../store/saAuth';

export const saApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

saApi.interceptors.request.use((config) => {
  const token = useSAAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Estas rutas devuelven 401 por una CONTRASEÑA/CÓDIGO incorrecto durante el
// login en dos pasos, no por una sesión vencida -- un 401 ahí nunca debe
// desloguear (SALoginPage.tsx ya tiene su propio manejo de error para
// quedarse en el paso actual o volver al paso 1).
const RUTAS_LOGIN_SA = [
  '/admin/login',
  '/admin/login/totp/iniciar-alta',
  '/admin/login/totp/confirmar-alta',
  '/admin/login/verificar-totp',
];

saApi.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error.config?.url ?? '';
    const esRutaDeLoginSA = RUTAS_LOGIN_SA.includes(url);
    if (error.response?.status === 401 && !esRutaDeLoginSA) {
      useSAAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
