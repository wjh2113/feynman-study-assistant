import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  ControlButton,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize2, Minimize2 } from "../../components/icons.jsx";
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

function MapFlowFullscreenControl({ containerRef, fullscreen, setFullscreen }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const sync = () => {
      const active = document.fullscreenElement === containerRef.current;
      setFullscreen(active);
      if (active) {
        window.setTimeout(() => fitView({ padding: 0.12, maxZoom: 1.2 }), 80);
      }
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [containerRef, fitView, setFullscreen]);

  useEffect(() => {
    if (!fullscreen || document.fullscreenElement) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      containerRef.current?.classList.remove("is-fullscreen");
      setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [containerRef, fullscreen, setFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    const nativeActive = document.fullscreenElement === container;
    const cssActive = container.classList.contains("is-fullscreen");

    if (nativeActive || cssActive) {
      if (nativeActive) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore
        }
      }
      container.classList.remove("is-fullscreen");
      setFullscreen(false);
      return;
    }

    try {
      await container.requestFullscreen();
    } catch {
      container.classList.add("is-fullscreen");
      setFullscreen(true);
      window.setTimeout(() => fitView({ padding: 0.12, maxZoom: 1.2 }), 80);
    }
  }, [containerRef, fitView, setFullscreen]);

  return (
    <ControlButton
      className="react-flow__controls-fullscreen"
      onClick={toggleFullscreen}
      title={fullscreen ? "退出全屏" : "全屏展示"}
      aria-label={fullscreen ? "退出全屏" : "全屏展示"}
    >
      {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </ControlButton>
  );
}

export function MapFlowGraph({ projectId, nodes, selectedId, onSelect }) {
  const wrapRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
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
    <section
      ref={wrapRef}
      className={`map-flow-wrap${fullscreen ? " is-fullscreen" : ""}`}
      aria-label="知识关系图"
    >
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
        <Controls showInteractive={false} className="map-flow-controls">
          <MapFlowFullscreenControl
            containerRef={wrapRef}
            fullscreen={fullscreen}
            setFullscreen={setFullscreen}
          />
        </Controls>
      </ReactFlow>
    </section>
  );
}
