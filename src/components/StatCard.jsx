import React from "react";

export function StatCard({ icon: Icon, label, value, tone }) {
  return <div className={`stat-card ${tone}`}><div><Icon size={18} /></div><span>{label}</span><strong>{value}</strong></div>;
}
