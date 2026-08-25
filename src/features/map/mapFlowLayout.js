import dagre from "@dagrejs/dagre";

export const MAP_NODE_SIZE = { width: 168, height: 92 };

export function buildFlowElements(concepts) {
  const flowNodes = concepts.map((concept) => ({
    id: concept.id,
    type: "mapConcept",
    data: { concept },
    position: { x: 0, y: 0 }
  }));

  const flowEdges = [];
  concepts.forEach((concept) => {
    (concept.map?.links || []).forEach((link, index) => {
      if (!concepts.some((item) => item.id === link.to)) return;
      flowEdges.push({
        id: `${concept.id}-${link.to}-${index}`,
        source: concept.id,
        target: link.to,
        label: link.label,
        type: "smoothstep",
        animated: false
      });
    });
  });

  return { flowNodes, flowEdges };
}

export function layoutFlowNodes(nodes, edges, direction = "LR") {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    nodesep: 72,
    ranksep: 110,
    marginx: 48,
    marginy: 48
  });

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: MAP_NODE_SIZE.width, height: MAP_NODE_SIZE.height });
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  return nodes.map((node) => {
    const pos = graph.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - MAP_NODE_SIZE.width / 2,
        y: pos.y - MAP_NODE_SIZE.height / 2
      }
    };
  });
}

export function readSavedLayout(projectId) {
  try {
    const raw = localStorage.getItem(`zhilian-map-layout-${projectId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLayout(projectId, positions) {
  localStorage.setItem(`zhilian-map-layout-${projectId}`, JSON.stringify(positions));
}

export function mergeSavedPositions(nodes, saved = {}) {
  return nodes.map((node) => {
    const point = saved[node.id];
    if (!point) return node;
    return { ...node, position: { x: point.x, y: point.y } };
  });
}
