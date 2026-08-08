import React from "react";

export function ScoreBar({ label, value }) {
  return <div className="score-bar"><div><span>{label}</span><b>{value}</b></div><div className="bar"><i style={{ width: `${value}%` }} /></div></div>;
}
