import React from "react";
import { Check } from "../../components/icons.jsx";

export function MasteryDot({ level }) {
  return <i className={`mastery-dot level-${level}`}>{level >= 4 && <Check size={9} />}</i>;
}

export function MasteryDots({ level = 0 }) {
  const value = Math.max(0, Math.min(4, Number(level) || 0));
  return (
    <span className="mastery-dots" aria-label={`掌握度 ${value}/4`}>
      {[1, 2, 3, 4].map((step) => (
        <i key={step} className={step <= value ? `on step-${step}` : ""} />
      ))}
    </span>
  );
}
