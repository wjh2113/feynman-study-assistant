import { getModelConfig } from "../model-config.mjs";
import { deepseek } from "./llm.mjs";

function demoLearningPlan({ title, goal, level }) {
  const subject = title || "该学科";
  const horizon =
    level === "完全不了解" ? "6–8 周"
      : level === "有一些经验" ? "3–4 周"
        : "4–6 周";
  const cadence =
    goal === "准备面试" || goal === "考试复习"
      ? "每周 5 次，每次 40–60 分钟"
      : "每周 3–4 次，每次 30–45 分钟";
  return {
    summary: `围绕「${subject}」、目标「${goal}」、基础「${level}」，建议以 ${horizon} 为一个可检验周期：先建骨架，再费曼输出，最后用真实任务验收。`,
    suggestedHorizon: horizon,
    weeklyCadence: cadence,
    phases: [
      {
        title: "搭骨架",
        duration: "第 1 阶段",
        focus: "弄清这门学问要解决什么问题，以及最小必懂概念",
        actions: [
          "上传教材/课件/笔记等核心资料",
          "浏览资料大纲，标出 5–8 个核心概念",
          "用一句话写下你的学习终点（可检验）"
        ]
      },
      {
        title: "费曼消化",
        duration: "第 2 阶段",
        focus: "不看原文，用自己的话解释，暴露黑话与边界不清",
        actions: [
          "勾选练习资料，对核心概念做费曼对练",
          "把盲区清单过一遍，补证据或改表述",
          "每周至少完成 2 次完整对练并保存记录"
        ]
      },
      {
        title: "迁移验收",
        duration: "第 3 阶段",
        focus: "在目标场景里做取舍，证明学以致用",
        actions: [
          goal === "准备面试" ? "用资料依据回答 3 道高频追问" : "选一个真实任务做最小验证",
          "生成一页纸，检查是否仍依赖黑话",
          "复盘：哪些概念已能教人，哪些还要回炉"
        ]
      }
    ],
    materialAdvice: [
      "优先上传「讲清楚原理」的资料，少堆只含提纲的 PPT",
      "有课堂录音/转写时一并上传，便于挖隐性经验",
      "笔记与教材对照上传，方便交叉检索"
    ],
    practiceAdvice: [
      "先解释是什么与为什么，再给一个正例和一个失效边界",
      "对练时关掉原文，只允许在卡住时回看一句证据",
      "同一概念隔天复测一次，比连刷更有效"
    ],
    milestones: [
      `能用自己的话讲清「${subject}」的核心问题`,
      "完成至少 3 次费曼对练，盲区有闭环",
      goal === "考试复习"
        ? "能在限定时间内默写知识骨架并自检"
        : "能在真实约束下给出可验证的下一步行动"
    ],
    warnings: [
      "不要一上来就追求完整覆盖，先锁 20% 高价值概念",
      "只看不练容易产生虚假掌握感，尽快进入费曼输出"
    ],
    demo: true
  };
}

function normalizePlan(raw = {}, fallback) {
  const base = fallback || demoLearningPlan({ title: "", goal: "兴趣探索", level: "刚刚入门" });
  const phases = Array.isArray(raw.phases) && raw.phases.length
    ? raw.phases.map((phase, index) => ({
      title: String(phase?.title || `阶段 ${index + 1}`).trim(),
      duration: String(phase?.duration || "").trim(),
      focus: String(phase?.focus || "").trim(),
      actions: Array.isArray(phase?.actions)
        ? phase.actions.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
        : []
    })).filter((phase) => phase.title)
    : base.phases;
  return {
    summary: String(raw.summary || base.summary).trim(),
    suggestedHorizon: String(raw.suggestedHorizon || base.suggestedHorizon).trim(),
    weeklyCadence: String(raw.weeklyCadence || base.weeklyCadence).trim(),
    phases: phases.slice(0, 5),
    materialAdvice: (Array.isArray(raw.materialAdvice) ? raw.materialAdvice : base.materialAdvice)
      .map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6),
    practiceAdvice: (Array.isArray(raw.practiceAdvice) ? raw.practiceAdvice : base.practiceAdvice)
      .map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6),
    milestones: (Array.isArray(raw.milestones) ? raw.milestones : base.milestones)
      .map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6),
    warnings: (Array.isArray(raw.warnings) ? raw.warnings : base.warnings)
      .map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4),
    demo: Boolean(raw.demo)
  };
}

export async function generateLearningPlan({ userId, title, goal, level }) {
  const input = {
    title: String(title || "").trim() || "新的学科",
    goal: String(goal || "兴趣探索").trim(),
    level: String(level || "刚刚入门").trim()
  };
  const fallback = demoLearningPlan(input);
  const model = await getModelConfig(userId);
  if (!model.apiKey) {
    return { status: 200, body: { plan: fallback, demo: true } };
  }

  try {
    const result = await deepseek([
      {
        role: "system",
        content:
          "你是费曼学习教练。根据用户的学科、目标与基础，给出可执行的学习规划。不要空洞励志；周期与节奏要具体。只输出合法 JSON。"
      },
      {
        role: "user",
        content: `请为以下学习者制定规划（以下三项已给定，禁止声称未提供）：
学科：${input.title}
学习目标：${input.goal}
当前基础：${input.level}

返回 JSON：
{
  "summary": "2-3 句总建议，必须点名学科「${input.title}」、目标「${input.goal}」与基础「${input.level}」",
  "suggestedHorizon": "建议总周期，如「4周」或「3个月」",
  "weeklyCadence": "建议周节奏，如「每周4次，每次45分钟」",
  "phases": [{"title":"","duration":"","focus":"","actions":["具体行动"]}],
  "materialAdvice": ["资料上传与选择建议"],
  "practiceAdvice": ["费曼对练与输出建议"],
  "milestones": ["可检验里程碑"],
  "warnings": ["常见坑"]
}
要求：phases 3-4 个；总周期由你根据目标与基础推断，不要问用户再填时长；行动要能在本产品中落地（上传资料、勾选练习、费曼对练、盲区复测、一页纸）；摘要与阶段内容必须紧扣「${input.title}」。`
      }
    ], 0.4, userId, Number(process.env.GENERATION_TIMEOUT_MS || 90_000));

    const plan = normalizePlan({ ...result, demo: false }, fallback);
    return { status: 200, body: { plan, demo: false } };
  } catch (error) {
    return {
      status: 200,
      body: {
        plan: { ...fallback, summary: `${fallback.summary}（当前模型暂不可用，已给出规则规划：${error.message}）` },
        demo: true,
        warning: error.message
      }
    };
  }
}
