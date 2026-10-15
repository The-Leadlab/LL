import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workflowsAPI, Workflow, WorkflowEdge, WorkflowNode } from '@/services/api/workflows';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Plus,
  Save,
  Loader2,
  Trash2,
  Copy,
  PenSquare,
  GitBranch,
  Unlink,
  Keyboard,
  Layers,
} from 'lucide-react';
import { bezierPath, deriveTriggerType, migrateLegacyFlow } from './mindMapUtils';
import { MindMapFormattedText, toggleMindMapWrap } from './mindMapTextFormat';

type MindNodeKind = 'central' | 'standard' | 'free_text';
type TemplateCategory = 'starting' | 'flow' | 'logic';
type HistorySnapshot = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
type ReconnectEnd = 'source' | 'target';

interface NodeTemplate {
  type: string;
  label: string;
  description: string;
  category: TemplateCategory;
  kind: MindNodeKind;
  color: string;
}

interface MapTemplate {
  id: string;
  label: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 84;
const TEMPLATE_STORAGE_KEY = 'mind-map-custom-templates-v1';

const NODE_TEMPLATES: NodeTemplate[] = [
  { type: 'central_topic', label: 'Central Topic', description: 'Main idea', category: 'starting', kind: 'central', color: 'bg-indigo-100 text-indigo-700' },
  { type: 'record_created', label: 'Record Created', description: 'When a record is created', category: 'starting', kind: 'standard', color: 'bg-green-100 text-green-700' },
  { type: 'record_updated', label: 'Record Updated', description: 'When a record is updated', category: 'starting', kind: 'standard', color: 'bg-blue-100 text-blue-700' },
  { type: 'field_changed', label: 'Field Changed', description: 'When a field changes', category: 'starting', kind: 'standard', color: 'bg-purple-100 text-purple-700' },
  { type: 'send_email', label: 'Send Email', description: 'Send message', category: 'flow', kind: 'standard', color: 'bg-sky-100 text-sky-700' },
  { type: 'create_task', label: 'Create Task', description: 'Add follow-up', category: 'flow', kind: 'standard', color: 'bg-emerald-100 text-emerald-700' },
  { type: 'update_field', label: 'Update Field', description: 'Change data', category: 'flow', kind: 'standard', color: 'bg-amber-100 text-amber-700' },
  { type: 'condition', label: 'Decision', description: 'Branch logic', category: 'logic', kind: 'standard', color: 'bg-orange-100 text-orange-700' },
  { type: 'wait', label: 'Wait', description: 'Delay node', category: 'logic', kind: 'standard', color: 'bg-gray-100 text-gray-700' },
  { type: 'free_text', label: 'Text Note', description: 'Standalone text', category: 'flow', kind: 'free_text', color: 'bg-white text-neutral-800' },
];

const DEFAULT_TEMPLATES: MapTemplate[] = [
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    nodes: [
      { id: 'n1', type: 'central_topic', label: 'Brainstorm Topic', position: { x: 380, y: 220 }, data: { kind: 'central' } },
      { id: 'n2', type: 'free_text', label: 'Idea A', position: { x: 150, y: 120 }, data: { kind: 'free_text' } },
      { id: 'n3', type: 'free_text', label: 'Idea B', position: { x: 650, y: 140 }, data: { kind: 'free_text' } },
      { id: 'n4', type: 'free_text', label: 'Idea C', position: { x: 640, y: 360 }, data: { kind: 'free_text' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n1', target: 'n3' },
      { id: 'e3', source: 'n1', target: 'n4' },
    ],
  },
  {
    id: 'project-plan',
    label: 'Project Plan',
    nodes: [
      { id: 'p1', type: 'central_topic', label: 'Project', position: { x: 360, y: 220 }, data: { kind: 'central' } },
      { id: 'p2', type: 'create_task', label: 'Milestone 1', position: { x: 120, y: 100 }, data: { kind: 'standard' } },
      { id: 'p3', type: 'create_task', label: 'Milestone 2', position: { x: 620, y: 100 }, data: { kind: 'standard' } },
      { id: 'p4', type: 'condition', label: 'Risks', position: { x: 360, y: 380 }, data: { kind: 'standard' } },
    ],
    edges: [
      { id: 'ep1', source: 'p1', target: 'p2' },
      { id: 'ep2', source: 'p1', target: 'p3' },
      { id: 'ep3', source: 'p1', target: 'p4' },
    ],
  },
];

function touchDistance(a: React.Touch, b: React.Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function parseApiError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { detail?: unknown } } }).response?.data;
    if (typeof data?.detail === 'string') return data.detail;
  }
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

const WorkflowBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState('Untitled Mind Map');
  const [description, setDescription] = useState('');
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snapGrid, setSnapGrid] = useState(true);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panOrigin, setPanOrigin] = useState({ x: 0, y: 0 });
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkCursor, setLinkCursor] = useState({ x: 0, y: 0 });
  const [clipboardNode, setClipboardNode] = useState<WorkflowNode | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [reconnectingEdge, setReconnectingEdge] = useState<{ edgeId: string; end: ReconnectEnd } | null>(null);
  const [dragGuides, setDragGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('brainstorm');
  const [customTemplates, setCustomTemplates] = useState<MapTemplate[]>([]);
  const [lastCanvasClick, setLastCanvasClick] = useState<{ x: number; y: number } | null>(null);
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [showMobileShortcuts, setShowMobileShortcuts] = useState(false);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const touchPanRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const allTemplates = useMemo(() => [...DEFAULT_TEMPLATES, ...customTemplates], [customTemplates]);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) || null, [edges, selectedEdgeId]);
  const mapBounds = useMemo(() => {
    if (!nodes.length) return { minX: 0, maxX: 1000, minY: 0, maxY: 700 };
    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    return {
      minX: Math.min(...xs) - 80,
      maxX: Math.max(...xs) + NODE_WIDTH + 80,
      minY: Math.min(...ys) - 80,
      maxY: Math.max(...ys) + NODE_HEIGHT + 80,
    };
  }, [nodes]);

  const pushHistory = useCallback(() => {
    setHistory((prev) => [...prev.slice(-49), { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
    setFuture([]);
  }, [nodes, edges]);

  useEffect(() => {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as MapTemplate[];
      if (Array.isArray(parsed)) setCustomTemplates(parsed);
    } catch {
      // noop
    }
  }, []);

  const { data: existingWorkflow, isLoading } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowsAPI.getById(Number(id)),
    enabled: !!id && id !== 'new',
  });

  useEffect(() => {
    if (!existingWorkflow) return;
    const migrated = migrateLegacyFlow(existingWorkflow.flow_definition);
    setName(existingWorkflow.name || 'Untitled Mind Map');
    setDescription(existingWorkflow.description || '');
    setNodes(migrated.nodes);
    setEdges(migrated.edges);
  }, [existingWorkflow]);

  useEffect(() => {
    if (!id || id === 'new') return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        `mind-map-draft-${id}`,
        JSON.stringify({ nodes, edges, name, description, updatedAt: new Date().toISOString() }),
      );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [id, nodes, edges, name, description]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim() || 'Untitled Mind Map',
        description: description || undefined,
        trigger_type: deriveTriggerType(nodes),
        trigger_object: 'lead',
        flow_definition: {
          version: 2,
          mode: 'mind_map',
          nodes,
          edges,
        } as any,
        is_active: false,
        status: 'draft',
      };
      if (id && id !== 'new') return workflowsAPI.update(Number(id), payload as Partial<Workflow>);
      return workflowsAPI.create(payload);
    },
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({ title: 'Saved', description: 'Mind map saved successfully.' });
      const created = (wf && typeof wf === 'object' && 'id' in wf ? wf : (wf as { data?: { id?: number } })?.data) as { id?: number } | undefined;
      if ((!id || id === 'new') && created?.id) {
        navigate(`/workflows/${created.id}`);
      }
    },
    onError: (err) => toast({ title: 'Save failed', description: parseApiError(err), variant: 'destructive' }),
  });

  const addNodeAt = useCallback((template: NodeTemplate, x: number, y: number) => {
    pushHistory();
    const p = snapGrid ? { x: Math.round(x / 20) * 20, y: Math.round(y / 20) * 20 } : { x, y };
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: template.type,
      label: template.label,
      position: p,
      data: { kind: template.kind },
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setEditingNodeId(newNode.id);
  }, [pushHistory, snapGrid]);

  const deleteNode = useCallback((nodeId: string) => {
    pushHistory();
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
    setEditingNodeId(null);
  }, [pushHistory]);

  const addEdge = useCallback((source: string, target: string) => {
    if (source === target) return;
    const idEdge = `edge-${source}-${target}`;
    setEdges((prev) => {
      if (prev.some((e) => e.id === idEdge || (e.source === source && e.target === target))) return prev;
      return [...prev, { id: idEdge, source, target }];
    });
  }, []);

  const updateNodeLabel = useCallback((nodeId: string, label: string) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, label } : n)));
  }, []);

  const addChildNode = useCallback(() => {
    if (!selectedNode) return;
    pushHistory();
    const template = NODE_TEMPLATES.find((t) => t.kind !== 'free_text') || NODE_TEMPLATES[0];
    const p = {
      x: snapGrid ? Math.round((selectedNode.position.x + 280) / 20) * 20 : selectedNode.position.x + 280,
      y: snapGrid ? Math.round((selectedNode.position.y + 120) / 20) * 20 : selectedNode.position.y + 120,
    };
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: template.type,
      label: template.label,
      position: p,
      data: { kind: template.kind },
    };
    setNodes((prev) => [...prev, newNode]);
    setEdges((prev) => [...prev, { id: `edge-${selectedNode.id}-${newNode.id}`, source: selectedNode.id, target: newNode.id }]);
    setSelectedNodeId(newNode.id);
    setEditingNodeId(newNode.id);
  }, [selectedNode, pushHistory, snapGrid]);

  const addSiblingNode = useCallback(() => {
    if (!selectedNode) return;
    addNodeAt(NODE_TEMPLATES.find((t) => t.kind !== 'free_text') || NODE_TEMPLATES[0], selectedNode.position.x, selectedNode.position.y + 160);
  }, [selectedNode, addNodeAt]);

  const deleteEdge = useCallback((edgeId: string) => {
    pushHistory();
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setSelectedEdgeId(null);
  }, [pushHistory]);

  const addFreeText = useCallback(() => {
    const p = lastCanvasClick || (selectedNode ? { x: selectedNode.position.x + 40, y: selectedNode.position.y - 110 } : { x: 380, y: 180 });
    addNodeAt(NODE_TEMPLATES.find((t) => t.type === 'free_text') || NODE_TEMPLATES[0], p.x, p.y);
  }, [lastCanvasClick, selectedNode, addNodeAt]);

  const applyTemplate = useCallback((templateId: string) => {
    const tpl = allTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    pushHistory();
    setNodes(structuredClone(tpl.nodes));
    setEdges(structuredClone(tpl.edges));
    setSelectedNodeId(null);
    setEditingNodeId(null);
  }, [allTemplates, pushHistory]);

  const saveCurrentAsTemplate = useCallback(() => {
    const tpl: MapTemplate = {
      id: `custom-${Date.now()}`,
      label: `${name || 'Mind map'} Template`,
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };
    const next = [...customTemplates, tpl];
    setCustomTemplates(next);
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    toast({ title: 'Template created', description: 'This mind map is now reusable from templates.' });
  }, [customTemplates, name, nodes, edges, toast]);

  const worldFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const nearestNodeIdAtPoint = useCallback((x: number, y: number, excludeId?: string): string | null => {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      if (n.id === excludeId) continue;
      const withinX = x >= n.position.x && x <= n.position.x + NODE_WIDTH;
      const withinY = y >= n.position.y && y <= n.position.y + NODE_HEIGHT;
      if (withinX && withinY) return n.id;
    }
    return null;
  }, [nodes]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setHistory((prev) => {
          if (!prev.length) return prev;
          const latest = prev[prev.length - 1];
          setFuture((f) => [{ nodes: structuredClone(nodes), edges: structuredClone(edges) }, ...f.slice(0, 49)]);
          setNodes(latest.nodes);
          setEdges(latest.edges);
          return prev.slice(0, -1);
        });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setFuture((prev) => {
          if (!prev.length) return prev;
          const latest = prev[0];
          setHistory((h) => [...h.slice(-49), { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
          setNodes(latest.nodes);
          setEdges(latest.edges);
          return prev.slice(1);
        });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          deleteNode(selectedNodeId);
        } else if (selectedEdgeId) {
          e.preventDefault();
          deleteEdge(selectedEdgeId);
        }
      }
      if (!selectedNodeId) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        addChildNode();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        addSiblingNode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const n = nodes.find((x) => x.id === selectedNodeId);
        if (!n) return;
        e.preventDefault();
        setClipboardNode(structuredClone(n));
        toast({ title: 'Copied', description: 'Node copied.' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (!clipboardNode) return;
        e.preventDefault();
        addNodeAt(
          NODE_TEMPLATES.find((t) => t.type === clipboardNode.type) || NODE_TEMPLATES[0],
          clipboardNode.position.x + 30,
          clipboardNode.position.y + 30,
        );
      }
      if (e.key === 'Escape') {
        setLinkFrom(null);
        setReconnectingEdge(null);
        setContextMenu(null);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeId, selectedEdgeId, nodes, edges, deleteNode, deleteEdge, addChildNode, addSiblingNode, clipboardNode, addNodeAt, toast]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-50 overflow-x-hidden">
      <div className="bg-white border-b border-neutral-200 px-3 sm:px-5 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" onClick={() => navigate('/workflows')} className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="text-xl font-semibold border-none shadow-none min-w-0 flex-1" />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="hidden md:block border-none shadow-none text-sm text-neutral-500 min-w-0 flex-1" placeholder="Describe this map..." />
          </div>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              className="md:hidden"
              onClick={() => {
                setShowMobilePalette((open) => !open);
                setShowMobileShortcuts(false);
              }}
            >
              <Layers className="h-4 w-4 mr-2" />
              Blocks
            </Button>
            <Button
              variant="outline"
              className="md:hidden"
              onClick={() => {
                setShowMobileShortcuts((open) => !open);
                setShowMobilePalette(false);
              }}
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Shortcuts
            </Button>
            <Badge variant="secondary">Mind Map Mode</Badge>
            <Button variant="outline" onClick={saveCurrentAsTemplate}>
              <Copy className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Save as Template</span>
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative min-w-0">
        <aside className={`${showMobilePalette ? 'absolute inset-y-0 left-0 z-20 w-[min(20rem,100%)] shadow-xl' : 'hidden'} md:static md:block md:shadow-none w-80 border-r border-neutral-200 bg-white p-4 overflow-y-auto space-y-4`}>
          <h3 className="text-sm font-semibold text-neutral-700">Mind Map Blocks</h3>
          <div className="hidden md:block rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">
            Drag maps freely, double-click text to edit, drag from bottom handle to another node to connect.
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Template</label>
            <div className="flex gap-2 mt-1">
              <select
                className="w-full rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {allTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={() => applyTemplate(selectedTemplateId)}>
                Load
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-600">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={snapGrid} onChange={(e) => setSnapGrid(e.target.checked)} />
              Snap to grid
            </label>
            <span>{Math.round(zoom * 100)}%</span>
          </div>

          {(['starting', 'flow', 'logic'] as TemplateCategory[]).map((cat) => (
            <div key={cat} className="space-y-2">
              <p className="text-xs uppercase font-semibold text-neutral-500">{cat === 'starting' ? 'Starting points' : cat === 'flow' ? 'Flow blocks' : 'Logic'}</p>
              {NODE_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                <Card
                  key={t.type}
                  className="cursor-pointer hover:shadow-md"
                  onClick={() => {
                    const target = lastCanvasClick || { x: 420, y: 200 };
                    addNodeAt(t, target.x, target.y);
                  }}
                >
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-neutral-500">{t.description}</p>
                    </div>
                    <Plus className="h-4 w-4 text-neutral-500" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </aside>

        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden min-w-0 touch-none bg-[linear-gradient(rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:20px_20px]"
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null });
          }}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).dataset.canvasNode === 'true') return;
            setLastCanvasClick(worldFromClient(e.clientX, e.clientY));
            setPanning(true);
            setPanOrigin({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            setContextMenu(null);
          }}
          onMouseMove={(e) => {
            if (panning) setPan({ x: e.clientX - panOrigin.x, y: e.clientY - panOrigin.y });
            const world = worldFromClient(e.clientX, e.clientY);
            if (draggingNodeId) {
              const x = world.x - dragOffset.x;
              const y = world.y - dragOffset.y;
              const cx = x + NODE_WIDTH / 2;
              const cy = y + NODE_HEIGHT / 2;
              const others = nodes.filter((n) => n.id !== draggingNodeId);
              const threshold = 10;
              const alignedX = others.find((n) => Math.abs((n.position.x + NODE_WIDTH / 2) - cx) <= threshold);
              const alignedY = others.find((n) => Math.abs((n.position.y + NODE_HEIGHT / 2) - cy) <= threshold);
              setDragGuides({
                x: alignedX ? alignedX.position.x + NODE_WIDTH / 2 : null,
                y: alignedY ? alignedY.position.y + NODE_HEIGHT / 2 : null,
              });
              setNodes((prev) =>
                prev.map((n) => (n.id === draggingNodeId ? { ...n, position: { x: snapGrid ? Math.round(x / 20) * 20 : x, y: snapGrid ? Math.round(y / 20) * 20 : y } } : n)),
              );
            }
            if (linkFrom || reconnectingEdge) setLinkCursor(world);
          }}
          onMouseUp={() => {
            if (reconnectingEdge) {
              const edge = edges.find((e) => e.id === reconnectingEdge.edgeId);
              if (edge) {
                const staticNodeId = reconnectingEdge.end === 'source' ? edge.target : edge.source;
                const dropNodeId = nearestNodeIdAtPoint(linkCursor.x, linkCursor.y, staticNodeId);
                if (dropNodeId && dropNodeId !== staticNodeId) {
                  pushHistory();
                  setEdges((prev) => {
                    const current = prev.find((e) => e.id === edge.id);
                    if (!current) return prev;
                    const nextSource = reconnectingEdge.end === 'source' ? dropNodeId : current.source;
                    const nextTarget = reconnectingEdge.end === 'target' ? dropNodeId : current.target;
                    if (nextSource === nextTarget) return prev;
                    const duplicate = prev.some((e) => e.id !== edge.id && e.source === nextSource && e.target === nextTarget);
                    if (duplicate) return prev;
                    return prev.map((e) => (e.id === edge.id ? { ...e, source: nextSource, target: nextTarget } : e));
                  });
                }
              }
              setReconnectingEdge(null);
            }
            setPanning(false);
            setDraggingNodeId(null);
            setDragGuides({ x: null, y: null });
          }}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.08 : 0.08;
            setZoom((z) => Math.min(2.3, Math.max(0.35, z + delta)));
          }}
          onTouchStart={(e) => {
            if (e.touches.length === 2) {
              pinchRef.current = { distance: touchDistance(e.touches[0], e.touches[1]), zoom };
              touchPanRef.current = null;
              setPanning(false);
              return;
            }
            if (e.touches.length === 1 && !(e.target as HTMLElement).closest('[data-canvas-node="true"]')) {
              const t = e.touches[0];
              touchPanRef.current = { x: t.clientX, y: t.clientY, panX: pan.x, panY: pan.y };
              setPanning(true);
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 2 && pinchRef.current) {
              e.preventDefault();
              const dist = touchDistance(e.touches[0], e.touches[1]);
              const ratio = dist / Math.max(1, pinchRef.current.distance);
              setZoom(Math.min(2.3, Math.max(0.35, pinchRef.current.zoom * ratio)));
              return;
            }
            if (e.touches.length === 1 && touchPanRef.current) {
              e.preventDefault();
              const t = e.touches[0];
              setPan({
                x: touchPanRef.current.panX + (t.clientX - touchPanRef.current.x),
                y: touchPanRef.current.panY + (t.clientY - touchPanRef.current.y),
              });
            }
          }}
          onTouchEnd={() => {
            pinchRef.current = null;
            touchPanRef.current = null;
            setPanning(false);
          }}
        >
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }} className="absolute inset-0">
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <marker id="mind-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="#5b6ef5" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const src = nodes.find((n) => n.id === edge.source);
                const tgt = nodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                const x1 = src.position.x + NODE_WIDTH / 2;
                const y1 = src.position.y + NODE_HEIGHT;
                const x2 = tgt.position.x + NODE_WIDTH / 2;
                const y2 = tgt.position.y;
                const d = bezierPath(x1, y1, x2, y2);
                return (
                  <g key={edge.id}>
                    <path
                      d={d}
                      stroke={selectedEdgeId === edge.id ? '#ef4444' : '#5b6ef5'}
                      strokeWidth={selectedEdgeId === edge.id ? 3 : 2.2}
                      fill="none"
                      markerEnd="url(#mind-arrow)"
                      style={{ pointerEvents: 'none' }}
                    />
                    <path
                      d={d}
                      stroke="transparent"
                      strokeWidth={16}
                      fill="none"
                      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                      onMouseDown={(ev) => {
                        ev.stopPropagation();
                        setSelectedEdgeId(edge.id);
                        setSelectedNodeId(null);
                      }}
                    />
                    {selectedEdgeId === edge.id && (
                      <>
                        <circle
                          cx={x1}
                          cy={y1}
                          r={6}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth={2}
                          style={{ cursor: 'grab', pointerEvents: 'auto' }}
                          onMouseDown={(ev) => {
                            ev.stopPropagation();
                            setReconnectingEdge({ edgeId: edge.id, end: 'source' });
                            setLinkCursor({ x: x1, y: y1 });
                          }}
                        />
                        <circle
                          cx={x2}
                          cy={y2}
                          r={6}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth={2}
                          style={{ cursor: 'grab', pointerEvents: 'auto' }}
                          onMouseDown={(ev) => {
                            ev.stopPropagation();
                            setReconnectingEdge({ edgeId: edge.id, end: 'target' });
                            setLinkCursor({ x: x2, y: y2 });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              })}
              {linkFrom ? (() => {
                const src = nodes.find((n) => n.id === linkFrom);
                if (!src) return null;
                return (
                  <path
                    d={bezierPath(src.position.x + NODE_WIDTH / 2, src.position.y + NODE_HEIGHT, linkCursor.x, linkCursor.y)}
                    stroke="#8b5cf6"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    fill="none"
                  />
                );
              })() : null}
              {reconnectingEdge ? (() => {
                const edge = edges.find((e) => e.id === reconnectingEdge.edgeId);
                if (!edge) return null;
                const fixedNode = nodes.find((n) => n.id === (reconnectingEdge.end === 'source' ? edge.target : edge.source));
                if (!fixedNode) return null;
                const fromX = fixedNode.position.x + NODE_WIDTH / 2;
                const fromY = reconnectingEdge.end === 'source' ? fixedNode.position.y : fixedNode.position.y + NODE_HEIGHT;
                return (
                  <path
                    d={bezierPath(fromX, fromY, linkCursor.x, linkCursor.y)}
                    stroke="#ef4444"
                    strokeDasharray="7 4"
                    strokeWidth={2.2}
                    fill="none"
                  />
                );
              })() : null}
              {dragGuides.x !== null && (
                <line
                  x1={dragGuides.x}
                  y1={mapBounds.minY - 200}
                  x2={dragGuides.x}
                  y2={mapBounds.maxY + 200}
                  stroke="#22c55e"
                  strokeDasharray="6 5"
                  strokeWidth={1.5}
                />
              )}
              {dragGuides.y !== null && (
                <line
                  x1={mapBounds.minX - 200}
                  y1={dragGuides.y}
                  x2={mapBounds.maxX + 200}
                  y2={dragGuides.y}
                  stroke="#22c55e"
                  strokeDasharray="6 5"
                  strokeWidth={1.5}
                />
              )}
            </svg>

            {nodes.map((node) => {
              const template = NODE_TEMPLATES.find((t) => t.type === node.type);
              const kind = (node.data as any)?.kind as MindNodeKind | undefined;
              const isText = kind === 'free_text' || node.type === 'free_text';
              const isCentral = kind === 'central' || node.type === 'central_topic';
              return (
                <div
                  key={node.id}
                  data-canvas-node="true"
                  className={`absolute rounded-xl border transition-all ${selectedNodeId === node.id ? 'ring-2 ring-indigo-500 border-indigo-300' : 'border-neutral-200'} ${isText ? 'bg-transparent border-dashed border-neutral-300 shadow-none' : 'bg-white shadow-sm'}`}
                  style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const world = worldFromClient(e.clientX, e.clientY);
                    setDraggingNodeId(node.id);
                    setDragOffset({ x: world.x - node.position.x, y: world.y - node.position.y });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                    setContextMenu(null);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingNodeId(node.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
                  }}
                >
                  {!isText && (
                    <button
                      type="button"
                      className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-sky-500 border-2 border-white"
                      onMouseUp={(e) => {
                        e.stopPropagation();
                        if (linkFrom && linkFrom !== node.id) {
                          pushHistory();
                          addEdge(linkFrom, node.id);
                          setLinkFrom(null);
                        }
                      }}
                      title="Drop connection here"
                    />
                  )}
                  <div className="p-3">
                    {!isText && (
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={`${template?.color || 'bg-neutral-100 text-neutral-700'} border-none`}>{isCentral ? 'Central' : 'Node'}</Badge>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="h-6 w-6 rounded-md hover:bg-neutral-100 inline-flex items-center justify-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              addNodeAt(NODE_TEMPLATES[4], node.position.x + 280, node.position.y + 110);
                            }}
                            title="Add box"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="h-6 w-6 rounded-md hover:bg-red-50 text-red-600 inline-flex items-center justify-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNode(node.id);
                            }}
                            title="Remove box"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                    {editingNodeId === node.id ? (
                      <textarea
                        autoFocus
                        value={node.label}
                        onChange={(e) => updateNodeLabel(node.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingNodeId(null);
                          }
                          if ((e.key === 'Enter' && !e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
                            e.preventDefault();
                            setEditingNodeId(null);
                          }
                        }}
                        onBlur={() => setEditingNodeId(null)}
                        className={`w-full resize-none border rounded-md px-2 py-1 text-sm ${isText ? 'min-h-[100px] bg-transparent border-neutral-300' : 'min-h-[64px] border-neutral-200'}`}
                      />
                    ) : (
                      <div className={`${isText ? 'text-base font-medium text-neutral-700 whitespace-pre-wrap' : 'text-sm font-medium text-neutral-900'} min-h-[40px]`}>
                        <MindMapFormattedText text={node.label} className="font-medium" />
                      </div>
                    )}
                  </div>
                  {!isText && (
                    <button
                      type="button"
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-indigo-500 border-2 border-white"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setLinkFrom(node.id);
                      }}
                      title="Drag to connect"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {contextMenu && (
            <div
              className="fixed z-50 bg-white border border-neutral-200 rounded-lg shadow-lg min-w-[180px] p-1"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button className="w-full text-left px-3 py-2 rounded hover:bg-neutral-100 text-sm" onClick={() => { addChildNode(); setContextMenu(null); }}>
                Add child
              </button>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-neutral-100 text-sm" onClick={() => { addSiblingNode(); setContextMenu(null); }}>
                Add sibling
              </button>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-neutral-100 text-sm" onClick={() => { addFreeText(); setContextMenu(null); }}>
                Add text
              </button>
              {contextMenu.nodeId && (
                <button
                  className="w-full text-left px-3 py-2 rounded hover:bg-red-50 text-sm text-red-600"
                  onClick={() => {
                    deleteNode(contextMenu.nodeId!);
                    setContextMenu(null);
                  }}
                >
                  Delete box
                </button>
              )}
            </div>
          )}
          {/* Minimap */}
          <div className="hidden md:block absolute right-4 bottom-4 w-52 h-36 rounded-lg border border-neutral-300 bg-white/95 backdrop-blur p-2">
            <div className="text-[10px] text-neutral-500 mb-1">Minimap</div>
            <svg viewBox={`0 0 ${Math.max(1, mapBounds.maxX - mapBounds.minX)} ${Math.max(1, mapBounds.maxY - mapBounds.minY)}`} className="w-full h-[112px] rounded bg-neutral-50">
              {edges.map((edge) => {
                const src = nodes.find((n) => n.id === edge.source);
                const tgt = nodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                const x1 = src.position.x + NODE_WIDTH / 2 - mapBounds.minX;
                const y1 = src.position.y + NODE_HEIGHT / 2 - mapBounds.minY;
                const x2 = tgt.position.x + NODE_WIDTH / 2 - mapBounds.minX;
                const y2 = tgt.position.y + NODE_HEIGHT / 2 - mapBounds.minY;
                return <line key={`mini-${edge.id}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" strokeWidth="2" />;
              })}
              {nodes.map((n) => (
                <rect
                  key={`mini-node-${n.id}`}
                  x={n.position.x - mapBounds.minX}
                  y={n.position.y - mapBounds.minY}
                  width={Math.max(18, NODE_WIDTH * 0.28)}
                  height={Math.max(10, NODE_HEIGHT * 0.25)}
                  fill={selectedNodeId === n.id ? '#4f46e5' : '#cbd5e1'}
                  rx="3"
                />
              ))}
            </svg>
          </div>
        </div>

        <aside className={`${showMobileShortcuts ? 'absolute inset-y-0 right-0 z-20 w-[min(18rem,100%)] shadow-xl' : 'hidden'} md:static md:block md:shadow-none w-72 border-l border-neutral-200 bg-white p-4 overflow-y-auto`}>
          <h3 className="text-sm font-semibold mb-3">Map Controls</h3>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={addChildNode} disabled={!selectedNode}>
              <GitBranch className="h-4 w-4 mr-2" />
              Add Child (Tab)
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={addSiblingNode} disabled={!selectedNode}>
              <Copy className="h-4 w-4 mr-2" />
              Add Sibling (Enter)
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={addFreeText}>
              <PenSquare className="h-4 w-4 mr-2" />
              Add Text
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => selectedNodeId && deleteNode(selectedNodeId)} disabled={!selectedNodeId}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => selectedEdgeId && deleteEdge(selectedEdgeId)} disabled={!selectedEdgeId}>
              <Unlink className="h-4 w-4 mr-2" />
              Delete Selected Link
            </Button>
          </div>
          <div className="mt-5 space-y-1 text-xs text-neutral-500">
            <p>Shortcuts:</p>
            <p>`Tab`: child, `Enter`: sibling</p>
            <p>`Del`: remove, `Ctrl/Cmd+C/V`: copy/paste</p>
            <p>`Ctrl/Cmd+Z/Y`: undo/redo</p>
              <p>Click a link, drag blue dots to reconnect.</p>
            <p>Double-click node text to edit inline.</p>
          </div>
          {selectedNode && (
            <div className="mt-4 rounded-lg border border-neutral-200 p-3">
              <p className="text-xs uppercase text-neutral-500 mb-1">Selected</p>
              <p className="text-sm font-medium">
                <MindMapFormattedText text={selectedNode.label} />
              </p>
              <p className="text-xs text-neutral-500">{selectedNode.type}</p>
            </div>
          )}
          {selectedNode && ((selectedNode.data as any)?.kind === 'free_text' || selectedNode.type === 'free_text') && (
            <div className="mt-3 rounded-lg border border-neutral-200 p-3 space-y-2">
              <p className="text-xs uppercase text-neutral-500">Text tools</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="w-full font-bold"
                  onClick={() => updateNodeLabel(selectedNode.id, toggleMindMapWrap(selectedNode.label, '**'))}
                >
                  Bold
                </Button>
                <Button
                  variant="outline"
                  className="w-full italic"
                  onClick={() => updateNodeLabel(selectedNode.id, toggleMindMapWrap(selectedNode.label, '*'))}
                >
                  Italic
                </Button>
              </div>
            </div>
          )}
          {selectedEdge && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-700">Selected link: {selectedEdge.source} → {selectedEdge.target}</p>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))} className="w-full">
              -
            </Button>
            <Button variant="outline" onClick={() => setZoom((z) => Math.min(2.3, z + 0.1))} className="w-full">
              +
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default WorkflowBuilder;
