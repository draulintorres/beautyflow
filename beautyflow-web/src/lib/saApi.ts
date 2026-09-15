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

saApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useSAAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
