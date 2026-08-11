# 模型配置备份与一键导入

用户在「模型设置」里保存的 DeepSeek / OCR / Embedding / Reranker 配置存在本地数据库（或云端 PostgreSQL）的 `app_settings` 中。发布到新服务器时，用界面或命令行迁移，无需重新手填密钥。

## 界面（推荐）

1. 登录后打开 **模型设置**。
2. 底部 **配置备份** → **导出配置**，保存 JSON。
3. 在目标服务器用同一账号登录（或先建同名用户），再点 **导入配置** 选择该文件。

导出 / 导入接口：

- `GET /api/settings/config/export`（当前登录用户）
- `POST /api/settings/config/import`（覆盖当前登录用户配置）

## 命令行（整库多用户）

适合运维批量迁移全部账号：

```powershell
# 建议先配置 .env 中的 APP_ENCRYPTION_KEY（若当初加密保存过）
npm run config:export
```

默认输出到：

```text
.data/backups/config/model-config-<时间戳>.json
```

也可指定路径：

```powershell
npm run config:export -- D:\secure\zhifan-model-config.json
```

导入：

```powershell
# 用户已存在（按用户名匹配）时：
npm run config:import -- .\model-config-xxxx.json

# 用户不存在时自动创建（会打印临时密码）：
npm run config:import -- .\model-config-xxxx.json --create-missing-users
```

导入会用**当前机器**的 `APP_ENCRYPTION_KEY` 重新加密后写入。

界面导出的单用户文件与命令行格式相同（`zhifan-model-config/v1`），可互相使用。

## 注意

- 只迁移模型相关配置（`deepseek` / `vision` / `embedding`），不含学习项目、资料文件与向量。
- 导出文件含**明文 API Key**，请离线保管，**不要提交 Git**。
- 若导出时报解密失败，检查本机 `.env` 的 `APP_ENCRYPTION_KEY` 是否与当初保存时一致。
- 完整业务数据迁移仍需备份整个 `.data`（单机）或 PostgreSQL + 对象存储（云模式）。
