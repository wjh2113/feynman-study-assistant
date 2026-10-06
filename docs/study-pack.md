# 知练学科包 `zhifan-study-pack/v1`

给外部大模型（或人工）生成知识地图与题库后，打成一份 ZIP，在「学习资料」页点击 **导入学科包** 一次导入原文、地图和题库。导入后不再跑站内总结/出题，但会解析原文并建立检索索引。

## ZIP 结构

```
manifest.json
pack.json
files/<原文文件名>
```

不要只传 JSON。没有 `files/` 原文会被拒绝。

## manifest.json

```json
{
  "schema": "zhifan-study-pack/v1",
  "title": "日语",
  "files": [
    { "name": "【知识点总结】日语-第0课.md", "path": "files/【知识点总结】日语-第0课.md" }
  ]
}
```

- `schema` 必须是 `zhifan-study-pack/v1`
- `files[].name` 必须与 `pack.json` 里 `sources[].name`、ZIP 内原文文件名一致
- 一次最多 12 份原文；单个原文不超过 100 MB

## pack.json

外部模型只需填这些字段：

| 字段 | 说明 |
|---|---|
| `summary` | 学科一句话总结 |
| `highValue` | 高价值知识点字符串数组 |
| `modules` | 知识地图：模块 → 概念 → `map.links` / `sourceRefs` |
| `questions` | 项目级费曼题（可选） |
| `tacitKnowledge` / `scenarios` | 可空数组 |
| `sources[]` | 与原文一一对应：`name`、`summary`、`questionBank` |

概念形状：

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

样例见 [`examples/study-pack/`](../examples/study-pack/)。

## 导入后行为

- `contentAnalysisStatus` 直接为 `ready`，知识地图不再「生成中」
- 各资料题库标记为已导入（`capability: external-import`，`pendingLlm: false`）
- 同名原文覆盖，不同名追加；不对练归档做清空
- 旧版仅含 `project.json`、没有原文的 ZIP 会明确报错，请用「导出学科包」重新导出后再导入
