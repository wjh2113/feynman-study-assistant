# 知返 · 费曼学习助手 MVP

一个以个人资料为依据，通过“提取骨架 → 主动解释 → 对抗追问 → 定向补漏 → 成果沉淀”帮助个人快速掌握知识的 Web MVP。

## 本地运行

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

访问 `http://127.0.0.1:5173`。

没有设置 `DEEPSEEK_API_KEY` 时，应用会运行在演示模式；配置后将调用 `deepseek-v4-pro` 完成资料分析、费曼追问和一页纸生成。

## 测试

```powershell
npm run check
```

该命令会执行服务端集成测试，并完成一次生产构建。

## 已实现

- 学习项目创建
- PDF、DOCX、TXT、Markdown 上传与解析
- 课程精学／主题速学两种模式
- 带资料引用的知识骨架
- 隐性经验提取
- 小白／专家双角色费曼对练
- 实时表达观察与盲区识别
- 盲区补漏和复测状态
- 一页纸学习成果与 Markdown 导出
- 浏览器本地进度保存
