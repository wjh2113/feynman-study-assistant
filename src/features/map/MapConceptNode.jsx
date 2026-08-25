import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  BarChart2,
  Calendar,
  Lightbulb,
  Lock,
  Search,
  Target,
  User
} from "../../components/icons.jsx";

const ICONS = {
  search: Search,
  users: User,
  target: Target,
  lightbulb: Lightbulb,
  map: Target,
  palette: Lightbulb,
  layout: BarChart2,
  calendar: Calendar,
  chart: BarChart2
};

function NodeIcon({ name, status }) {
  const Icon = ICONS[name] || Target;
  if (status === "locked") return <Lock size={15} />;
  return <Icon size={15} />;
}

function MapConceptNodeComponent({ data, selected }) {
  const concept = data?.concept;
  if (!concept) return null;
  const rawStatus = concept.map?.status || "learning";
  const status = rawStatus === "selected" ? "learning" : rawStatus;
  const progress = concept.map?.progress || `${concept.mastery || 0}/4`;

  return (
    <div
      className={`map-flow-node ${status}${selected ? " is-active" : ""}`}
      role="presentation"
    >
      <Handle className="map-flow-handle" type="target" position={Position.Left} />
      <span className="map-node-badge">
        <NodeIcon name={concept.map?.icon} status={status} />
        <em>{progress}</em>
      </span>
      <strong>{concept.title}</strong>
      <span className="map-node-foot">{progress}</span>
      <Handle className="map-flow-handle" type="source" position={Position.Right} />
    </div>
  );
}

export const MapConceptNode = memo(MapConceptNodeComponent);
