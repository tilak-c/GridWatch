import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { login as apiLogin } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

interface User {
  id: number;
  username: string;
  role: 'operator' | 'supervisor';
  email: string;
  zones: { zone_id: number; zone_name: string }[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('gridwatch_token');
    const savedUser = localStorage.getItem('gridwatch_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      connectSocket(savedToken);
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('gridwatch_token', newToken);
    localStorage.setItem('gridwatch_user', JSON.stringify(newUser));
    connectSocket(newToken);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('gridwatch_token');
    localStorage.removeItem('gridwatch_user');
    disconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
