import React from "react";

export function StatCard({ icon: Icon, label, value, tone, variant = "default" }) {
  if (variant === "dashboard") {
    return (
      <div className={`stat-card dashboard ${tone}`}>
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        <div className="stat-icon"><Icon size={18} /></div>
      </div>
    );
  }

  return (
    <div className={`stat-card ${tone}`}>
      <div><Icon size={18} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
