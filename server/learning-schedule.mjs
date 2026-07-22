const intervals = [1, 3, 7, 14, 30];

export function nextReviewAt({ mastery = 0, lastReviewedAt = Date.now(), failures = 0 }) {
  const level = Math.max(0, Math.min(intervals.length - 1, Math.floor(Number(mastery) || 0)));
  const days = failures > 0 ? 1 : intervals[level];
  return new Date(Number(lastReviewedAt) + days * 86_400_000).toISOString();
}

export function calculateEvidenceMastery({ coachScores = [], retestScores = [], explanationCount = 0, daysSinceReview = 0 }) {
  const coach = coachScores.length ? coachScores.reduce((a, b) => a + b, 0) / coachScores.length : 0;
  const retest = retestScores.length ? retestScores.reduce((a, b) => a + b, 0) / retestScores.length : coach;
  const practice = Math.min(10, explanationCount * 2);
  const decay = Math.min(20, Math.max(0, daysSinceReview - 7) * 0.8);
  return Math.max(0, Math.min(100, Math.round(coach * 0.45 + retest * 0.45 + practice - decay)));
}
