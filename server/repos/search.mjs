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

function normalizeDocumentIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))];
}

export async function hybridSearch(projectId, userId, query, queryEmbedding, limit = 6, { documentIds } = {}) {
  const db = await getDatabase();
  const take = Math.max(1, Math.min(Number(limit) || 6, 50));
  const candidates = new Map();
  const filterIds = normalizeDocumentIds(documentIds);
  const documentFilter = filterIds.length ? " AND c.document_id = ANY($5::text[])" : "";
  const vectorParams = filterIds.length
    ? [projectId, userId, vectorLiteral(queryEmbedding), take * 3, filterIds]
    : [projectId, userId, vectorLiteral(queryEmbedding), take * 3];
  const vectorResult = await db.query(
    `SELECT c.id, c.document_id, c.page_number, c.page_end, c.content, c.search_tokens,
            c.parent_id, c.parent_content, c.heading_path, c.metadata, c.chapter_id,
            ch.title AS chapter_title,
            1 - (c.embedding <=> $3::vector) AS vector_score
       FROM document_chunks c
       LEFT JOIN chapters ch ON ch.id = c.chapter_id
      WHERE c.project_id = $1 AND c.user_id = $2 AND c.embedding IS NOT NULL${documentFilter}
      ORDER BY c.embedding <=> $3::vector
      LIMIT $4`,
    vectorParams
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
    const keywordFilter = filterIds.length ? " AND c.document_id = ANY($5::text[])" : "";
    const keywordParams = filterIds.length
      ? [projectId, userId, tsQuery, take * 3, filterIds]
      : [projectId, userId, tsQuery, take * 3];
    const keywordResult = await db.query(
      `SELECT c.id, c.document_id, c.page_number, c.page_end, c.content, c.search_tokens,
              c.parent_id, c.parent_content, c.heading_path, c.metadata, c.chapter_id,
              ch.title AS chapter_title,
              ts_rank_cd(to_tsvector('simple', c.search_tokens), to_tsquery('simple', $3)) AS keyword_score
         FROM document_chunks c
         LEFT JOIN chapters ch ON ch.id = c.chapter_id
        WHERE c.project_id = $1
          AND c.user_id = $2
          AND to_tsvector('simple', c.search_tokens) @@ to_tsquery('simple', $3)${keywordFilter}
        ORDER BY keyword_score DESC
        LIMIT $4`,
      keywordParams
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
      chapterId: item.chapter_id || null,
      chapterTitle: item.chapter_title || null,
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
