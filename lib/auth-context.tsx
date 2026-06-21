"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  getCurrentUser,
  login as doLogin,
  logout as doLogout,
} from "./auth";
import type { Role, UserProfile } from "./types";

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  signIn: (username: string, pin: string) => Promise<UserProfile>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * แหล่งความจริงเดียวของสถานะผู้ใช้ทั้งแอป (current user, store_id, role)
 * วางครอบที่ root layout -> ทั้ง /login และ /(dashboard) ใช้ร่วมกันได้
 *
 * TODO (backend จริง): ใน useEffect แรกให้แทน getCurrentUser() ด้วย
 *   supabase.auth.getSession() แล้วดึง profile (store_id, role_id) จากตาราง users
 *   และ subscribe supabase.auth.onAuthStateChange เพื่อ sync session
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getCurrentUser());
    setLoading(false);
  }, []);

  const signIn = useCallback(async (username: string, pin: string) => {
    const profile = await doLogin(username, pin);
    setUser(profile);
    return profile;
  }, []);

  const signOut = useCallback(() => {
    doLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth ต้องใช้ภายใน <AuthProvider>");
  }
  return ctx;
}

export function isOwner(user: UserProfile | null): boolean {
  return user?.role === "owner";
}

export function hasRole(user: UserProfile | null, role: Role): boolean {
  return user?.role === role;
}

/** หน้าเริ่มต้นหลังเข้าระบบ: เจ้าของ -> แดชบอร์ด, พนักงาน -> หน้าขาย */
export function defaultRouteFor(user: UserProfile | null): string {
  return user?.role === "owner" ? "/dashboard" : "/pos";
}
