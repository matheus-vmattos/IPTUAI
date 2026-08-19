import axios from 'axios';

const BACKEND_URL_KEY = 'iptuai:backendUrl';
const TOKEN_KEY = 'iptuai:token';

export function getBackendUrl() {
  return localStorage.getItem(BACKEND_URL_KEY) || 'http://localhost:4000';
}

export function setBackendUrl(url) {
  localStorage.setItem(BACKEND_URL_KEY, url.replace(/\/+$/, ''));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getBackendUrl();
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiErrorMessage(err) {
  return err?.response?.data?.error || err.message || 'Erro inesperado';
}
