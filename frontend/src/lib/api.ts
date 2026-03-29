import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gridwatch_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password });

// Sensors
export const getSensors = () => api.get('/sensors');
export const getSensorDetail = (id: number) => api.get(`/sensors/${id}`);
export const getSensorHistory = (id: number, from: string, to: string, page = 1, limit = 100) =>
  api.get(`/sensors/${id}/history`, { params: { from, to, page, limit } });

// Alerts
export const getAlerts = (params: Record<string, any> = {}) =>
  api.get('/alerts', { params });
export const transitionAlert = (id: number, action: 'acknowledge' | 'resolve') =>
  api.patch(`/alerts/${id}/transition`, { action });
export const getAlertAudit = (id: number) =>
  api.get(`/alerts/${id}/audit`);

// Suppressions
export const createSuppression = (data: {
  sensor_id: number; start_time: string; end_time: string; reason?: string;
}) => api.post('/suppressions', data);
export const getSuppressions = (sensorId: number, active = false) =>
  api.get('/suppressions', { params: { sensor_id: sensorId, active } });

// Ingest (for testing)
export const ingestReadings = (readings: any[]) =>
  api.post('/ingest', { readings });

export default api;
