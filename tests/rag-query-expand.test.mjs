import test from "node:test";
import assert from "node:assert/strict";
import {
  composeRetrievalQuery,
  parseQueryExpansionPayload
} from "../server/services/rag-query-expand.mjs";

test("parseQueryExpansionPayload merges AI keywords into retrieval query", () => {
  const parsed = parseQueryExpansionPayload(
    {
      intent: "查找五十音图的记忆方法",
      keywords: ["五十音", "平假名", "假名表", "快速记忆"],
      synonyms: ["五十音图"],
      searchText: "五十音图 快速记忆 方法"
    },
    "怎么快速记住50音图"
  );
  assert.equal(parsed.source, "llm");
  assert.ok(parsed.keywords.includes("五十音"));
  assert.match(parsed.retrievalQuery, /五十音/);
  assert.match(parsed.retrievalQuery, /50音|五十音/);
});

test("composeRetrievalQuery keeps rule-based normalization without expansion", () => {
  const query = composeRetrievalQuery("怎么快速记住50音图", null);
  assert.match(query, /五十音/);
});

test("composeRetrievalQuery dedupes repeated expansion terms", () => {
  const query = composeRetrievalQuery("五十音", {
    searchText: "五十音 记忆",
    keywords: ["五十音", "平假名", "记忆"],
    synonyms: ["五十音"]
  });
  assert.match(query, /平假名/);
  assert.match(query, /记忆/);
});
