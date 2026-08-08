import React from "react";

export function StatusTag({ status }) {
  const map = { open: "待补漏", review: "待复测", done: "已掌握" };
  return <span className={`status-tag ${status}`}>{map[status]}</span>;
}
