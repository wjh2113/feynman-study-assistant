import { Router } from "express";
import { getUserById, deleteUser } from "../storage.mjs";
import { cookieName, cookieOptions } from "../middleware/security.mjs";

const router = Router();

router.delete("/api/account", async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user || req.body?.confirmation !== user.username) return res.status(400).json({ error: "请输入用户名确认删除账号" });
    await deleteUser(req.userId);
    res.clearCookie(cookieName, cookieOptions);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

export default router;
