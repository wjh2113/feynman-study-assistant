import { useEffect, useState } from "react";
import * as authApi from "../../api/auth.js";
import { resolveApiUrl } from "../../lib/runtime.js";
import { cacheAuthUser, clearCachedAuthUser, loadCachedAuthUser } from "../../lib/offline-store.js";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    try {
      // Keep soft parsing: unauthenticated /me may be non-OK with { user: null }.
      const response = await fetch(resolveApiUrl("/api/auth/me"), { credentials: "include" });
      const data = await response.json();
      setUser(data.user);
      if (data.user) await cacheAuthUser(data.user);
      else await clearCachedAuthUser();
    } catch {
      const cached = await loadCachedAuthUser().catch(() => null);
      setUser(cached);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    check();
  }, []);

  const login = async (username, password) => {
    const data = await authApi.login(username, password);
    setUser(data);
    await cacheAuthUser(data);
    return data;
  };

  const register = async (username, password) => {
    const data = await authApi.register(username, password);
    setUser(data);
    await cacheAuthUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // allow local logout when offline
    }
    await clearCachedAuthUser();
    setUser(null);
  };

  return { user, loading, login, register, logout, refresh: check };
}
