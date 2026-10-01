'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserProfile, LoginRequest, RegisterRequest, AuthResponse } from '@talentpulse/shared';
import { api, setAccessToken } from './api';

interface AuthContextType {
  user: UserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateAuth = useCallback((token: string | null, userProfile: UserProfile | null) => {
    setToken(token);
    setUser(userProfile);
    setAccessToken(token);
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const response = await api.post<{ data: AuthResponse }>('/api/auth/refresh');
      if (response?.data?.accessToken && response?.data?.user) {
        updateAuth(response.data.accessToken, response.data.user);
        return response.data.accessToken;
      }
      updateAuth(null, null);
      return null;
    } catch {
      updateAuth(null, null);
      return null;
    }
  }, [updateAuth]);

  useEffect(() => {
    let isMounted = true;
    async function initAuth() {
      try {
        await refresh();
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    initAuth();
    return () => {
      isMounted = false;
    };
  }, [refresh]);

  const login = useCallback(
    async (data: LoginRequest) => {
      const response = await api.post<{ data: AuthResponse }>('/api/auth/login', data);
      if (response?.data?.accessToken && response?.data?.user) {
        updateAuth(response.data.accessToken, response.data.user);
      }
    },
    [updateAuth],
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      const response = await api.post<{ data: AuthResponse }>('/api/auth/register', data);
      if (response?.data?.accessToken && response?.data?.user) {
        updateAuth(response.data.accessToken, response.data.user);
      }
    },
    [updateAuth],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      updateAuth(null, null);
    }
  }, [updateAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user && !!accessToken,
        login,
        register,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,
      login: async () => {},
      register: async () => {},
      logout: async () => {},
      refresh: async () => null,
    };
  }
  return context;
}
