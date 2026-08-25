import assert from "node:assert/strict";
import { test } from "node:test";
import { coachSessionToSummary, formatSessionStatus } from "../src/lib/coachSessions.js";
import { gatewayConfig, getGatewayPublicStatus, isGatewayEnabled } from "../server/gateway-client.mjs";

test("isGatewayEnabled requires url and api key", () => {
  const prevUrl = process.env.LLM_GATEWAY_URL;
  const prevKey = process.env.LLM_GATEWAY_API_KEY;
  delete process.env.LLM_GATEWAY_URL;
  delete process.env.LLM_GATEWAY_API_KEY;
  assert.equal(isGatewayEnabled(), false);

  process.env.LLM_GATEWAY_URL = "http://127.0.0.1:8001";
  process.env.LLM_GATEWAY_API_KEY = "demo";
  assert.equal(isGatewayEnabled(), true);
  assert.equal(gatewayConfig().baseUrl, "http://127.0.0.1:8001");

  if (prevUrl === undefined) delete process.env.LLM_GATEWAY_URL;
  else process.env.LLM_GATEWAY_URL = prevUrl;
  if (prevKey === undefined) delete process.env.LLM_GATEWAY_API_KEY;
  else process.env.LLM_GATEWAY_API_KEY = prevKey;
});

test("getGatewayPublicStatus omits secrets", () => {
  const prevUrl = process.env.LLM_GATEWAY_URL;
  const prevKey = process.env.LLM_GATEWAY_API_KEY;
  const prevTenant = process.env.LLM_GATEWAY_TENANT_ID;
  delete process.env.LLM_GATEWAY_URL;
  delete process.env.LLM_GATEWAY_API_KEY;
  assert.deepEqual(getGatewayPublicStatus(), { enabled: false });

  process.env.LLM_GATEWAY_URL = "http://127.0.0.1:8001";
  process.env.LLM_GATEWAY_API_KEY = "demo";
  process.env.LLM_GATEWAY_TENANT_ID = "tenant_demo";
  const status = getGatewayPublicStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.baseUrl, "http://127.0.0.1:8001");
  assert.equal(status.tenantId, "tenant_demo");
  assert.equal("apiKey" in status, false);

  if (prevUrl === undefined) delete process.env.LLM_GATEWAY_URL;
  else process.env.LLM_GATEWAY_URL = prevUrl;
  if (prevKey === undefined) delete process.env.LLM_GATEWAY_API_KEY;
  else process.env.LLM_GATEWAY_API_KEY = prevKey;
  if (prevTenant === undefined) delete process.env.LLM_GATEWAY_TENANT_ID;
  else process.env.LLM_GATEWAY_TENANT_ID = prevTenant;
});

test("coachSessionToSummary maps API session to overview row", () => {
  const summary = coachSessionToSummary({
    id: "s1",
    concept: "用户旅程地图",
    question: "什么是用户旅程地图？",
    score: 82,
    status: "passed",
    updatedAt: Date.now() - 120_000,
    documentIds: ["doc-1"],
    meta: { isVariant: true }
  });
  assert.equal(summary.concept, "用户旅程地图");
  assert.equal(summary.score, 82);
  assert.equal(summary.status, "通过");
  assert.equal(summary.isRetest, true);
  assert.deepEqual(summary.documentIds, ["doc-1"]);
});

test("formatSessionStatus normalizes legacy values", () => {
  assert.equal(formatSessionStatus("needs_review"), "需补漏");
  assert.equal(formatSessionStatus("passed"), "通过");
});
