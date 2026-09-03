import axios from 'axios';

// App local: o backend roda embutido, na mesma máquina, sem login nem
// multiusuário. A porta é fixa (ver backend/src/server.js e
// electron/main.js, que sobe esse processo automaticamente).
const BACKEND_URL = 'http://127.0.0.1:4317';

export const api = axios.create({ baseURL: BACKEND_URL });

export function apiErrorMessage(err) {
  return err?.response?.data?.error || err.message || 'Erro inesperado';
}
