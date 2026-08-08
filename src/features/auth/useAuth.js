import { useEffect, useState } from "react";
import * as authApi from "../../api/auth.js";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    try {
      // Keep soft parsing: unauthenticated /me may be non-OK with { user: null }.
      const response = await fetch("/api/auth/me", { credentials: "same-origin" });
      const data = await response.json();
      setUser(data.user);
    } catch {
      setUser(null);
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
    return data;
  };

  const register = async (username, password) => {
    const data = await authApi.register(username, password);
    setUser(data);
    return data;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return { user, loading, login, register, logout, refresh: check };
}
