import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface NotificacionInterna {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  referenciaTipo: string | null;
  referenciaId: string | null;
  leidaAt: string | null;
  createdAt: string;
}

const CONTADOR_KEY = ['notificaciones-internas', 'contador'];
const LISTA_KEY = ['notificaciones-internas', 'lista'];

export function useNotificacionesContador() {
  return useQuery<{ noLeidas: number }>({
    queryKey: CONTADOR_KEY,
    queryFn: () => api.get('/notificaciones-internas/contador').then((r) => r.data),
    refetchInterval: 60_000,
  });
}

export function useNotificacionesLista(enabled: boolean) {
  return useQuery<NotificacionInterna[]>({
    queryKey: LISTA_KEY,
    queryFn: () => api.get('/notificaciones-internas').then((r) => r.data),
    enabled,
  });
}

export function useMarcarLeida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notificaciones-internas/${id}/leer`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTADOR_KEY });
      qc.invalidateQueries({ queryKey: LISTA_KEY });
    },
  });
}

export function useMarcarTodasLeidas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch('/notificaciones-internas/leer-todas'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTADOR_KEY });
      qc.invalidateQueries({ queryKey: LISTA_KEY });
    },
  });
}

export function tiempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}
