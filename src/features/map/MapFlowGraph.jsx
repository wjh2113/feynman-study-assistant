import React, { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MapConceptNode } from "./MapConceptNode.jsx";
import {
  buildFlowElements,
  layoutFlowNodes,
  mergeSavedPositions,
  readSavedLayout,
  saveLayout
} from "./mapFlowLayout.js";

const nodeTypes = { mapConcept: MapConceptNode };

const defaultEdgeOptions = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b", width: 18, height: 18 },
  style: { stroke: "#94a3b8", strokeWidth: 2 },
  labelStyle: { fill: "#475569", fontSize: 11, fontWeight: 600, fontFamily: "var(--sans)" },
  labelBgStyle: { fill: "#ffffff", fillOpacity: 0.96 },
  labelBgPadding: [6, 4],
  labelBgBorderRadius: 8
};

function buildGraphState(conceptNodes, projectId) {
  const { flowNodes, flowEdges } = buildFlowElements(conceptNodes);
  const laidOut = layoutFlowNodes(flowNodes, flowEdges);
  const saved = readSavedLayout(projectId);
  const merged = mergeSavedPositions(laidOut, saved);
  return {
    nodes: merged,
    edges: flowEdges.map((edge) => ({ ...edge, ...defaultEdgeOptions }))
  };
}

export function MapFlowGraph({ projectId, nodes, selectedId, onSelect }) {
  const conceptKey = useMemo(
    () =>
      nodes
        .map((node) => {
          const links = (node.map?.links || []).map((link) => `${link.to}:${link.label || ""}`).join(",");
          return `${node.id}:${node.map?.status || ""}:${links}`;
        })
        .join("|"),
    [nodes]
  );

  const graphSeed = useMemo(
    () => buildGraphState(nodes, projectId),
    [nodes, projectId, conceptKey]
  );

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(graphSeed.nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(graphSeed.edges);

  useEffect(() => {
    setFlowNodes(graphSeed.nodes);
    setFlowEdges(graphSeed.edges);
  }, [graphSeed, setFlowNodes, setFlowEdges]);

  useEffect(() => {
    setFlowNodes((current) =>
      current.map((node) => ({
        ...node,
        selected: node.id === selectedId,
        data: { ...node.data, onSelect }
      }))
    );
  }, [selectedId, onSelect, setFlowNodes]);

  const onNodeDragStop = useCallback((_event, node) => {
    const saved = readSavedLayout(projectId);
    saveLayout(projectId, { ...saved, [node.id]: node.position });
  }, [projectId]);

  const onNodeClick = useCallback((_event, node) => {
    onSelect?.(node.id);
  }, [onSelect]);

  return (
    <section className="map-flow-wrap">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
        minZoom={0.45}
        maxZoom={1.4}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} color="#dbe4ee" />
        <Controls showInteractive={false} className="map-flow-controls" />
      </ReactFlow>
    </section>
  );
}
