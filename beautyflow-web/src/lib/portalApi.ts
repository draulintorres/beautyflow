import axios from 'axios';
import { usePortalAuth } from '../store/portalAuth';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export const portalApi = axios.create({ baseURL: BASE });

portalApi.interceptors.request.use((config) => {
  const token = usePortalAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      usePortalAuth.getState().logout();
      if (!location.pathname.startsWith('/portal/login')) {
        location.href = '/portal/login';
      }
    }
    return Promise.reject(error);
  }
);
