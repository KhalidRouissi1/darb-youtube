import { useMemo, useRef, useState } from 'react';
import type { GraphNode, GraphEdge } from '@/lib/workspace/model';
import { useWorkspace } from './WorkspaceContext';
const colors: Record<GraphNode['kind'], string> = {
  course: '#f15a24',
  playlist: '#8460b8',
  note: '#39856b',
  topic: '#577fbd',
  folder: '#8c8984',
};
export function GraphView({
  nodes,
  edges,
  onSelect,
  selected,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelect: (id: string) => void;
  selected: string | null;
}) {
  const { workspace, run } = useWorkspace();
  const [scope, setScope] = useState<'focus' | 'all'>('focus');
  const [types, setTypes] = useState<Set<GraphNode['kind']>>(
    new Set(['course', 'playlist', 'note', 'topic']),
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string | null;
    x: number;
    y: number;
    origin: { x: number; y: number };
    moved: boolean;
    position?: { x: number; y: number };
  } | null>(null);
  const center =
    (selected && nodes.some((n) => n.id === selected) ? selected : null) ??
    nodes.find((n) => n.kind === 'course')?.id ??
    nodes[0]?.id;
  const visible = useMemo(() => {
    const neighbors = new Set([center]);
    for (const edge of edges)
      if (edge.source === center || edge.target === center) {
        neighbors.add(edge.source);
        neighbors.add(edge.target);
      }
    return nodes
      .filter(
        (n) => types.has(n.kind) && (scope === 'all' || neighbors.has(n.id)),
      )
      .sort((a, b) =>
        a.id === center
          ? -1
          : b.id === center
            ? 1
            : { topic: 0, folder: 1, playlist: 2, note: 3, course: 4 }[a.kind] -
                { topic: 0, folder: 1, playlist: 2, note: 3, course: 4 }[
                  b.kind
                ] || a.title.localeCompare(b.title),
      );
  }, [nodes, edges, center, scope, types]);
  const shown = visible.slice(0, 300);
  const shownIds = new Set(shown.map((n) => n.id));
  const lines = edges.filter(
    (e) => shownIds.has(e.source) && shownIds.has(e.target),
  );
  const point = (node: GraphNode, index: number) =>
    positions[node.id] ??
    workspace?.preferences.positions[node.id] ??
    (scope === 'focus' && node.id === center
      ? { x: 500, y: 320 }
      : {
          x:
            500 +
            Math.cos(index * 2.399963) *
              Math.min(270, 85 + Math.sqrt(index + 1) * 22),
          y:
            320 +
            Math.sin(index * 2.399963) *
              Math.min(240, 70 + Math.sqrt(index + 1) * 18),
        });
  const map = new Map(
    shown.map((node, index) => [node.id, point(node, index)]),
  );
  const start = (event: React.PointerEvent, id: string | null) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    svg.current?.setPointerCapture(event.pointerId);
    const origin = id ? map.get(id)! : pan;
    drag.current = {
      id,
      x: event.clientX,
      y: event.clientY,
      origin,
      moved: false,
    };
  };
  return (
    <section className="ws-graph">
      <div className="ws-graph-tools">
        <div className="ws-segment">
          <button
            aria-pressed={scope === 'focus'}
            onClick={() => setScope('focus')}
          >
            Focused graph
          </button>
          <button
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            Full workspace
          </button>
        </div>
        <div className="ws-actions">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          >
            +
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setPositions({});
              void run({ op: 'preferences', patch: { positions: {} } });
            }}
          >
            Reset layout
          </button>
        </div>
      </div>
      <div className="ws-graph-legend">
        {(Object.keys(colors) as GraphNode['kind'][]).map((kind) => (
          <label key={kind}>
            <input
              type="checkbox"
              checked={types.has(kind)}
              onChange={() =>
                setTypes((previous) => {
                  const next = new Set(previous);
                  if (next.has(kind)) next.delete(kind);
                  else next.add(kind);
                  return next;
                })
              }
            />
            <span style={{ background: colors[kind] }} />
            {kind === 'topic'
              ? 'Topics'
              : kind.charAt(0).toUpperCase() + kind.slice(1) + 's'}
          </label>
        ))}
      </div>
      <p className="ws-muted">
        Connections come from playlists, saved links, folders, and shared
        topics. Drag the background to pan; drag a node to arrange it.
      </p>
      {lines.length > 3000 && (
        <p className="ws-muted">
          Showing the first 3,000 edges. Focus on a node for a clearer view.
        </p>
      )}
      {visible.length > 300 && (
        <p role="status" className="ws-notice">
          Showing 300 of {visible.length} nodes. Filter your library or use a
          focused graph to narrow the view.
        </p>
      )}
      {!shown.length ? (
        <div className="ws-empty">
          <h2>No connections in this view</h2>
          <p>
            Add a course, link a note, or enable more node types. Choose Full
            workspace to explore everything.
          </p>
        </div>
      ) : (
        <svg
          ref={svg}
          viewBox="0 0 1000 640"
          role="img"
          aria-label="Interactive learning graph. A connection list follows the graph."
          className="ws-graph-canvas"
          onPointerDown={(e) => start(e, null)}
          onPointerMove={(event) => {
            const d = drag.current;
            if (!d) return;
            const rect = svg.current!.getBoundingClientRect();
            const scale = svg.current!.getScreenCTM?.()?.a;
            const factor = scale ? 1 / scale : 1000 / (rect.width || 1000);
            const dx = (event.clientX - d.x) * factor;
            const dy = (event.clientY - d.y) * factor;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            if (d.id) {
              const position = {
                x: Math.max(-10000, Math.min(10000, d.origin.x + dx / zoom)),
                y: Math.max(-10000, Math.min(10000, d.origin.y + dy / zoom)),
              };
              d.position = position;
              setPositions((prev) => ({ ...prev, [d.id!]: position }));
            } else setPan({ x: d.origin.x + dx, y: d.origin.y + dy });
          }}
          onPointerUp={(event) => {
            const d = drag.current;
            drag.current = null;
            if (svg.current?.hasPointerCapture(event.pointerId))
              svg.current.releasePointerCapture(event.pointerId);
            if (d?.id) {
              if (d.moved) {
                const position = d.position;
                if (position && workspace)
                  void run({
                    op: 'preferences',
                    patch: {
                      positions: {
                        ...workspace.preferences.positions,
                        [d.id]: position,
                      },
                    },
                  });
              } else onSelect(d.id);
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <defs>
            <pattern
              id="ws-graph-dots"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" fill="currentColor" opacity=".12" />
            </pattern>
          </defs>
          <rect width="1000" height="640" fill="url(#ws-graph-dots)" />
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {lines.slice(0, 3000).map((edge, i) => {
              const a = map.get(edge.source)!;
              const b = map.get(edge.target)!;
              return (
                <line
                  key={`${edge.source}:${edge.target}:${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  opacity=".2"
                  strokeDasharray={edge.kind === 'related' ? '5 4' : undefined}
                >
                  <title>{edge.kind}</title>
                </line>
              );
            })}
            {shown.map((node) => {
              const p = map.get(node.id)!;
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x} ${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${node.kind}: ${node.title}`}
                  className="ws-graph-node"
                  onPointerDown={(e) => start(e, node.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(node.id);
                    }
                  }}
                >
                  <title>{node.title}</title>
                  <circle
                    r={node.id === center ? 13 : 8}
                    fill={colors[node.kind]}
                    stroke={
                      node.id === selected ? 'currentColor' : colors[node.kind]
                    }
                    strokeWidth={node.id === selected ? 4 : 1}
                  />
                  <text
                    display={
                      shown.length > 80 && node.id !== center
                        ? 'none'
                        : undefined
                    }
                    y={node.id === center ? 31 : 25}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="12"
                  >
                    {node.title.length > 29
                      ? node.title.slice(0, 27) + '…'
                      : node.title}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
      <details className="ws-connections">
        <summary>Connection list ({lines.length})</summary>
        {lines.length === 0 && (
          <p className="ws-muted">
            No saved connections between the visible nodes.
          </p>
        )}
        {lines.length > 500 && (
          <p className="ws-muted">
            Showing the first 500 connections. Use a focused graph or library
            filters to narrow the list.
          </p>
        )}
        <ul>
          {lines.slice(0, 500).map((edge, i) => (
            <li key={i}>
              <button
                className="ws-text-link"
                onClick={() => onSelect(edge.source)}
              >
                {nodes.find((n) => n.id === edge.source)?.title}
              </button>
              <span> — {edge.kind} → </span>
              <button
                className="ws-text-link"
                onClick={() => onSelect(edge.target)}
              >
                {nodes.find((n) => n.id === edge.target)?.title}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
