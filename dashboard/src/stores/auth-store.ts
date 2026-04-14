import { create } from 'zustand';

export interface AuthUser {
  user_id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'member' | 'guest';
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  theme: string;
  setAuth: (user: AuthUser, token: string) => void;
  logout: () => void;
  setTheme: (theme: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  theme: localStorage.getItem('theme') || 'midnight',

  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },

  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
}));
