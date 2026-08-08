# 京东云数据存储方案

知返把数据拆成三类。上京东云时先选部署模式：

| `DEPLOY_MODE` | 适用 | 结构化 + 向量 | 原文件 | 队列 |
|---------------|------|---------------|--------|------|
| `standalone` | 单机一台云主机 | PGlite → `.data/postgres` | 本地盘 → `.data/uploads` | 内存（可不配 Redis） |
| `cloud`（默认） | 可扩容 / 多实例 | PostgreSQL + pgvector | 京东云 OSS（S3） | Redis + BullMQ |

## 单机模式

```env
NODE_ENV=production
DEPLOY_MODE=standalone
STORAGE_PROVIDER=local
DATA_DIR=.data
APP_ENCRYPTION_KEY=
ALLOWED_ORIGINS=https://study.example.com
```

要点：

- `.data` 必须挂云硬盘，并纳入快照备份（同时包含库与上传文件）。
- 单实例即可；不要多开应用进程共用同一套 PGlite 目录。
- 仍须配置 `APP_ENCRYPTION_KEY`（≥32 字节）与 `ALLOWED_ORIGINS`。

## 云模式数据落点

| 数据类型 | 内容 | 推荐落点 | 环境变量 |
|---------|------|---------|---------|
| 结构化 + 向量 | 用户、项目、分块、`document_chunks.embedding` | 同 VPC 的 **PostgreSQL 17 + pgvector** | `DATABASE_URL`、`DATABASE_SSL` |
| 原始资料文件 | PDF/DOCX/图片等上传原件 | **京东云 OSS（S3 兼容）** | `STORAGE_PROVIDER=jdcloud`、`S3_*` |
| 任务与会话缓存 | BullMQ 分析/重建索引任务 | **京东云 Redis** 或同 VPC Redis | `REDIS_URL` |

云模式生产启动时会拒绝 `PGlite` 与 `STORAGE_PROVIDER=local`；单机模式不会。

## 为什么不用「云主机本地盘」

- 应用滚动发布或换机后，`.data/uploads` 与嵌入式库会丢失。
- 向量与元数据需要备份/恢复一体；原文件需要对象存储生命周期与跨可用区冗余。
- 多实例扩容时，本地盘无法共享资料文件。

## 1. PostgreSQL + pgvector

京东云托管 PostgreSQL **不一定**预装 `pgvector`。推荐两种方式（二选一）：

1. **推荐**：同一 VPC 云主机用 Docker 跑 `pgvector/pgvector:pg17`，数据盘挂载独立云硬盘，定期快照。
2. 若托管库控制台/`pg_available_extensions` 已有 `vector`，再改用托管实例。

应用启动会执行 `CREATE EXTENSION IF NOT EXISTS vector`，账号需要具备建扩展权限。

示例：

```env
DATABASE_URL=postgresql://zhifan:强密码@10.x.x.x:5432/zhifan
DATABASE_SSL=false
# 若走公网 TLS：DATABASE_SSL=true
# 若需校验证书：DATABASE_SSL=verify 且配置 DATABASE_SSL_CA
DATABASE_POOL_MAX=10
```

## 2. 京东云对象存储（S3）

京东云 OSS 走 **S3 兼容协议**，应用使用 `@aws-sdk/client-s3`，不是阿里云 `ali-oss`。

北京地域示例如下（其他地域替换 `cn-north-1`）：

```env
STORAGE_PROVIDER=jdcloud
S3_REGION=cn-north-1
S3_ENDPOINT=https://s3.cn-north-1.jdcloud-oss.com
# 同地域云主机建议内网：
# S3_ENDPOINT=https://s3-internal.cn-north-1.jdcloud-oss.com
S3_BUCKET=zhifan-uploads
S3_ACCESS_KEY_ID=
S3_ACCESS_KEY_SECRET=
S3_FORCE_PATH_STYLE=true
```

兼容别名：`STORAGE_PROVIDER=s3` 行为相同。仍可用 `OSS_*` 变量名作为 fallback，但京东云部署请优先写 `S3_*`。

对象键格式：`{projectId}/{uuid}.ext`，库表 `documents.storage_path` 记为 `s3://bucket/key`。

## 3. Redis

```env
REDIS_URL=redis://:密码@10.x.x.x:6379
```

用于 BullMQ 后台解析/重建索引。生产未配置时进程会拒绝启动。

## 4. 同 VPC 拓扑（建议）

```text
浏览器 --HTTPS--> 负载均衡/Nginx
                     |
                 应用云主机 (Docker: zhifan)
                 /        |         \
         PG+pgvector   Redis      京东云 OSS
         (云硬盘)      (云硬盘)   (S3 内网 endpoint)
```

要点：

- 应用、数据库、Redis 放同一私有网络；安全组只对应用子网开放 5432/6379。
- OSS 用内网 Endpoint，降低流量费与延迟。
- `ALLOWED_ORIGINS` 填真实站点；`TRUST_PROXY` 仅信任负载均衡。
- 备份：云硬盘快照（PG/Redis）+ OSS 跨区域复制或生命周期；恢复时验证「库 + 对象」能对上 `storage_path`。

## 5. 生产环境最小变量清单

```env
NODE_ENV=production
PORT=8787
APP_ENCRYPTION_KEY=至少32字节随机串
ALLOWED_ORIGINS=https://study.example.com
TRUST_PROXY=loopback
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
STORAGE_PROVIDER=jdcloud
S3_REGION=cn-north-1
S3_ENDPOINT=https://s3-internal.cn-north-1.jdcloud-oss.com
S3_BUCKET=zhifan-uploads
S3_ACCESS_KEY_ID=
S3_ACCESS_KEY_SECRET=
```

启动后访问 `/api/health`，确认 `database.mode`、`storage.provider`、`queue` 均正常。
