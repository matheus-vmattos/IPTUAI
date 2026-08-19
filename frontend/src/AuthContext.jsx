import { createContext, useContext, useState, useCallback } from 'react';
import { api, getToken, setToken, apiErrorMessage } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const restore = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setToken(null);
    } finally {
      setReady(true);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setToken(data.token);
      setUser(data.user);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: apiErrorMessage(err) };
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, restore, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
