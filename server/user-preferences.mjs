import { getUserAppSetting, saveUserAppSetting } from "./storage.mjs";

const DEFAULT_OCR_MAX_IMAGES = Math.max(
  1,
  Math.min(200, Number(process.env.OCR_MAX_IMAGES || 40))
);

/** Raw source chars above this → split quality-chat (per-file then merge). */
const DEFAULT_SPLIT_ANALYSIS_CHARS = Math.max(
  5_000,
  Math.min(100_000, Number(process.env.SPLIT_ANALYSIS_CHARS || 24_000))
);

export const PREFERENCE_DEFAULTS = {
  coachMaxTurns: 3,
  coachPassScore: 75,
  coachRoleMode: "auto",
  coachShowEvidence: true,
  coachBlindspotThreshold: 60,
  practiceQuestionCapability: "quality-chat",
  ocrEnabled: true,
  ocrMaxImages: DEFAULT_OCR_MAX_IMAGES,
  splitAnalysisChars: DEFAULT_SPLIT_ANALYSIS_CHARS
};

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function normalizePreferences(raw = {}) {
  const roleMode = ["auto", "child", "expert"].includes(raw.coachRoleMode)
    ? raw.coachRoleMode
    : PREFERENCE_DEFAULTS.coachRoleMode;
  const practiceQuestionCapability = ["quality-chat", "fast-chat"].includes(raw.practiceQuestionCapability)
    ? raw.practiceQuestionCapability
    : PREFERENCE_DEFAULTS.practiceQuestionCapability;
  return {
    coachMaxTurns: clampInt(raw.coachMaxTurns, 2, 6, PREFERENCE_DEFAULTS.coachMaxTurns),
    coachPassScore: clampInt(raw.coachPassScore, 60, 95, PREFERENCE_DEFAULTS.coachPassScore),
    coachRoleMode: roleMode,
    coachShowEvidence: raw.coachShowEvidence !== false,
    coachBlindspotThreshold: clampInt(
      raw.coachBlindspotThreshold,
      40,
      80,
      PREFERENCE_DEFAULTS.coachBlindspotThreshold
    ),
    practiceQuestionCapability,
    ocrEnabled: raw.ocrEnabled !== false,
    ocrMaxImages: clampInt(raw.ocrMaxImages, 1, 200, PREFERENCE_DEFAULTS.ocrMaxImages),
    splitAnalysisChars: clampInt(
      raw.splitAnalysisChars,
      5_000,
      100_000,
      PREFERENCE_DEFAULTS.splitAnalysisChars
    )
  };
}

export async function getUserPreferences(userId) {
  const stored = (await getUserAppSetting(userId, "preferences")) || {};
  return normalizePreferences(stored);
}

export async function saveUserPreferences(userId, patch = {}) {
  const current = await getUserPreferences(userId);
  const next = normalizePreferences({ ...current, ...patch });
  await saveUserAppSetting(userId, "preferences", next);
  return next;
}

export function resolveCoachRole(roleMode, turn, maxTurns) {
  if (roleMode === "child" || roleMode === "expert") return roleMode;
  // Auto: early turns stay curious; final turn (and the one before it) go expert.
  if (Number(turn) >= Math.max(2, Number(maxTurns) - 1)) return "expert";
  return "child";
}
