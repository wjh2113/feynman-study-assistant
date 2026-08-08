import { embedTexts } from "../embedding.mjs";
import { getEmbeddingConfig, getModelConfig } from "../model-config.mjs";
import {
  getCoachSession,
  hybridSearch,
  recordEvent,
  saveCoachSession
} from "../storage.mjs";
import { deepseek } from "./llm.mjs";

export async function runCoachTurn({
  userId,
  projectId,
  sessionId,
  question,
  concept,
  answer,
  role = "child",
  turn = 1
}) {
  let stage = "校验输入";
  try {
    if (!answer?.trim()) return { status: 400, body: { error: "请先写下你的解释" } };
    const finalTurn = Number(turn) >= 3;
    let evidence = [];
    if (projectId) {
      stage = "检索学习资料";
      const retrievalConfig = await getEmbeddingConfig(userId);
      const retrievalQuery = `${question?.question || ""} ${concept?.title || question?.concept || ""} ${answer}`;
      const [queryEmbedding] = await embedTexts([retrievalQuery], retrievalConfig.embedding);
      evidence = await hybridSearch(projectId, userId, retrievalQuery, queryEmbedding, 2);
    }
    const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);
    if (!modelConfigured) {
      const hasExample = /比如|例如|就像|好比/.test(answer);
      const usesJargon = /(赋能|抓手|闭环|范式|飞轮|方法论)/.test(answer) && answer.length < 90;
      const payload = {
        reply: finalTurn
          ? `本轮三问已完成。你对“${concept?.title || "这个概念"}”的解释已经覆盖了核心含义；接下来请根据评分和盲区提示复习，结束本轮后可选择其他问题继续练习。`
          : usesJargon
          ? `你刚才用了“${answer.match(/赋能|抓手|闭环|范式|飞轮|方法论/)?.[0]}”这个词。如果不能使用这个词，你会怎样向一个完全不懂的人解释？`
          : hasExample
            ? `这个例子很有帮助。现在换个方向：在什么情况下，${concept?.title || "这个方法"}可能不会奏效？`
            : `我大概听懂了，但还不够具体。你能用一个生活中的例子说明“${concept?.title || "这个概念"}”是怎样发生的吗？`,
        phase: turn >= 2 ? "expert" : role,
        completed: finalTurn,
        evaluation: {
          clarity: usesJargon ? 58 : 76,
          logic: answer.length > 80 ? 78 : 65,
          example: hasExample ? 86 : 48,
          boundary: turn >= 2 ? 72 : 42
        },
        blindspot: turn >= 2
          ? {
              title: `${concept?.title || "当前概念"}的适用边界`,
              problem: "解释了它如何生效，但还没有说明失效条件和关键假设。",
              action: "回到原文确认前提，再用一个反例重新解释。"
            }
          : null,
        evidence: evidence.map(({ filename, page, content }) => ({
          filename,
          page,
          quote: content.slice(0, 180)
        })),
        demo: true
      };
      if (projectId) {
        await recordEvent(userId, projectId, "coach_turn", { concept: concept?.title, turn, evaluation: payload.evaluation });
        if (sessionId) {
          const session = await getCoachSession(sessionId);
          if (session && session.projectId === projectId && session.userId === userId) {
            session.messages = session.messages || [];
            session.evaluations = session.evaluations || [];
            session.messages.push({ from: "user", text: answer.trim() });
            session.messages.push({ from: "ai", text: payload.reply });
            session.evaluations.push(payload.evaluation || { clarity: 0, logic: 0, example: 0, boundary: 0 });
            await saveCoachSession(session);
          }
        }
      }
      return { body: payload };
    }
    stage = "生成教练追问";
    const result = await deepseek([
      {
        role: "system",
        content:
          "你是费曼学习教练。一轮对练最多包含3个问题，初始问题算第1个。前两轮不要替用户完善答案，一次只追问一个最关键的问题；发现黑话就要求用人话，发现逻辑跳跃就追问因果。第3轮用户回答后必须结束本轮，只给简短总结、评分和盲区，不得再提出任何问题。只输出合法JSON。"
      },
      {
        role: "user",
        content: `资料生成的问题：${JSON.stringify(question)}
对应概念：${JSON.stringify(concept)}
当前角色：${role === "child" ? "好奇的12岁小孩" : "严厉的行业专家"}
对话轮次：${turn}
用户解释：${answer}
可用于核对的资料片段：${JSON.stringify(evidence)}
本轮是否应结束：${finalTurn ? "是。不得继续追问，reply必须是陈述式总结。" : "否。reply只包含一个追问。"}

返回：
{"reply":"追问或最终总结","phase":"child|expert","completed":${finalTurn},"evaluation":{"clarity":0,"logic":0,"example":0,"boundary":0},"blindspot":null或{"title":"","problem":"","action":""}}`
      }
    ], 0.55, userId);
    if (!result?.reply || !result?.evaluation || typeof result.evaluation !== "object") {
      throw new Error("文本模型没有返回有效的教练追问结构");
    }
    const payload = {
      ...result,
      completed: finalTurn,
      evidence: evidence.map(({ filename, page, content }) => ({ filename, page, quote: content.slice(0, 180) })),
      demo: false
    };
    if (projectId) {
      await recordEvent(userId, projectId, "coach_turn", { concept: concept?.title, turn, evaluation: result.evaluation });
      if (sessionId) {
        const session = await getCoachSession(sessionId);
        if (session && session.projectId === projectId && session.userId === userId) {
          session.messages = session.messages || [];
          session.evaluations = session.evaluations || [];
          session.messages.push({ from: "user", text: answer.trim() });
          session.messages.push({ from: "ai", text: payload.reply });
          session.evaluations.push(payload.evaluation || { clarity: 0, logic: 0, example: 0, boundary: 0 });
          await saveCoachSession(session);
        }
      }
    }
    return { body: payload };
  } catch (error) {
    return { status: 500, body: { error: `${stage}失败：${error.message || "教练暂时无法回应"}`, stage } };
  }
}

export async function generateVariantQuestion(project, blindspot, concept, userId) {
  const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);
  const base = {
    id: `q-variant-${Date.now()}`,
    conceptId: concept?.id || "",
    concept: concept?.title || blindspot?.concept || "",
    sourceRefs: concept?.sourceRefs || [],
    isVariant: true,
    blindspotId: blindspot?.id,
    why: `针对盲区：${blindspot?.title || ""}`
  };
  if (modelConfigured && blindspot?.title && blindspot?.problem) {
    const result = await deepseek([
      {
        role: "system",
        content: "你是费曼学习教练。根据概念和盲区，生成一个能检验该盲区的变式追问。只输出合法JSON。"
      },
      {
        role: "user",
        content: `概念：${concept?.title || ""}
概念解释：${concept?.explanation || ""}
盲区标题：${blindspot.title}
盲区诊断：${blindspot.problem}
最小补漏动作：${blindspot.action || ""}

返回：{"question":"一个具体的变式追问"}`
      }
    ], 0.55, userId);
    if (result?.question) return { ...base, question: result.question };
  }
  return {
    ...base,
    question: `针对盲区「${blindspot?.title || "当前盲区"}」：${blindspot?.action || `请用自己的话解释「${concept?.title || "这个概念"}」，并说明它在什么情况下会失效。`}`
  };
}

export async function generateOnePager({ userId, project }) {
  try {
    const fallbackSections = [
      {
        title: "问题与学习目标",
        purpose: "交代为什么学习这个主题，以及希望解决的真实问题。",
        keyPoints: [project?.analysis?.summary || "说明学习背景、目标与核心问题。"],
        evidence: (project?.analysis?.sources || []).slice(0, 2).map((item) => item.name),
        writingPrompt: "用一个真实困惑或工作场景开篇，不要从概念定义开始。"
      },
      ...((project?.analysis?.modules || []).length
        ? (project.analysis.modules || []).slice(0, 4).map((module) => ({
            title: module.title,
            purpose: module.description || "呈现该模块的核心逻辑与判断方法。",
            keyPoints: (module.concepts || []).slice(0, 3).map((item) => item.title),
            evidence: (module.concepts || [])
              .flatMap((item) => item.sourceRefs || [])
              .slice(0, 3)
              .map((item) => `${item.file} · 第${item.page || 1}页`),
            writingPrompt: "先解释底层逻辑，再用一个例子说明它如何影响实际判断。"
          }))
        : [
            {
              title: "核心概念与知识骨架",
              purpose: "建立读者理解主题所需的最小知识框架。",
              keyPoints: (project?.analysis?.highValue || []).slice(0, 3),
              evidence: (project?.analysis?.sources || []).slice(0, 3).map((item) => item.name),
              writingPrompt: "用概念之间的关系组织内容，不要写成名词解释清单。"
            },
            {
              title: "方法落地与适用边界",
              purpose: "说明知识如何用于真实场景，以及在什么情况下会失效。",
              keyPoints: ["给出一个应用场景", "说明资源限制与风险", "写清方法的适用边界"],
              evidence: [],
              writingPrompt: "至少写一个正例和一个反例，解释判断依据。"
            }
          ]),
      {
        title: "费曼对练暴露的盲区",
        purpose: "展示理解如何经过追问、修正和边界测试。",
        keyPoints: (project?.blindspots || []).length
          ? (project.blindspots || []).slice(0, 3).map((item) => item.title)
          : ["记录最容易产生“自以为懂了”的环节", "设计一个可以检验真实理解的追问"],
        evidence: (project?.sessions || []).slice(0, 3).map((item) => `${item.concept} · 得分${item.score}`),
        writingPrompt: "写清原先哪里想错了、证据如何推翻直觉、现在如何判断。"
      },
      {
        title: "行动方案与下一步验证",
        purpose: "把知识转化为可以执行和检验的行动。",
        keyPoints: [project?.analysis?.highValue?.[0] || "选择一个真实场景进行最小验证。"],
        evidence: [],
        writingPrompt: "给出行动、成功指标、风险和复盘时间，不写空泛口号。"
      }
    ];
    const fallbackOutline = {
      title: `${project?.title || "学习主题"}：从知识骨架到实践判断`,
      format: "深度复盘 / 项目拆解文章",
      audience: "希望快速理解该主题并用于真实问题的读者",
      coreArgument: project?.analysis?.summary || "通过知识骨架、主动输出和定向补漏，把资料转化为可迁移的能力。",
      sections: fallbackSections.filter((item) => item.keyPoints?.length).slice(0, 7)
    };
    const modelConfigured = Boolean((await getModelConfig(userId)).apiKey);
    if (!modelConfigured) {
      const payload = {
        title: project?.title || "学习一页纸",
        thesis: project?.analysis?.summary || "先掌握骨架，再通过输出和追问把知识变成能力。",
        takeaways: project?.analysis?.highValue || [],
        action: "明天选择一个真实问题，用“问题—假设—验证”的结构完成一次15分钟分析。",
        reflection: "我最大的变化，是从收集答案转向验证自己的理解。",
        outline: fallbackOutline,
        demo: true
      };
      if (project?.id) await recordEvent(userId, project.id, "one_pager_generated", payload);
      return { body: payload };
    }
    const result = await deepseek([
      {
        role: "system",
        content:
          "你负责把学习过程沉淀为简洁的一页纸和可直接写作的专业成果大纲。优先使用上传资料、知识地图、用户对练与盲区中形成的观点，不虚构资料、引文或用户经历。大纲必须体现底层逻辑、实战判断和认知修正，不要只罗列知识点。只输出JSON。"
      },
      {
        role: "user",
        content: `根据以下项目数据生成“一页纸学习卡 + 深度复盘/项目拆解文章大纲”：
${JSON.stringify(project).slice(0, 120000)}
返回：
{"title":"","thesis":"","takeaways":["","",""],"action":"","reflection":"",
"outline":{"title":"","format":"深度复盘 / 项目拆解文章","audience":"","coreArgument":"",
"sections":[{"title":"","purpose":"","keyPoints":[""],"evidence":["仅填写项目数据中真实存在的文件、页码、对练或盲区"],"writingPrompt":""}]}}
要求 outline.sections 为5至7章，每章都说明写作目的、2至4个核心论点、可核对依据和具体写作提示。`
      }
    ], 0.35, userId);
    if (!result || typeof result !== "object") throw new Error("文本模型没有返回有效的学习成果结构");
    const normalized = {
      ...result,
      takeaways: Array.isArray(result.takeaways) ? result.takeaways : [],
      outline: {
        ...fallbackOutline,
        ...(result.outline || {}),
        sections: Array.isArray(result.outline?.sections) && result.outline.sections.length
          ? result.outline.sections.map((section) => ({
              title: section.title || "未命名章节",
              purpose: section.purpose || "",
              keyPoints: Array.isArray(section.keyPoints) ? section.keyPoints : [],
              evidence: Array.isArray(section.evidence) ? section.evidence : [],
              writingPrompt: section.writingPrompt || ""
            }))
          : fallbackOutline.sections
      },
      demo: false
    };
    if (project?.id) await recordEvent(userId, project.id, "learning_artifact_generated", normalized);
    return { body: normalized };
  } catch (error) {
    return { status: 500, body: { error: error.message || "生成失败" } };
  }
}
