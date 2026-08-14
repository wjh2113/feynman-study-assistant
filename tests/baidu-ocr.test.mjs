import assert from "node:assert/strict";
import { test } from "node:test";
import { getBaiduAccessToken, recognizeWithBaidu } from "../server/baidu-ocr.mjs";

test("百度 OCR：缺少密钥时获取 token 会失败", async () => {
  await assert.rejects(
    () => getBaiduAccessToken("", ""),
    /access_token|失败|API/
  );
});

test("百度 OCR：recognizeWithBaidu 在无有效密钥时抛错", async () => {
  await assert.rejects(
    () => recognizeWithBaidu({
      buffer: Buffer.from("not-an-image"),
      apiKey: "fake",
      secretKey: "fake",
      languageType: "JAP",
      timeoutMs: 5000
    }),
    /百度/
  );
});
