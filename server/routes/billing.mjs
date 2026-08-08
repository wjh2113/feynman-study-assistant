import { Router } from "express";
import { randomUUID } from "node:crypto";
import { createPaymentAdapter, newOrder, plans } from "../payments.mjs";
import {
  createSubscription,
  getOrder,
  listSubscriptions,
  markOrderPaid,
  saveOrder
} from "../storage.mjs";

const router = Router();

router.get("/api/billing/plans", (_req, res) => res.json({ plans: Object.values(plans) }));
router.get("/api/billing/subscriptions", async (req, res) => res.json({ subscriptions: await listSubscriptions(req.userId) }));
router.post("/api/billing/orders", async (req, res) => {
  try {
    const order = newOrder(req.userId, req.body?.planId, req.body?.provider || "sandbox");
    const payment = await createPaymentAdapter(order.provider).create(order);
    order.externalId = payment.externalId;
    order.metadata = { payUrl: payment.payUrl, pendingIntegration: payment.pendingIntegration || false };
    await saveOrder(order);
    res.status(201).json({ order, payment });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
router.post("/api/payments/sandbox/:orderId/complete", async (req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.PAYMENT_SANDBOX !== "true") return res.status(404).json({ error: "沙箱支付未启用" });
  const owned = await getOrder(req.params.orderId, req.userId);
  if (!owned) return res.status(404).json({ error: "订单不存在" });
  const order = await markOrderPaid(owned.id);
  if (!order) return res.status(409).json({ error: "订单状态不可更新" });
  const plan = plans[order.plan_id];
  await createSubscription({ id: randomUUID(), userId: req.userId, orderId: order.id, planId: order.plan_id, endsAt: new Date(Date.now() + plan.durationDays * 86_400_000).toISOString() });
  res.json({ ok: true, orderId: order.id });
});

export default router;
