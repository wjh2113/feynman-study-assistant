# Database migrations

Schema changes are applied automatically when the API starts (`server/db/schema.mjs` → `schema_migrations`).

SQL files in this folder are **mirrors** for review, ops, and fresh Postgres bootstrap. Prefer letting the app migrate on boot.

| Version | File | Notes |
|---------|------|--------|
| `001_commercial_foundation` | (inline in `schema.mjs`) | Core tables + commercial foundation |
| `002_chapters` | `002_chapters.sql` | Chapters table + `chapter_id` columns (compat) |
| `003_document_practice` | `003_document_practice.sql` | `coach_sessions.document_ids`; practice state restored onto projects |

## Document practice model

- **Subject (project):** sources, knowledge map, RAG over all documents
- **Practice:** select one or more documents → Feynman / blindspots / one-pager scoped by `document_ids`
- Chapters remain in DB/API for backward compatibility but are no longer the primary UX
