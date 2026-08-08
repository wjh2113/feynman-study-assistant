import { apiFetch } from "./client.js";

export function getMe() {
  return apiFetch("/api/auth/me");
}

export function login(username, password) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

export function register(username, password) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

export function logout() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}
