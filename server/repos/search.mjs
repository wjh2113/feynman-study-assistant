import { keywordTokens } from "../chunking.mjs";
import { getDatabase } from "../db/client.mjs";

function safeJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function vectorLiteral(vectorValue) {
  return `[${vectorValue.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export async function hybridSearch(projectId, userId, query, queryEmbedding, limit = 6) {
  const db = await getDatabase();
  const take = Math.max(1, Math.min(Number(limit) || 6, 50));
  const candidates = new Map();
  const vectorResult = await db.query(
    `SELECT id, document_id, page_number, page_end, content, search_tokens,
            parent_id, parent_content, heading_path, metadata,
            1 - (embedding <=> $3::vector) AS vector_score
       FROM document_chunks
      WHERE project_id = $1 AND user_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $3::vector
      LIMIT $4`,
    [projectId, userId, vectorLiteral(queryEmbedding), take * 3]
  );

  for (const [rank, row] of vectorResult.rows.entries()) {
    candidates.set(row.id, {
      ...row,
      metadata: safeJson(row.metadata),
      vectorScore: Number(row.vector_score || 0),
      keywordScore: 0,
      rrf: 1 / (60 + rank + 1)
    });
  }

  const tokens = keywordTokens(query).slice(0, 24);
  if (tokens.length) {
    const tsQuery = tokens.map((token) => token.replace(/[':&|!()]/g, "")).filter(Boolean).join(" | ");
    const keywordResult = await db.query(
      `SELECT id, document_id, page_number, page_end, content, search_tokens,
              parent_id, parent_content, heading_path, metadata,
              ts_rank_cd(to_tsvector('simple', search_tokens), to_tsquery('simple', $3)) AS keyword_score
         FROM document_chunks
        WHERE project_id = $1
          AND user_id = $2
          AND to_tsvector('simple', search_tokens) @@ to_tsquery('simple', $3)
        ORDER BY keyword_score DESC
        LIMIT $4`,
      [projectId, userId, tsQuery, take * 3]
    );
    for (const [rank, row] of keywordResult.rows.entries()) {
      const existing = candidates.get(row.id) || {
        ...row,
        metadata: safeJson(row.metadata),
        vectorScore: 0,
        keywordScore: 0,
        rrf: 0
      };
      existing.keywordScore = Number(row.keyword_score || 0);
      existing.rrf += 1 / (60 + rank + 1);
      candidates.set(row.id, existing);
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.rrf - a.rrf || b.vectorScore - a.vectorScore)
    .slice(0, take)
    .map((item) => ({
      id: item.id,
      documentId: item.document_id,
      filename: item.metadata?.filename || "学习资料",
      page: Number(item.page_number || 1),
      pageEnd: Number(item.page_end || item.page_number || 1),
      headingPath: item.heading_path || "",
      parentId: item.parent_id || "",
      parentContent: item.parent_content || "",
      content: item.content,
      vectorScore: Number(item.vectorScore || 0),
      keywordScore: Number(item.keywordScore || 0),
      fusionScore: Number(item.rrf.toFixed(6)),
      matchedKeywords: tokens.filter((token) => String(item.search_tokens || "").split(" ").includes(token)).slice(0, 12)
    }));
}
