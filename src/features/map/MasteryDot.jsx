import React from "react";
import { Check } from "../../components/icons.jsx";

export function MasteryDot({ level }) {
  return <i className={`mastery-dot level-${level}`}>{level >= 3 && <Check size={10} />}</i>;
}
