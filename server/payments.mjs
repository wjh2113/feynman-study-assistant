import { createHash, createHmac, randomUUID } from "node:crypto";

export const plans = {
  pro_monthly: { id: "pro_monthly", name: "个人 Pro 月付", amountFen: 3900, durationDays: 31 },
  pro_yearly: { id: "pro_yearly", name: "个人 Pro 年付", amountFen: 29900, durationDays: 366 },
  sprint_7d: { id: "sprint_7d", name: "7 天冲刺包", amountFen: 4900, durationDays: 7 }
};

function signSandbox(payload) {
  return createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET || "sandbox-secret").update(payload).digest("hex");
}

export function createPaymentAdapter(provider = "sandbox") {
  if (provider === "sandbox") {
    return {
      async create(order) {
        return { provider, externalId: `sandbox-${randomUUID()}`, payUrl: `/api/payments/sandbox/${order.id}/complete` };
      },
      verify(rawBody, signature) { return signSandbox(rawBody) === signature; }
    };
  }
  if (provider === "wechat") {
    return {
      async create(order) {
        if (!process.env.WECHATPAY_MCH_ID || !process.env.WECHATPAY_PRIVATE_KEY) throw new Error("微信支付商户配置不完整");
        return { provider, externalId: order.id, pendingIntegration: true };
      },
      verify(rawBody, signature) { return Boolean(signature && process.env.WECHATPAY_PLATFORM_CERT); }
    };
  }
  if (provider === "alipay") {
    return {
      async create(order) {
        if (!process.env.ALIPAY_APP_ID || !process.env.ALIPAY_PRIVATE_KEY) throw new Error("支付宝商户配置不完整");
        return { provider, externalId: order.id, pendingIntegration: true };
      },
      verify(rawBody, signature) { return Boolean(signature && process.env.ALIPAY_PUBLIC_KEY); }
    };
  }
  throw new Error("不支持的支付渠道");
}

export function newOrder(userId, planId, provider = "sandbox") {
  const plan = plans[planId];
  if (!plan) throw new Error("套餐不存在");
  return { id: randomUUID(), userId, planId, provider, amountFen: plan.amountFen, currency: "CNY", status: "pending", createdAt: Date.now() };
}

export function idempotencyKey(order) {
  return createHash("sha256").update(`${order.userId}:${order.planId}:${order.id}`).digest("hex");
}
