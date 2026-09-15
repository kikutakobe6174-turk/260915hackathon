"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { login as loginRequest } from "@/lib/api/auth";
import type { LoginResponseUser } from "@/lib/types/models";

interface AuthContextValue {
  user: LoginResponseUser | null;
  loading: boolean;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ログイン情報はメモリ上のReact Contextのみで保持する。
// localStorage等には保存しない（リロードで再ログインが必要になる仕様）。
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoginResponseUser | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (loginId: string, password: string) => {
    setLoading(true);
    try {
      const res = await loginRequest({ login_id: loginId, password });
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
