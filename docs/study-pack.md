# 外部大模型生成后整包导入

把课件、笔记交给任意外部大模型，让它生成知识地图和题库，再打成一份 ZIP，在知练「学习资料」页一次导入。导入后**不再跑站内总结/出题**，但仍会解析原文并建立检索索引，资料问答与下载可用。

样例目录：[`examples/study-pack/`](../examples/study-pack/)。

## 你要做的事

```text
上传原文给外部模型
        ↓
拿到 manifest.json + pack.json
        ↓
自己把原文放进 files/（文件名不要改）
        ↓
打成 ZIP
        ↓
知练 → 学习资料 → 导入学科包
```

外部模型**只生成两个 JSON**，不负责打 ZIP，也不负责改写原文。

## 发给外部大模型的话术

把资料文件直接传给对方（不必另列文件名），连同下面这段一起发。

```text
我上传了若干学习资料（请使用每个附件的原始文件名，含扩展名，不要改名、不要翻译、不要简化）。

请只根据这些资料，生成知练学科包的两个 JSON。不要写解释，不要寒暄，不要省略字段。

【你要输出】
两个独立代码块，语言标记分别为 json，文件名写在代码块上一行：

manifest.json
pack.json

【硬性规则】
1. schema 必须是 zhifan-study-pack/v1
2. 每个上传文件都必须出现在：
   - manifest.files[].name
   - manifest.files[].path（写成 files/<原始文件名>）
   - pack.sources[].name
   - 相关 sourceRefs[].file
3. 以上三处的文件名必须与附件原始文件名完全一致
4. 只依据资料；没有依据不要编。无把握的 tacitKnowledge、scenarios 用空数组 []
5. 只输出这两个 JSON，不要 ZIP，不要改写原文

【manifest.json 结构】
{
  "schema": "zhifan-study-pack/v1",
  "title": "根据资料归纳的学科名",
  "files": [
    { "name": "附件原始文件名", "path": "files/附件原始文件名" }
  ]
}

【pack.json 结构】
{
  "summary": "一句话总结",
  "highValue": ["三条高价值知识"],
  "modules": [
    {
      "id": "m1",
      "title": "",
      "description": "",
      "concepts": [
        {
          "id": "c1",
          "title": "",
          "explanation": "通俗解释，不超过80字",
          "importance": "核心",
          "mastery": 1,
          "map": { "links": [{ "to": "c2", "label": "相关" }] },
          "sourceRefs": [{ "file": "附件原始文件名", "page": 1, "quote": "短原文证据" }]
        }
      ]
    }
  ],
  "questions": [
    {
      "id": "q1",
      "question": "能检验真实理解的完整问题",
      "conceptId": "c1",
      "concept": "对应概念名",
      "why": "考察意图",
      "sourceRefs": [{ "file": "附件原始文件名", "page": 1, "quote": "出题依据" }]
    }
  ],
  "tacitKnowledge": [],
  "scenarios": [],
  "sources": [
    {
      "name": "附件原始文件名",
      "summary": {
        "summary": "只概括这一份文件",
        "keyPoints": ["关键点"]
      },
      "questionBank": [
        {
          "id": "qb-1",
          "question": "针对本文件的费曼问题",
          "conceptId": "c1",
          "concept": "概念名",
          "why": "考察意图",
          "sourceRefs": [{ "file": "附件原始文件名", "page": 1, "quote": "短原文" }]
        }
      ]
    }
  ]
}

【数量】
- modules 2–4 个，每模块 1–3 个概念
- highValue 3 条
- questions 约 8–12 题
- 每份资料 questionBank 至少 10 题，长文可到 30–50 题
- importance 只能是：核心 / 高价值 / 补充
- map.links.label 只能是：前置 / 递进 / 相关 / 拓展
- 每个概念尽量 0–2 条指向其他概念 id 的连线
```

资料很多时，可以分批上传，但最终 `manifest.json` / `pack.json` 必须覆盖**全部**要导入的文件，且文件名与本地原文一致。

## 打包 ZIP

目录必须是：

```text
my-pack/
  manifest.json
  pack.json
  files/
    第0课.md
    第1课.pdf
```

- `files/` 里放**同一批原文**，文件名与模型 JSON 里写的完全一致（不要改名）。
- 把 `my-pack` 打成 ZIP。压缩后 ZIP 根目录应能直接看到 `manifest.json`、`pack.json`、`files/`，不要多套一层无关文件夹。
- 不要只传 JSON。没有原文会被拒绝。
- 一次最多 12 份原文；单个原文不超过 100 MB；整个 ZIP 建议不超过 1200 MB。

macOS 示例：

```bash
cd my-pack
zip -r ../日语-学科包.zip manifest.json pack.json files
```

## 在知练里导入

1. 打开对应学科 → **学习资料**。
2. 点击 **导入学科包**，选择 ZIP。
3. 等待后台任务「正在导入学科包」。
4. 完成后检查：
   - 资料列表出现文件，可下载
   - 题库标记为「已导入」（不是「临时」）
   - 知识地图直接可用，不再「生成中」
   - 费曼对练勾选这些资料可以出题
   - 资料问答能检索到原文（依赖向量写入成功）

同名文件会覆盖；不同名会追加。导入**不会**清空对练归档和盲区。

学科标题：仅当当前学科名仍是空的或「新的学习项目」时，才采用包里的 `title`。

## 包格式 `zhifan-study-pack/v1`

### manifest.json

```json
{
  "schema": "zhifan-study-pack/v1",
  "title": "日语",
  "files": [
    { "name": "【知识点总结】日语-第0课.md", "path": "files/【知识点总结】日语-第0课.md" }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `schema` | 必须是 `zhifan-study-pack/v1` |
| `title` | 学科名 |
| `files[].name` | 原文文件名，与 `pack.sources[].name`、ZIP 内文件名一致 |
| `files[].path` | 相对 ZIP 根，如 `files/第0课.md` |

### pack.json

| 字段 | 说明 |
|---|---|
| `summary` | 学科一句话总结 |
| `highValue` | 高价值知识点字符串数组 |
| `modules` | 知识地图：模块 → 概念 → `map.links` / `sourceRefs` |
| `questions` | 项目级费曼题（可选，可空数组） |
| `tacitKnowledge` / `scenarios` | 可空数组 |
| `sources[]` | 与原文一一对应：`name`、`summary`、`questionBank` |

概念：

```json
{
  "id": "c1",
  "title": "选择疑问句",
  "explanation": "用自己的话讲清楚",
  "importance": "核心",
  "mastery": 1,
  "map": { "links": [{ "to": "c2", "label": "递进" }] },
  "sourceRefs": [{ "file": "【知识点总结】日语-第0课.md", "page": 1, "quote": "短原文" }]
}
```

题库条目：

```json
{
  "id": "q1",
  "question": "完整问题",
  "concept": "选择疑问句",
  "conceptId": "c1",
  "why": "考察意图",
  "sourceRefs": [{ "file": "【知识点总结】日语-第0课.md", "page": 1, "quote": "" }]
}
```

导入时服务端会把各资料的 `questionBankMeta` 写成：

```json
{
  "generated": true,
  "pendingLlm": false,
  "capability": "external-import"
}
```

不必让外部模型填写 `questionBankMeta`。

## 导出回灌

学习成果页 **导出学科包**（或 `GET /api/projects/:id/export?format=zip`）会打出同一格式：`manifest.json` + `pack.json` + `files/` 原文。

旧版仅含 `project.json`、没有原文的 ZIP 无法导入，需用新导出重新打一份。

## 不做的事

- 不把外部模型密钥配进知练；生成发生在包外。
- 不导入对练归档、盲区。
- 不提供单独的命令行工具；产品内导入与 `POST /api/projects/:projectId/import-pack` 是同一接口。
