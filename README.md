# 知返 · 费曼学习助手

知返是一个基于个人资料库的费曼学习助手。用户可以上传 PDF、DOCX、TXT、Markdown 和图片，系统会保存原文件、抽取文本与图片内容、生成知识骨架并建立混合检索索引，再通过资料问答、费曼追问、盲区复测和一页纸输出帮助用户掌握知识。

## 当前能力

- 用户注册、登录和相互隔离的个人资料库
- PDF、DOCX、TXT、Markdown、PNG、JPG、WebP 解析
- 扫描 PDF、DOCX 内嵌图片和普通图片 OCR
- 标题、段落、表格和页码感知的语义分块
- pgvector 语义召回、PostgreSQL 关键词召回和 RRF 融合
- 云端 Embedding、Reranker、视觉 OCR 和文本生成模型
- 带原文、文件名和页码引用的 RAG 问答
- 费曼教练、学习会话、掌握度、盲区和变式复测
- 一页纸与深度复盘提纲
- 密码找回、账户删除、项目 Markdown/JSON/ZIP 导出
- Redis/BullMQ 后台任务、学习提醒、订单与订阅沙箱
- 请求追踪、运行指标、超时提示与 Reranker 自动降级

## 技术架构

- 前端：React 19 + Vite
- API：Node.js + Express
- 本地数据库：PGlite + pgvector，数据保存在 `.data/postgres`
- 生产数据库：PostgreSQL 17 + pgvector
- 文件存储：开发环境本机 `.data/uploads`，生产环境阿里云 OSS
- 任务队列：开发环境内存队列，生产环境 Redis + BullMQ
- 邮件：SMTP；支付：沙箱、微信支付与支付宝适配器
- 默认云模型：DeepSeek 文本模型、阿里云百炼 Qwen OCR、`text-embedding-v3`、`gte-rerank`

项目默认使用远程 Embedding 和 Reranker，不再要求安装 Python 或下载本地 BGE 模型。仓库中的旧 `model_service` 已移除。仍可通过配置兼容 OpenAI API 的其他服务商；如果自行恢复本地服务，可以把 Provider 改为 `local` 并启用 `BGE_AUTO_START`。

## 本地运行

要求 Node.js 20 或更高版本。

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

打开 `http://127.0.0.1:5173`。API 默认监听 `http://127.0.0.1:8787`。

没有配置文本模型时，应用以演示模式生成总结和教练回复。没有配置视觉模型时，普通文本仍可解析，但图片内容会标记为 OCR 待配置。真实语义索引需要配置 Embedding 和 Reranker。

## 云模型配置

推荐登录后在“模型设置”中分别保存和测试以下配置，密钥按用户存储且 API 只返回脱敏结果：

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-pro

VISION_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VISION_API_KEY=
VISION_MODEL=qwen3.5-ocr

EMBEDDING_PROVIDER=remote
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_API_KEY=
EMBEDDING_MODEL=text-embedding-v3
EMBEDDING_DIMENSIONS=1024

RERANKER_PROVIDER=remote
RERANKER_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
RERANKER_API_KEY=
RERANKER_MODEL=gte-rerank
```

不要把真实密钥提交到 Git。`.env` 已被忽略；示例文件中的密钥必须保持为空。

## 标准 PostgreSQL / pgvector

开发机安装 Docker 后可启动仓库提供的数据库：

```powershell
docker compose up -d postgres redis
docker compose ps
```

然后在 `.env` 中设置：

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/zhifan
DATABASE_SSL=false
REDIS_URL=redis://127.0.0.1:6379
```

应用启动时会创建 `vector` 扩展、数据表、索引和迁移版本记录。生产环境不要使用 Compose 示例密码，并应使用独立数据库账户、私有网络、加密备份和 TLS。

## 商业化基础配置

生产环境必须设置一个长期稳定的 `APP_ENCRYPTION_KEY`（建议使用密码管理器生成 32 字节随机值）；它用于 AES-256-GCM 加密用户保存的模型密钥，丢失后已有密钥无法恢复。对象存储设置 `STORAGE_PROVIDER=oss` 并配置 `OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`。密码找回邮件配置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS` 和 `MAIL_FROM`。

支付默认使用 `PAYMENT_PROVIDER=sandbox`，可以完整测试下单与回调后的订阅开通，但不会真实扣款。切换 `wechat` 或 `alipay` 前，应在隔离环境填入 `.env.example` 列出的商户号、应用 ID、私钥和平台证书，并完成签名、验签、金额、防重放、幂等、退款和对账验收；当前正式适配器会在凭据不完整时快速失败，避免误以为已经收款。

## 测试

```powershell
npm run test
npm run build
# 或一次执行
npm run check
npm run test:integration
```

自动测试默认使用内存 PGlite 和模型 Mock，不会消耗云端额度。发布前还应在隔离的测试账户中执行真实链路：上传含图片的资料、确认 OCR、建立索引、进行 RAG 问答和费曼对练，再检查引用与数据落盘。

`test:integration` 需要 `TEST_DATABASE_URL`，可选 `TEST_REDIS_URL`。GitHub Actions 会自动启动标准 pgvector/PostgreSQL 与 Redis 服务，执行单元/API 测试、集成测试、生产构建和 Docker 镜像构建。真实云模型和真实支付因涉及费用与商户密钥，不在公开 CI 中运行。

## 生产部署

1. 复制 `.env.example` 为平台密钥配置，逐项从密钥管理服务注入，禁止提交 `.env`。
2. 执行 `docker compose up -d postgres redis`，或连接云 PostgreSQL/pgvector 与 Redis。
3. 执行 `docker build -t zhifan:release .`，再以只读镜像运行；为本地存储模式挂载 `.data` 持久卷。
4. 容器内由 `node server.mjs` 同时提供构建后的前端和 API，并设置 `NODE_ENV=production`。
5. 使用 Nginx、Caddy 或云负载均衡终止 HTTPS，并只代理到应用内网端口。
6. 设置浏览器实际访问来源，例如 `ALLOWED_ORIGINS=https://study.example.com`；多个来源用逗号分隔。
7. 如果经过可信反向代理，设置例如 `TRUST_PROXY=loopback`；必须只信任实际代理范围，确保限流使用真实客户端 IP 且客户端不能伪造转发头。
8. 同时备份 PostgreSQL 与 OSS，并定期做恢复演练；监控 `/api/health`、5xx、慢请求、队列积压、模型超时和费用。
9. 在网关层增加共享限流、请求体限制和超时，并配置容器健康检查、滚动发布与失败回滚。

应用使用 HttpOnly、SameSite=Lax、生产环境 Secure Cookie。所有会改变状态的 API 都校验 `Origin`，生产环境缺少或不匹配的 Origin 会被拒绝；`ALLOWED_ORIGINS` 只能填写受信任的 HTTPS 来源。会话默认 30 天过期，服务启动及运行期间会清理过期记录。

当前限流保存在单个 Node 进程内存中。多实例部署必须在反向代理、API 网关或 Redis 中配置共享限流，不能仅依赖应用内限流。

## 数据与备份

本地模式备份整个 `.data` 目录即可。标准 PostgreSQL 模式需要分别备份数据库和 `.data/uploads`。恢复演练应验证用户、项目、资料元数据、向量分块和原文件能够一起恢复。
