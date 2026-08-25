import React from "react";

export function ScoreBar({ label, value, tone, passAt }) {
  const color = tone || (value >= 85 ? "good" : value >= (passAt || 75) ? "ok" : "warn");
  return (
    <div className={`score-bar tone-${color}`}>
      <div><span>{label}</span><b>{value}</b></div>
      <div className="bar">
        <i style={{ width: `${value}%` }} />
        {passAt != null && <em className="pass-mark" style={{ left: `${passAt}%` }} />}
      </div>
    </div>
  );
}
