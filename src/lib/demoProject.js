export const demoProject = {
  id: "demo-ai-pm",
  title: "AI 产品经理快速入门",
  description: "建立 AI 产品经理的知识骨架，并完成一次真实场景应用。",
  mode: "course",
  goal: "工作应用",
  level: "刚刚入门",
  createdAt: Date.now(),
  progress: 62,
  analysis: {
    summary: "AI 产品的核心不是给旧功能加上模型，而是围绕模型能力、数据反馈和用户任务重新设计价值闭环。",
    highValue: ["先定义真实任务，再决定是否使用 AI", "把不确定性设计进产品体验", "用反馈数据持续改善模型与产品"],
    modules: [
      {
        id: "m1",
        title: "理解 AI 产品",
        description: "辨别 AI 产品与传统软件在能力边界和交互方式上的差异。",
        concepts: [
          {
            id: "c1",
            title: "AI-Native 思维",
            explanation: "不是给旧产品加一个聊天框，而是从模型能完成什么任务重新设计整个体验。",
            importance: "核心",
            mastery: 3,
            sourceRefs: [{ file: "AI产品方法论课件.pdf", page: 12, quote: "从模型能力出发，重构用户任务链路。" }]
          },
          {
            id: "c2",
            title: "能力边界",
            explanation: "清楚模型在哪些情况下可靠，哪些情况下需要人来确认或兜底。",
            importance: "高价值",
            mastery: 2,
            sourceRefs: [{ file: "课堂录音转写.docx", page: 1, quote: "不要掩盖不确定性，要设计处理不确定性的体验。" }]
          }
        ]
      },
      {
        id: "m2",
        title: "构建数据飞轮",
        description: "让真实使用产生的数据持续改善产品表现。",
        concepts: [
          {
            id: "c3",
            title: "数据飞轮",
            explanation: "用户使用产生反馈，反馈改善模型，模型变好又吸引更多有效使用。",
            importance: "核心",
            mastery: 2,
            sourceRefs: [{ file: "AI产品方法论课件.pdf", page: 24, quote: "产品使用、反馈数据与模型迭代形成循环。" }]
          },
          {
            id: "c4",
            title: "反馈信号",
            explanation: "把用户的修改、接受、放弃等行为转化为可以学习的信号。",
            importance: "高价值",
            mastery: 1,
            sourceRefs: [{ file: "课堂录音转写.docx", page: 1, quote: "点赞不是唯一反馈，用户的修改往往更有价值。" }]
          }
        ]
      },
      {
        id: "m3",
        title: "验证与落地",
        description: "用最低成本验证 AI 是否真的改善了用户结果。",
        concepts: [
          {
            id: "c5",
            title: "价值验证",
            explanation: "先证明用户结果变好了，再讨论模型参数或功能数量。",
            importance: "核心",
            mastery: 1,
            sourceRefs: [{ file: "个人学习笔记.md", page: 1, quote: "价值指标必须对应用户任务的最终结果。" }]
          }
        ]
      }
    ],
    tacitKnowledge: [
      {
        title: "不要隐藏模型的不确定性",
        type: "踩坑经验",
        detail: "讲师提到，一味追求像传统软件一样确定，会让产品在模型出错时失去用户信任。",
        sourceRef: { file: "课堂录音转写.docx", page: 1 }
      },
      {
        title: "用户修改是高价值反馈",
        type: "反直觉观点",
        detail: "比起简单点赞，用户如何修改模型输出，更能说明真实偏好和质量差距。",
        sourceRef: { file: "课堂录音转写.docx", page: 1 }
      }
    ],
    scenarios: [
      {
        id: "s1",
        title: "给客服团队设计 AI 助手",
        context: "一家电商公司的客服响应很慢，希望引入 AI。",
        constraint: "历史数据杂乱，错误回答会造成客诉，开发周期只有四周。",
        goal: "设计首个可验证版本，并说明如何处理模型不确定性。",
        concepts: ["能力边界", "价值验证"]
      },
      {
        id: "s2",
        title: "反馈很多，模型却没有变好",
        context: "产品每天收集数千个点赞和点踩，但生成质量没有明显提高。",
        constraint: "标注预算有限。",
        goal: "重新设计反馈机制，让数据可以真正推动产品迭代。",
        concepts: ["数据飞轮", "反馈信号"]
      }
    ],
    sources: [
      {
        id: "src1", name: "AI产品方法论课件.pdf", type: "课件 · PDF", pages: 38, status: "ready", size: "4.8 MB",
        summary: { summary: "课件从模型能力边界、AI-Native 产品设计和数据反馈三个层面说明 AI 产品的核心方法。", keyPoints: ["先定义用户任务，再决定是否使用 AI", "把模型不确定性设计进产品体验", "让反馈数据真正进入模型与产品迭代"] },
        parseReport: { nativeCharacters: 12680, ocrCharacters: 842, imagesFound: 6, imagesOcrd: 6, ocrStatus: "ready", warnings: [] },
        parsedPreview: "第 1 页：AI 产品不是给旧功能加上聊天框，而是从模型能够完成的任务出发重构用户体验。\n\n第 12 页：从模型能力出发，重构用户任务链路。"
      },
      {
        id: "src2", name: "课堂录音转写.docx", type: "转写 · DOCX", pages: 1, status: "ready", size: "186 KB",
        summary: { summary: "转写补充了课件没有展开的上线踩坑、人工兜底和反馈信号质量判断。", keyPoints: ["高风险回答必须设置人工介入条件", "点赞点踩不等于可训练的高质量反馈", "先验证最危险的产品假设"] },
        parseReport: { nativeCharacters: 28410, ocrCharacters: 0, imagesFound: 0, imagesOcrd: 0, ocrStatus: "not_needed", warnings: [] },
        parsedPreview: "第 1 页：不要掩盖模型的不确定性，要设计处理不确定性的体验。上线前先明确错误成本和人工介入阈值。"
      },
      {
        id: "src3", name: "个人学习笔记.md", type: "笔记 · MD", pages: 1, status: "ready", size: "24 KB",
        summary: { summary: "个人笔记把课程内容整理为任务定义、最小验证和反馈闭环三个行动步骤。", keyPoints: ["问题定义优先于功能设计", "用最低成本验证关键假设", "每次使用都应产生可学习信号"] },
        parseReport: { nativeCharacters: 1860, ocrCharacters: 0, imagesFound: 0, imagesOcrd: 0, ocrStatus: "not_needed", warnings: [] },
        parsedPreview: "第 1 页：先验证最危险的假设，再增加投入。产品进展应以关键不确定性是否减少来判断。"
      }
    ]
  },
  blindspots: [
    {
      id: "b1",
      title: "数据飞轮的成立条件",
      concept: "数据飞轮",
      problem: "能够解释循环过程，但没有说明哪些反馈数据真正有效。",
      action: "补充反馈信号的质量标准，并给出一个无效反馈的反例。",
      source: "课堂录音转写.docx",
      status: "review"
    },
    {
      id: "b2",
      title: "模型出错时的产品兜底",
      concept: "能力边界",
      problem: "方案依赖人工审核，但没有说明何时触发人工介入。",
      action: "根据错误成本设计三级置信度与介入规则。",
      source: "AI产品方法论课件.pdf · 第 18 页",
      status: "open"
    }
  ],
  sessions: [
    { id: "ss1", concept: "AI-Native 思维", score: 82, date: "今天 10:32", status: "通过" },
    { id: "ss2", concept: "数据飞轮", score: 67, date: "昨天 21:18", status: "需补漏" }
  ],
  onePager: null
};
