import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  createUser,
  createUserSession,
  consumePasswordResetToken,
  deleteUserSession,
  getUserByEmail,
  getUserByUsername,
  getUserIdBySession,
  savePasswordResetToken,
  updateUserPassword
} from "./storage.mjs";

const scryptAsync = promisify(scrypt);

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve({ hash: derivedKey.toString("hex"), salt });
    });
  });
}

export async function verifyPassword(password, hash, salt) {
  const derivedKey = await scryptAsync(password, salt, 64);
  const derivedHash = derivedKey.toString("hex");
  if (hash.length !== derivedHash.length) return false;
  return timingSafeEqual(Buffer.from(hash), Buffer.from(derivedHash));
}

export function generateToken() {
  return randomBytes(32).toString("hex");
}

export async function registerUser(username, password, email = null) {
  if (!username?.trim() || !password?.trim()) {
    throw new Error("用户名和密码不能为空");
  }
  if (username.trim().length < 2 || username.trim().length > 32) {
    throw new Error("用户名长度需要在 2 到 32 个字符之间");
  }
  if (password.length < 6) {
    throw new Error("密码至少需要 6 位");
  }
  const existing = await getUserByUsername(username.trim());
  if (existing) throw new Error("用户名已存在");
  const { hash, salt } = await hashPassword(password);
  const { id } = await createUser({
    id: randomUUID(),
    username: username.trim(),
    email: email ? String(email).trim().toLowerCase() : null,
    passwordHash: hash,
    salt
  });
  const token = generateToken();
  await createUserSession(token, id);
  return { id, username: username.trim(), token };
}

export async function createPasswordReset(email) {
  const user = await getUserByEmail(String(email || "").trim());
  if (!user) return null;
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await savePasswordResetToken(tokenHash, user.id, new Date(Date.now() + 30 * 60_000).toISOString());
  return { token, user };
}

export async function resetPassword(token, newPassword) {
  if (String(newPassword || "").length < 8) throw new Error("新密码至少需要 8 位");
  const tokenHash = createHash("sha256").update(String(token || "")).digest("hex");
  const userId = await consumePasswordResetToken(tokenHash);
  if (!userId) throw new Error("重置链接无效或已过期");
  const { hash, salt } = await hashPassword(newPassword);
  await updateUserPassword(userId, hash, salt);
  return true;
}

export async function loginUser(username, password) {
  const user = await getUserByUsername(username.trim());
  if (!user) throw new Error("用户名或密码错误");
  const valid = await verifyPassword(password, user.password_hash, user.salt);
  if (!valid) throw new Error("用户名或密码错误");
  const token = generateToken();
  await createUserSession(token, user.id);
  return { id: user.id, username: user.username, token };
}

export async function logoutUser(token) {
  if (!token) return;
  await deleteUserSession(token);
}

export async function getSessionUser(token) {
  if (!token) return null;
  const userId = await getUserIdBySession(token);
  if (!userId) return null;
  return { id: userId };
}
