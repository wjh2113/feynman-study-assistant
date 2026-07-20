import assert from "node:assert/strict";
import test from "node:test";
import { recalculateMasteryAndProgress, scoreToMastery } from "../src/progress.mjs";

test("scoreToMastery 映射规则", () => {
  assert.equal(scoreToMastery(95), 4);
  assert.equal(scoreToMastery(90), 4);
  assert.equal(scoreToMastery(89), 3);
  assert.equal(scoreToMastery(75), 3);
  assert.equal(scoreToMastery(74), 2);
  assert.equal(scoreToMastery(1), 2);
  assert.equal(scoreToMastery(0), 1);
});

test("recalculateMasteryAndProgress 根据会话更新掌握度和进度", () => {
  const project = {
    id: "p1",
    analysis: {
      sources: [{}],
      modules: [
        {
          id: "m1",
          concepts: [
            { id: "c1", title: "概念A", mastery: 1 },
            { id: "c2", title: "概念B", mastery: 1 }
          ]
        }
      ]
    },
    blindspots: [{ id: "b1", status: "open" }],
    sessions: [
      { concept: "概念A", score: 82 },
      { concept: "概念A", score: 60 },
      { concept: "概念B", score: 95 }
    ],
    onePager: null
  };
  const next = recalculateMasteryAndProgress(project);
  const conceptA = next.analysis.modules[0].concepts[0];
  const conceptB = next.analysis.modules[0].concepts[1];
  assert.equal(conceptA.mastery, 3, "概念A 取最高分 82 对应 mastery 3");
  assert.equal(conceptB.mastery, 4, "概念B 取最高分 95 对应 mastery 4");
  // 进度：资料 12 + 地图 18 + 对练 15 + 有待处理盲区 0 + 掌握比例 1/2 * 30 = 15 + 一页纸 0 = 75
  assert.equal(next.progress, 75);
});

test("recalculateMasteryAndProgress 完整项目进度为 100", () => {
  const project = {
    id: "p2",
    analysis: {
      sources: [{}],
      modules: [{
        id: "m1",
        concepts: [{ id: "c1", title: "概念A", mastery: 1 }]
      }]
    },
    blindspots: [],
    sessions: [{ concept: "概念A", score: 95 }],
    onePager: { title: "一页纸" }
  };
  const next = recalculateMasteryAndProgress(project);
  assert.equal(next.analysis.modules[0].concepts[0].mastery, 4);
  // 12 + 18 + 15 + 15 + 30 + 20 = 110，上限 100
  assert.equal(next.progress, 100);
});

test("recalculateMasteryAndProgress 没有会话时保持初始 mastery", () => {
  const project = {
    id: "p3",
    analysis: {
      sources: [{}],
      modules: [{
        id: "m1",
        concepts: [{ id: "c1", title: "概念A", mastery: 2 }]
      }]
    },
    blindspots: [{ status: "done" }],
    sessions: [],
    onePager: null
  };
  const next = recalculateMasteryAndProgress(project);
  assert.equal(next.analysis.modules[0].concepts[0].mastery, 2);
  // 12 + 18 + 0 + 15 + 0 + 0 = 45
  assert.equal(next.progress, 45);
});
