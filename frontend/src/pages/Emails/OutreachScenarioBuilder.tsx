import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/hooks/use-toast';
import { leadsAPI, type Lead } from '@/services/api/leads';
import emailAPI from '@/services/emailAPI';
import {
  outreachAPI,
  type ScenarioModule,
  type ScenarioModuleType,
} from '@/services/api/outreach';

const MODULE_TYPES: { value: ScenarioModuleType; label: string }[] = [
  { value: 'trigger_manual', label: 'Manual trigger' },
  { value: 'wait', label: 'Wait' },
  { value: 'router_has_email', label: 'Router: has email' },
  { value: 'send_email', label: 'Send email' },
  { value: 'ai_rewrite', label: 'AI rewrite' },
  { value: 'update_lead', label: 'Update lead' },
  { value: 'stop_on_reply', label: 'Stop on reply' },
  { value: 'ab_subject', label: 'A/B subject' },
];

function newModuleId(): string {
  return `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultConfig(type: ScenarioModuleType): Record<string, unknown> {
  switch (type) {
    case 'wait':
      return { amount: 1, unit: 'hours' };
    case 'send_email':
      return { account_id: null, subject: '', body: '', format: 'text', ab_subjects: '' };
    case 'update_lead':
      return { field: 'status', value: '' };
    case 'ai_rewrite':
      return { instruction: 'Make this more concise and friendly.' };
    case 'ab_subject':
      return { subjects: '' };
    default:
      return {};
  }
}

function ModuleConfigEditor({
  module,
  accounts,
  onChange,
}: {
  module: ScenarioModule;
  accounts: { id: number; email: string; display_name: string }[];
  onChange: (config: Record<string, unknown>) => void;
}) {
  const cfg = module.config || {};

  if (module.type === 'wait') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Amount</Label>
          <Input
            type="number"
            min={1}
            value={String(cfg.amount ?? 1)}
            onChange={(e) => onChange({ ...cfg, amount: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Unit</Label>
          <Select
            value={String(cfg.unit ?? 'hours')}
            onValueChange={(v) => onChange({ ...cfg, unit: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (module.type === 'send_email') {
    return (
      <div className="space-y-3">
        <div>
          <Label>Mailbox</Label>
          <Select
            value={cfg.account_id != null ? String(cfg.account_id) : ''}
            onValueChange={(v) => onChange({ ...cfg, account_id: v ? Number(v) : null })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.display_name ? `${a.display_name} (${a.email})` : a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Subject</Label>
          <Input
            value={String(cfg.subject ?? '')}
            onChange={(e) => onChange({ ...cfg, subject: e.target.value })}
          />
        </div>
        <div>
          <Label>Format</Label>
          <Select
            value={String(cfg.format ?? 'text')}
            onValueChange={(v) => onChange({ ...cfg, format: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="html">HTML</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Body</Label>
          <Textarea
            className="min-h-[120px] font-mono text-sm"
            value={String(cfg.body ?? '')}
            onChange={(e) => onChange({ ...cfg, body: e.target.value })}
          />
        </div>
        <div>
          <Label>A/B subjects (comma-separated, optional)</Label>
          <Input
            value={String(cfg.ab_subjects ?? '')}
            onChange={(e) => onChange({ ...cfg, ab_subjects: e.target.value })}
            placeholder="Subject A, Subject B"
          />
        </div>
      </div>
    );
  }

  if (module.type === 'update_lead') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Field</Label>
          <Input
            value={String(cfg.field ?? 'status')}
            onChange={(e) => onChange({ ...cfg, field: e.target.value })}
          />
        </div>
        <div>
          <Label>Value</Label>
          <Input
            value={String(cfg.value ?? '')}
            onChange={(e) => onChange({ ...cfg, value: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (module.type === 'ai_rewrite') {
    return (
      <div>
        <Label>Instruction</Label>
        <Textarea
          value={String(cfg.instruction ?? '')}
          onChange={(e) => onChange({ ...cfg, instruction: e.target.value })}
          placeholder="Rewrite to be shorter and more personal"
        />
      </div>
    );
  }

  if (module.type === 'ab_subject') {
    return (
      <div>
        <Label>Subject variants (comma-separated)</Label>
        <Input
          value={String(cfg.subjects ?? '')}
          onChange={(e) => onChange({ ...cfg, subjects: e.target.value })}
        />
      </div>
    );
  }

  return (
    <p className="text-sm text-gray-500">
      {module.type === 'trigger_manual' && 'Starts when you run the scenario manually.'}
      {module.type === 'router_has_email' && 'Routes leads with an email address to the next branch.'}
      {module.type === 'stop_on_reply' && 'Stops the flow when the lead replies.'}
    </p>
  );
}

export function OutreachScenarioBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNew = id === 'new';
  const editingId = !isNew && id ? Number(id) : null;
  const isEdit = editingId != null && Number.isFinite(editingId) && editingId > 0;

  const [name, setName] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'paused'>('draft');
  const [modules, setModules] = useState<ScenarioModule[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runLeadIds, setRunLeadIds] = useState('');
  const [runAccountId, setRunAccountId] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [showRunPanel, setShowRunPanel] = useState(false);

  const { data: scenario, isLoading } = useQuery({
    queryKey: ['outreach-scenario', editingId],
    queryFn: () => outreachAPI.getScenario(editingId as number),
    enabled: isEdit,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  const { data: leadsData } = useQuery({
    queryKey: ['outreach-builder-leads'],
    queryFn: () => leadsAPI.getLeads({ skip: 0, limit: 200, sort_by: 'first_name', sort_desc: false }),
    enabled: showRunPanel,
  });
  const leads: Lead[] = leadsData?.results ?? [];

  useEffect(() => {
    if (!scenario) return;
    setName(scenario.name || '');
    setStatus((scenario.status as 'draft' | 'active' | 'paused') || 'draft');
    setModules(scenario.flow_definition?.modules ?? []);
  }, [scenario]);

  useEffect(() => {
    if (isNew && modules.length === 0) {
      setModules([{ id: newModuleId(), type: 'trigger_manual', config: {} }]);
    }
  }, [isNew, modules.length]);

  useEffect(() => {
    if (!runAccountId && accounts.length) {
      setRunAccountId(String(accounts[0].id));
    }
  }, [accounts, runAccountId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim() || 'Untitled scenario',
        status,
        flow_definition: { modules },
      };
      return isEdit
        ? outreachAPI.updateScenario(editingId as number, payload)
        : outreachAPI.createScenario(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['outreach-scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-scenario', saved.id] });
      toast({ title: 'Scenario saved' });
      if (!isEdit) navigate(`/emails/scenarios/${saved.id}`, { replace: true });
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!isEdit) throw new Error('Save the scenario first.');
      return outreachAPI.updateScenario(editingId as number, {
        name: name.trim(),
        status: 'active',
        flow_definition: { modules },
      });
    },
    onSuccess: () => {
      setStatus('active');
      queryClient.invalidateQueries({ queryKey: ['outreach-scenarios'] });
      toast({ title: 'Scenario activated' });
    },
  });

  const runMutation = useMutation({
    mutationFn: () => {
      if (!isEdit) throw new Error('Save the scenario before running.');
      const fromCheckbox = Array.from(selectedLeadIds);
      const fromText = runLeadIds
        .split(/[,\s]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const lead_ids = fromCheckbox.length ? fromCheckbox : fromText;
      if (!lead_ids.length) throw new Error('Select or enter at least one lead ID.');
      return outreachAPI.runScenario(editingId as number, {
        lead_ids,
        account_id: runAccountId ? Number(runAccountId) : undefined,
      });
    },
    onSuccess: (run) => {
      toast({ title: 'Run started', description: `Run #${run.id} is ${run.status}.` });
      navigate('/emails/runs');
    },
    onError: (error: Error) => {
      toast({ title: 'Run failed', description: error.message, variant: 'destructive' });
    },
  });

  const addModule = (type: ScenarioModuleType) => {
    const mod: ScenarioModule = { id: newModuleId(), type, config: defaultConfig(type) };
    setModules((prev) => [...prev, mod]);
    setExpandedId(mod.id);
  };

  const moveModule = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= modules.length) return;
    setModules((prev) => {
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };

  const updateModule = (id: string, patch: Partial<ScenarioModule>) => {
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const removeModule = (id: string) => {
    setModules((prev) => prev.filter((m) => m.id !== id));
  };

  if (isLoading && isEdit) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{isEdit ? 'Edit scenario' : 'New scenario'}</h1>
          <p className="mt-1 text-sm text-gray-600">Linear module list — reorder steps top to bottom.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate('/emails/scenarios')}>
          Back to list
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Modules</h2>
          <Select onValueChange={(v) => addModule(v as ScenarioModuleType)}>
            <SelectTrigger className="w-[200px]">
              <Plus className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Add module" />
            </SelectTrigger>
            <SelectContent>
              {MODULE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {modules.map((mod, index) => {
          const typeLabel = MODULE_TYPES.find((t) => t.value === mod.type)?.label ?? mod.type;
          const isExpanded = expandedId === mod.id;
          return (
            <Card key={mod.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-medium">
                    {index + 1}
                  </span>
                  <CardTitle className="text-base">{typeLabel}</CardTitle>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => moveModule(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === modules.length - 1}
                    onClick={() => moveModule(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeModule(mod.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="border-t pt-4">
                  <ModuleConfigEditor
                    module={mod}
                    accounts={accounts}
                    onChange={(config) => updateModule(mod.id, { config })}
                  />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!isEdit || activateMutation.isPending}
            onClick={() => activateMutation.mutate()}
          >
            Activate
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowRunPanel((v) => !v)}>
            <Play className="mr-2 h-4 w-4" />
            Run
          </Button>
        </CardContent>
      </Card>

      {showRunPanel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Run scenario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Send account (optional)</Label>
              <Select value={runAccountId} onValueChange={setRunAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Default mailbox" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.display_name ? `${a.display_name} (${a.email})` : a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Lead IDs (comma-separated)</Label>
              <Input
                value={runLeadIds}
                onChange={(e) => setRunLeadIds(e.target.value)}
                placeholder="101, 102, 103"
              />
            </div>

            {leads.length > 0 && (
              <div>
                <Label>Or select leads</Label>
                <div className="mt-2 max-h-48 overflow-auto rounded-md border">
                  <ul className="divide-y">
                    {leads.map((lead) => {
                      const label = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || `#${lead.id}`;
                      return (
                        <li key={lead.id} className="flex items-center gap-2 px-3 py-2">
                          <Checkbox
                            checked={selectedLeadIds.has(lead.id)}
                            disabled={!lead.email}
                            onCheckedChange={(checked) => {
                              setSelectedLeadIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(lead.id);
                                else next.delete(lead.id);
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm">
                            {label} {lead.email ? `· ${lead.email}` : '(no email)'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            <Button type="button" disabled={runMutation.isPending || !isEdit} onClick={() => runMutation.mutate()}>
              {runMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start run
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default OutreachScenarioBuilderPage;
