# 知返 · 费曼学习助手

一个基于个人资料库的费曼学习助手：上传 PDF、DOCX、TXT、Markdown 或图片后，系统会保存原文件、识别截图、生成逐资料总结、提取知识骨架、建立 pgvector 索引，并通过主动解释、追问、补漏和成果输出帮助用户掌握知识。

## 数据架构

- PostgreSQL：保存项目完整状态、资料元数据和学习事件。
- pgvector：保存每个资料分块的向量。
- 本地文件存储：原始资料保存在 `.data/uploads`。
- 混合检索：BGE-M3 + pgvector 与 PostgreSQL 关键词召回通过 RRF 合并，召回20个候选后使用 BGE Reranker 精排到5个。
- DeepSeek V4 Pro：负责知识提炼、费曼追问、RAG 最终回答和一页纸生成。
- 视觉模型：负责 PNG/JPG/WebP、PDF 扫描页及 DOCX 内嵌截图的 OCR。

本地默认使用可落盘的 PGlite。它是嵌入式 PostgreSQL，支持 pgvector，不需要用户额外安装数据库；数据保存在 `.data/postgres`。部署时设置 `DATABASE_URL` 即可切换到标准 PostgreSQL。

## 本地运行

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

访问 `http://127.0.0.1:5173`。后端 API 运行在 `http://127.0.0.1:8787`。

没有配置 `DEEPSEEK_API_KEY` 时，持久化、文件存储、分块、向量索引和混合检索仍会真实运行；生成部分使用演示模式。

## 配置 DeepSeek

推荐直接在网页左侧点击“模型设置”，填写 API 地址、模型名称和 API Key，先测试连接再保存。配置保存在本机 PostgreSQL，页面只读取脱敏状态，保存后无需重启。

也可以继续使用环境变量：

```env
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-v4-pro
```

DeepSeek只用于生成，不用于向量化。

## OCR 视觉模型配置

DeepSeek 文本模型不直接处理图片，因此 OCR 使用一个独立、支持图片输入的 OpenAI 兼容视觉模型。在网页“模型设置”下方填写视觉 API 地址、模型名称和密钥即可，无需重启。

也可使用环境变量：

```env
VISION_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VISION_API_KEY=你的阿里云百炼密钥
VISION_MODEL=qwen3.5-ocr
```

未配置视觉模型时，PDF/DOCX 的普通文本仍会解析；检测到的截图会明确标记为“OCR 待配置”，不会伪装成已经识别。

## BGE-M3 与 Reranker

应用不再使用字符哈希冒充语义向量。默认连接本机模型服务：

```env
EMBEDDING_BASE_URL=http://127.0.0.1:8001/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSIONS=1024
RERANKER_BASE_URL=http://127.0.0.1:8001/v1
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
RAG_RELEVANCE_THRESHOLD=0.35
```

模型服务位于 `model_service/app.py`，提供 OpenAI 兼容的 `/v1/embeddings` 和 `/v1/rerank`。本机依赖安装完成后，Node 后端会自动启动它；模型首次使用时下载到 `.data/models`。模型设置页可直接检查两个模型的服务与加载状态。更换模型或分块规则后，在“学习资料”点击“用 BGE-M3 重建索引”。

资料采用标题、段落和表格感知的语义切片：约500～800字的子块保留章节父块、标题路径和页码范围。问答相关度低于阈值时明确拒答，页面“检索调试”可查看20个候选的向量、关键词、融合、精排分数和完整父子片段。

## 切换到标准 PostgreSQL

服务器需要安装 pgvector 扩展。可以使用仓库提供的 Compose 配置：

```powershell
docker compose up -d postgres
```

然后配置：

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/zhifan
DATABASE_SSL=false
```

应用启动时会自动创建表和索引。

## 持久化目录

```text
.data/
├── postgres/   # 本地嵌入式 PostgreSQL 数据
└── uploads/    # 上传的原始资料
```

备份整个 `.data` 目录即可备份本地资料库。使用标准 PostgreSQL 时，还需要单独备份 PostgreSQL 数据库。

## 测试

```powershell
npm run check
```

测试覆盖：

- PostgreSQL/pgvector 启动与健康检查
- 项目持久化与重新读取
- TXT、Markdown 上传、解析、文件落盘与向量分块
- 图片、PDF 扫描页、DOCX 内嵌截图的 OCR 全链路
- 逐资料总结、关键点、解析预览和 OCR 统计
- 向量加关键词的混合检索
- RAG 原文和页码引用
- 费曼教练输入校验与追问
- 一页纸生成
- 生产构建
