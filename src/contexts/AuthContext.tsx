import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_TOKEN = "oc_web_token";
const STORAGE_USER = "oc_web_user";
const STORAGE_REFRESH_TOKEN = "oc_web_refresh_token";
const STORAGE_SESSION_ID = "oc_web_session_id";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  avatarUrl: string | null;
  avatarPositionX: number;
  avatarPositionY: number;
  profileBackgroundUrl: string | null;
  backgroundPositionX: number;
  backgroundPositionY: number;
  bio: string | null;
  location: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  login: (login: string, password: string) => Promise<void>;
  register: (params: {
    username: string;
    email: string;
    password: string;
    bio?: string;
    location?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const clearAuthState = useCallback(() => {
    setToken(null);
    setRefreshToken(null);
    setSessionId(null);
    setUser(null);
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_SESSION_ID);
    localStorage.removeItem(STORAGE_USER);
  }, []);

  const applyAuthState = useCallback((data: {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    user: AuthUser;
  }) => {
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setSessionId(data.sessionId);
    setUser(data.user);
    localStorage.setItem(STORAGE_TOKEN, data.accessToken);
    localStorage.setItem(STORAGE_REFRESH_TOKEN, data.refreshToken);
    localStorage.setItem(STORAGE_SESSION_ID, data.sessionId);
    localStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
  }, []);

  const decodeJwtExp = (jwt: string | null): number | null => {
    if (!jwt) return null;
    try {
      const parts = jwt.split(".");
      if (parts.length < 2) return null;
      const seg = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = seg.length % 4 === 0 ? "" : "=".repeat(4 - (seg.length % 4));
      const payload = JSON.parse(atob(seg + pad));
      return typeof payload.exp === "number" ? payload.exp : null;
    } catch {
      return null;
    }
  };

  const isTokenExpiringSoon = (jwt: string | null, withinSeconds: number) => {
    const exp = decodeJwtExp(jwt);
    if (!exp) return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return exp - nowSec <= withinSeconds;
  };

  const refreshSession = useCallback(async () => {
    const currentRefreshToken = localStorage.getItem(STORAGE_REFRESH_TOKEN);
    if (!currentRefreshToken) {
      clearAuthState();
      throw new Error("refresh token 不存在");
    }
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
    if (!res.ok) {
      clearAuthState();
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "会话刷新失败");
    }
    const data = await res.json();
    applyAuthState({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      sessionId: data.sessionId,
      user: data.user,
    });
  }, [applyAuthState, clearAuthState]);

  useEffect(() => {
    const bootstrap = async () => {
      const t = localStorage.getItem(STORAGE_TOKEN);
      const u = localStorage.getItem(STORAGE_USER);
      const r = localStorage.getItem(STORAGE_REFRESH_TOKEN);
      const sid = localStorage.getItem(STORAGE_SESSION_ID);
      // 兼容旧登录态（历史版本可能没有 sessionId）：只要 user + refreshToken 还在，就优先尝试 refresh 拉新会话。
      if (!u || !r) {
        clearAuthState();
        setIsReady(true);
        return;
      }
      try {
        const parsedUser = JSON.parse(u) as AuthUser;
        setUser(parsedUser);
        setRefreshToken(r);
        if (sid) setSessionId(sid);
        if (sid && t && !isTokenExpiringSoon(t, 60)) {
          setToken(t);
        } else {
          await refreshSession();
        }
      } catch {
        clearAuthState();
      } finally {
        setIsReady(true);
      }
    };
    bootstrap();
  }, [clearAuthState, refreshSession]);

  useEffect(() => {
    if (!refreshToken || !sessionId || !user) return;
    const timer = window.setInterval(() => {
      const currentToken = localStorage.getItem(STORAGE_TOKEN);
      if (isTokenExpiringSoon(currentToken, 10 * 60)) {
        refreshSession().catch(() => {
          // ignore: refreshSession 内部已清理状态
        });
      }
    }, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshSession, refreshToken, sessionId, user]);

  const login = useCallback(async (loginId: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginId, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "登录失败");
    }
    const data = await res.json();
    applyAuthState({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      sessionId: data.sessionId,
      user: data.user,
    });
  }, [applyAuthState]);

  const register = useCallback(
    async (params: { username: string; email: string; password: string; bio?: string; location?: string }) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "注册失败");
      }
      const data = await res.json();
      applyAuthState({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        sessionId: data.sessionId,
        user: data.user,
      });
    },
    [applyAuthState],
  );

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem(STORAGE_TOKEN);
    const currentSessionId = localStorage.getItem(STORAGE_SESSION_ID);
    const currentRefreshToken = localStorage.getItem(STORAGE_REFRESH_TOKEN);

    if (currentToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          refreshToken: currentRefreshToken,
        }),
      }).catch(() => {
        // ignore
      });
    }

    clearAuthState();
  }, [clearAuthState]);

  const updateUser = useCallback((next: AuthUser) => {
    setUser(next);
    localStorage.setItem(STORAGE_USER, JSON.stringify(next));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        refreshToken,
        sessionId,
        login,
        register,
        logout,
        refreshSession,
        updateUser,
        isReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
