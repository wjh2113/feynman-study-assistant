import { Router } from "express";
import {
  createPasswordReset,
  getSessionUser,
  loginUser,
  logoutUser,
  registerUser,
  resetPassword
} from "../auth.mjs";
import { sendMail } from "../mailer.mjs";
import { getUserById } from "../storage.mjs";
import { cookieName, cookieOptions, rateLimit } from "../middleware/security.mjs";

const router = Router();

router.post("/api/auth/register", rateLimit({ windowMs: 15 * 60_000, max: 10, keyPrefix: "register" }), async (req, res) => {
  try {
    const { username, password, email } = req.body || {};
    const result = await registerUser(username, password, email);
    res.cookie(cookieName, result.token, cookieOptions);
    res.json({ id: result.id, username: result.username });
  } catch (error) {
    res.status(400).json({ error: error.message || "注册失败" });
  }
});

router.post("/api/auth/forgot-password", rateLimit({ windowMs: 15 * 60_000, max: 5, keyPrefix: "forgot" }), async (req, res) => {
  try {
    const reset = await createPasswordReset(req.body?.email);
    if (reset) {
      const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
      await sendMail({ to: reset.user.email, subject: "知练密码重置", text: `请在 30 分钟内打开：${baseUrl}/reset-password?token=${reset.token}` });
    }
    res.json({ ok: true, message: "如果邮箱存在，重置邮件已经发送", ...(process.env.NODE_ENV !== "production" && reset ? { developmentToken: reset.token } : {}) });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post("/api/auth/reset-password", rateLimit({ windowMs: 15 * 60_000, max: 10, keyPrefix: "reset" }), async (req, res) => {
  try { await resetPassword(req.body?.token, req.body?.password); res.json({ ok: true }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.post("/api/auth/login", rateLimit({ windowMs: 15 * 60_000, max: 20, keyPrefix: "login" }), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = await loginUser(username, password);
    res.cookie(cookieName, result.token, cookieOptions);
    res.json({ id: result.id, username: result.username });
  } catch (error) {
    res.status(401).json({ error: error.message || "登录失败" });
  }
});

router.post("/api/auth/logout", async (req, res) => {
  await logoutUser(req.cookies?.[cookieName]);
  res.clearCookie(cookieName, cookieOptions);
  res.json({ ok: true });
});

router.get("/api/auth/me", async (req, res) => {
  const token = req.cookies?.[cookieName];
  const user = token ? await getSessionUser(token) : null;
  if (!user) return res.json({ user: null });
  const detail = await getUserById(user.id);
  res.json({ user: detail ? { id: detail.id, username: detail.username } : null });
});

export default router;
