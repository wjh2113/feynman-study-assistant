# 外部大模型生成后整包导入

把课件、笔记交给外部大模型，让它**直接生成可导入的学科包 ZIP**（原文 + 知识地图 + 题库）。你拿到的应是最终文件；下载后到知练「学习资料」点 **导入学科包** 即可。

导入后知练**不再跑站内总结/出题**，但仍会解析原文并建立检索索引，资料问答与下载可用。

样例目录：[`examples/study-pack/`](../examples/study-pack/)。

## 你要做的事

```text
上传原文给外部模型（附上下面话术）
        ↓
下载模型给出的学科包 ZIP
        ↓
知练 → 学习资料 → 导入学科包
```

外部模型负责：读附件原始文件名、写 `manifest.json` / `pack.json`、把**原文件原样**打进 `files/`、打成 ZIP。你不需要自己再拼包。

## 发给外部大模型的话术

把资料文件直接传给对方，连同下面这段一起发。

```text
我上传了若干学习资料。请你根据这些资料，直接生成一份「知练学科包」最终 ZIP，供我下载后导入知练。

【最终交付】
1. 优先：给我一个可下载的 .zip 文件（推荐文件名：学科名-学科包.zip）。
2. 若当前环境不能直接给 ZIP 文件：用代码执行打包（Python zipfile 等），把「我上传的每个附件原样」写入 ZIP，再提供下载；不要只给 JSON。
3. 不要让我自己再拼 files/、不要只输出文字版 JSON 就结束。

【ZIP 根目录结构（必须严格如此，不要多套一层文件夹）】
manifest.json
pack.json
files/<每个附件的原始文件名>

【硬性规则】
1. schema 必须是 zhifan-study-pack/v1
2. files/ 里必须放入我上传的每一个附件，内容原样复制；不要改文件内容、不要改名、不要翻译文件名、不要转格式
3. 每个附件的原始文件名（含扩展名）必须同时出现在：
   - manifest.files[].name
   - manifest.files[].path（写成 files/<原始文件名>）
   - pack.sources[].name
   - 相关 sourceRefs[].file
4. 以上名称必须与附件原始文件名完全一致
5. 只依据资料写地图和题；没有依据不要编。tacitKnowledge、scenarios 无把握时用 []
6. 一次最多 12 个附件；单个文件不超过 100 MB
7. ZIP 根目录打开后应直接看到 manifest.json、pack.json、files/，不要出现 my-pack/ 之类外层目录

【manifest.json】
{
  "schema": "zhifan-study-pack/v1",
  "title": "根据资料归纳的学科名",
  "files": [
    { "name": "附件原始文件名", "path": "files/附件原始文件名" }
  ]
}

【pack.json】
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

【自检后再交付】
- ZIP 能解压
- 根目录有 manifest.json、pack.json、files/
- files/ 文件数量 = 我上传的附件数量
- 文件名三处对齐（manifest / pack.sources / files/）
- pack.json 含 modules，且至少有 questionBank 或 questions
```

资料很多时，可分批上传后让模型合并进**一个**最终 ZIP；最终包必须覆盖全部要导入的附件。

若某模型环境**确实无法**产出 ZIP，再退而求其次：让它给出完整目录树 + 全部文件内容，并附一段可直接运行的打包命令；但仍应尽量要求 ZIP。

## 在知练里导入

1. 下载外部模型给的 ZIP（不要改内部文件名）。
2. 打开对应学科 → **学习资料**。
3. 点击 **导入学科包**，选择该 ZIP。
4. 等待「正在导入学科包」完成后检查：
   - 资料列表出现文件，可下载
   - 题库标记为「已导入」（不是「临时」）
   - 知识地图直接可用，不再「生成中」
   - 费曼对练勾选这些资料可以出题
   - 资料问答能检索到原文

同名文件会覆盖；不同名会追加。导入**不会**清空对练归档和盲区。

学科标题：仅当当前学科名仍是空的或「新的学习项目」时，才采用包里的 `title`。

## 包格式 `zhifan-study-pack/v1`

ZIP 根目录：

```text
manifest.json
pack.json
files/<原文文件名>
```

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

限制：一次最多 12 份原文；单个原文不超过 100 MB；整个 ZIP 建议不超过 1200 MB。纯 JSON、没有 `files/` 原文会被拒绝。

## 导出回灌

学习成果页 **导出学科包**（或 `GET /api/projects/:id/export?format=zip`）会打出同一格式：`manifest.json` + `pack.json` + `files/` 原文。

旧版仅含 `project.json`、没有原文的 ZIP 无法导入，需用新导出重新打一份。

## 不做的事

- 不把外部模型密钥配进知练；生成与打包发生在包外。
- 不导入对练归档、盲区。
- 不提供单独的命令行工具；产品内导入与 `POST /api/projects/:projectId/import-pack` 是同一接口。
