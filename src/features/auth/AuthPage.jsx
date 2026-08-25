import React, { useState } from "react";
import { Spinner } from "../../components/Spinner.jsx";
import { Check, CircleAlert, Lock, User } from "../../components/icons.jsx";

export function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await onLogin.login(username, password);
      } else {
        await onLogin.register(username, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><span>知</span></div>
          <div>
            <strong>知练</strong>
            <small>费曼型学习助手</small>
          </div>
        </div>
        <h1>{mode === "login" ? "登录" : "注册账号"}</h1>
        <p>{mode === "login" ? "使用你的账号继续学习" : "创建一个新账号开始使用"}</p>
        <form onSubmit={submit}>
          {error && <div className="auth-error"><CircleAlert size={15} />{error}</div>}
          <label>
            <span>用户名</span>
            <div className="auth-input-wrap">
              <input
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="2-32 字符"
                disabled={busy}
              />
              <User size={16} />
            </div>
          </label>
          <label>
            <span>密码</span>
            <div className="auth-input-wrap">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "login" ? "" : "至少 6 位"}
                disabled={busy}
              />
              <Lock size={16} />
            </div>
          </label>
          <button className="primary-btn full" type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? <Spinner /> : <Check size={16} />}
            {mode === "login" ? "登录" : "注册"}
          </button>
        </form>
        <div className="auth-toggle">
          {mode === "login" ? (
            <>
              还没有账号？
              <button className="text-btn" onClick={() => { setMode("register"); setError(""); }}>立即注册</button>
            </>
          ) : (
            <>
              已有账号？
              <button className="text-btn" onClick={() => { setMode("login"); setError(""); }}>直接登录</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
