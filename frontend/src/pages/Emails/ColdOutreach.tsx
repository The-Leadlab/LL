import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Eye, Loader2, Mail, Search, Send, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/hooks/use-toast';
import { extractEmailErrorMessage } from '@/lib/emailError';
import { clientsAPI, type Client } from '@/services/api/clients';
import { leadsAPI, type Lead } from '@/services/api/leads';
import emailAPI from '@/services/emailAPI';
import { outreachAPI } from '@/services/api/outreach';

const MERGE_HINT = '{{first_name}}, {{last_name}}, {{full_name}}, {{company}}, {{email}}, {{job_title}}';
const BATCH_SIZE = 25;

function applyTokens(template: string, lead: Lead, asHtml: boolean): string {
  const first = (lead.first_name || '').trim();
  const last = (lead.last_name || '').trim();
  const tokens: Record<string, string> = {
    first_name: first,
    last_name: last,
    full_name: `${first} ${last}`.trim(),
    company: (lead.company || '').trim(),
    email: (lead.email || '').trim(),
    job_title: (lead.job_title || '').trim(),
  };
  return (template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const value = tokens[key.toLowerCase()] || '';
    if (!asHtml) return value;
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  });
}

async function fetchAllLeads(clientId?: number): Promise<Lead[]> {
  const collected: Lead[] = [];
  let skip = 0;
  const limit = 200;
  for (let i = 0; i < 50; i += 1) {
    const data = await leadsAPI.getLeads({
      skip,
      limit,
      client_id: clientId,
      sort_by: 'first_name',
      sort_desc: false,
    });
    const page = (data?.results || []) as Lead[];
    collected.push(...page);
    if (!data?.has_more || page.length === 0) break;
    skip += limit;
  }
  return collected;
}

export function ColdOutreachPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [accountId, setAccountId] = useState<string>('');
  const [clientId, setClientId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [format, setFormat] = useState<'text' | 'html'>('text');
  const [delaySeconds, setDelaySeconds] = useState('1');
  const [scheduleAt, setScheduleAt] = useState('');
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [sendWindowStart, setSendWindowStart] = useState('');
  const [sendWindowEnd, setSendWindowEnd] = useState('');
  const [maxPerHour, setMaxPerHour] = useState('');
  const [useQueue, setUseQueue] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [rewriteInstruction, setRewriteInstruction] = useState('Make this more concise and personal.');
  const [templateId, setTemplateId] = useState<string>('');

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId(String(accounts[0].id));
    }
  }, [accounts, accountId]);

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsAPI.list(false),
  });
  const clients: Client[] = clientsData?.items ?? [];

  const parsedClientId = clientId === 'all' ? undefined : Number(clientId);

  const {
    data: leads = [],
    isLoading: leadsLoading,
    isFetching: leadsFetching,
    refetch: refetchLeads,
  } = useQuery({
    queryKey: ['outreach-leads', parsedClientId ?? 'all'],
    queryFn: () => fetchAllLeads(parsedClientId),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['outreach-templates'],
    queryFn: outreachAPI.listTemplates,
  });

  const visibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => {
      const hay = [
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.company,
        lead.job_title,
        lead.client_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leads, search]);

  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedIds.has(lead.id)),
    [leads, selectedIds],
  );
  const previewLead = selectedLeads[0] || visibleLeads[0] || leads[0];
  const previewSubject = previewLead ? applyTokens(subject, previewLead, false) : subject;
  const previewBody = previewLead ? applyTokens(body, previewLead, format === 'html') : body;

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id || id === 'none') return;
    const tpl = templates.find((t) => String(t.id) === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
    setFormat((tpl.format as 'text' | 'html') || 'text');
    toast({ title: 'Template loaded', description: tpl.name });
  };

  const rewriteMutation = useMutation({
    mutationFn: () => {
      const lead = previewLead
        ? {
            first_name: previewLead.first_name,
            last_name: previewLead.last_name,
            company: previewLead.company,
            email: previewLead.email,
            job_title: previewLead.job_title,
          }
        : undefined;
      return outreachAPI.rewrite({
        subject: subject.trim(),
        body,
        instruction: rewriteInstruction.trim(),
        lead,
      });
    },
    onSuccess: (result) => {
      if (result.subject) setSubject(result.subject);
      if (result.body) setBody(result.body);
      toast({ title: 'AI rewrite applied', description: 'Review the updated subject and body before sending.' });
    },
    onError: (error) => {
      toast({
        title: 'Rewrite failed',
        description: extractEmailErrorMessage(error).description,
        variant: 'destructive',
      });
    },
  });

  const toggleLead = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectVisibleWithEmail = () => {
    setSelectedIds(new Set(visibleLeads.filter((lead) => Boolean(lead.email)).map((lead) => lead.id)));
  };

  const selectAllLoaded = () => {
    setSelectedIds(new Set(leads.filter((lead) => Boolean(lead.email)).map((lead) => lead.id)));
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error('Choose a sending mailbox first.');
      const ids = Array.from(selectedIds);
      if (!ids.length) throw new Error('Select at least one lead.');
      const delay = Math.max(0, Math.min(Number(delaySeconds) || 1, 3600));
      const scheduleIso = scheduleAt ? new Date(scheduleAt).toISOString() : null;
      if (scheduleAt && Number.isNaN(Date.parse(scheduleAt))) {
        throw new Error('Invalid schedule date/time.');
      }
      const timing = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        send_window_start: sendWindowStart || null,
        send_window_end: sendWindowEnd || null,
        weekdays_only: weekdaysOnly,
        max_per_hour: maxPerHour ? Number(maxPerHour) : null,
        schedule_at: scheduleIso,
        queue: Boolean(useQueue || scheduleIso),
      };

      let sent = 0;
      let failed = 0;
      let skipped = 0;
      let queued = 0;
      let batchId: string | undefined;
      setProgress({ done: 0, total: ids.length });
      setLastBatchId(null);

      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const result = await emailAPI.sendOutreach({
          account_id: Number(accountId),
          lead_ids: batch,
          subject: subject.trim(),
          body,
          format,
          delay_seconds: delay,
          ...timing,
        });
        sent += result.sent;
        failed += result.failed;
        skipped += result.skipped;
        queued += result.queued || 0;
        if (result.batch_id) batchId = result.batch_id;
        setProgress({ done: Math.min(i + batch.length, ids.length), total: ids.length });
      }
      return { sent, failed, skipped, queued, total: ids.length, batchId, mode: timing.queue ? 'queued' : 'immediate' };
    },
    onSuccess: (summary) => {
      setProgress(null);
      if (summary.batchId) setLastBatchId(summary.batchId);
      if (summary.mode === 'queued' || (summary.queued || 0) > 0) {
        toast({
          title: 'Campaign queued',
          description: `Queued ${summary.queued || summary.total} emails. The worker sends them on schedule with your pauses and send window.`,
        });
      } else {
        toast({
          title: 'Outreach finished',
          description: `Sent ${summary.sent} of ${summary.total}. Failed ${summary.failed}, skipped ${summary.skipped}.`,
        });
      }
    },
    onError: (error) => {
      setProgress(null);
      toast({
        title: 'Could not send outreach',
        description: extractEmailErrorMessage(error).description,
        variant: 'destructive',
      });
    },
  });

  const canPreview = Boolean(subject.trim() && body.trim());
  const canSend =
    Boolean(accountId) &&
    selectedIds.size > 0 &&
    canPreview &&
    !sendMutation.isPending;

  if (accountsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!accounts.length) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Connect a mailbox first</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-gray-600">
              Cold outreach sends from your connected Gmail/SMTP account. Add one under Settings → Integrations,
              then come back here.
            </p>
            <Button type="button" onClick={() => navigate('/settings/integrations')}>
              Open Integrations
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cold Outreach</h1>
          <p className="mt-1 text-sm text-gray-600">
            Load leads from a client (or pick them yourself), write one email, preview it, then send individually
            to each selected address.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate('/emails')}>
          Back to Inbox
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Recipients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Sync from client</Label>
              <Select
                value={clientId}
                onValueChange={(value) => {
                  setClientId(value);
                  setSelectedIds(new Set());
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All leads" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All leads</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={String(client.id)}>
                      {client.name}
                      {typeof client.lead_count === 'number' ? ` (${client.lead_count})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-gray-500">
                Choosing a client loads that client’s leads. You can still tick or untick people below.
              </p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search loaded leads"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectVisibleWithEmail}>
                Select visible with email
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={selectAllLoaded}>
                Select all loaded
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchLeads()}
                disabled={leadsFetching}
              >
                {leadsFetching ? 'Refreshing…' : 'Refresh leads'}
              </Button>
            </div>

            <div className="max-h-80 overflow-auto rounded-md border">
              {leadsLoading ? (
                <div className="flex items-center justify-center p-8 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading leads…
                </div>
              ) : visibleLeads.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No leads match this filter.</p>
              ) : (
                <ul className="divide-y">
                  {visibleLeads.map((lead) => {
                    const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unnamed lead';
                    const hasEmail = Boolean(lead.email);
                    return (
                      <li key={lead.id} className="flex items-start gap-3 px-3 py-2">
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          disabled={!hasEmail}
                          onCheckedChange={(checked) => toggleLead(lead.id, Boolean(checked))}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{name}</div>
                          <div className="truncate text-xs text-gray-500">
                            {lead.email || 'No email'} {lead.company ? `· ${lead.company}` : ''}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-sm text-gray-600">
              {selectedIds.size} selected · {leads.filter((lead) => lead.email).length} of {leads.length} loaded
              have an email
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Send from</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose mailbox" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.display_name ? `${account.display_name} (${account.email})` : account.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Load template (optional)</Label>
              <Select value={templateId || 'none'} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={String(tpl.id)}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Quick intro from {{company}}'s network"
              />
            </div>

            <div>
              <Label>Format</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as 'text' | 'html')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Simple text</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{format === 'html' ? 'HTML body' : 'Message'}</Label>
              <Textarea
                className="min-h-[220px] font-mono text-sm"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={
                  format === 'html'
                    ? '<p>Hi {{first_name}},</p><p>I wanted to reach out…</p>'
                    : 'Hi {{first_name}},\n\nI wanted to reach out…'
                }
              />
              <p className="mt-1 text-xs text-gray-500">Personalize with {MERGE_HINT}</p>
            </div>

            <div>
              <Label>AI rewrite instruction</Label>
              <Input
                value={rewriteInstruction}
                onChange={(event) => setRewriteInstruction(event.target.value)}
                placeholder="Make this shorter and friendlier"
              />
            </div>

            <div>
              <Label>Seconds between each send</Label>
              <Input
                type="number"
                min={0}
                max={3600}
                step={0.5}
                value={delaySeconds}
                onChange={(event) => setDelaySeconds(event.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Long delays auto-queue so the request does not block. Worker sends one-by-one.
              </p>
            </div>

            <div>
              <Label>Schedule start (optional)</Label>
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Send window start</Label>
                <Input
                  type="time"
                  value={sendWindowStart}
                  onChange={(event) => setSendWindowStart(event.target.value)}
                />
              </div>
              <div>
                <Label>Send window end</Label>
                <Input
                  type="time"
                  value={sendWindowEnd}
                  onChange={(event) => setSendWindowEnd(event.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={weekdaysOnly}
                onCheckedChange={(checked) => setWeekdaysOnly(Boolean(checked))}
              />
              <Label className="font-normal">Weekdays only (Mon–Fri)</Label>
            </div>

            <div>
              <Label>Max emails per hour (optional)</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={maxPerHour}
                onChange={(event) => setMaxPerHour(event.target.value)}
                placeholder="e.g. 30"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={useQueue || Boolean(scheduleAt)}
                disabled={Boolean(scheduleAt)}
                onCheckedChange={(checked) => setUseQueue(Boolean(checked))}
              />
              <Label className="font-normal">Queue via worker (Make-style delayed campaign)</Label>
            </div>

            {lastBatchId && (
              <p className="text-xs text-gray-600">
                Last batch: <code>{lastBatchId}</code>{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={async () => {
                    await emailAPI.cancelOutreachBatch(lastBatchId);
                    toast({ title: 'Batch cancelled', description: 'Pending jobs in this batch were cancelled.' });
                  }}
                >
                  Cancel pending
                </button>
              </p>
            )}

            {progress && (
              <p className="text-sm text-gray-600">
                Processing {progress.done} / {progress.total}…
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!canPreview || rewriteMutation.isPending}
                onClick={() => rewriteMutation.mutate()}
              >
                {rewriteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Rewrite with AI
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canPreview}
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="mr-2 h-4 w-4" />
                Preview email
              </Button>
              <Button
                type="button"
                disabled={!canSend}
                onClick={() => {
                  const verb = scheduleAt || useQueue ? 'Queue' : 'Send';
                  if (!window.confirm(`${verb} this email for ${selectedIds.size} lead${selectedIds.size === 1 ? '' : 's'}?`)) {
                    return;
                  }
                  sendMutation.mutate();
                }}
              >
                {sendMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {scheduleAt || useQueue ? `Queue ${selectedIds.size || 0}` : `Send to ${selectedIds.size || 0}`}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/email-sequences')}>
                Open Sequences
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/emails/scenarios')}>
                Scenarios
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
            <DialogDescription>
              {previewLead
                ? `Showing merge fields for ${previewLead.first_name || ''} ${previewLead.last_name || ''} (${previewLead.email || 'no email'}).`
                : 'Select a lead to see personalized merge fields.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase text-gray-500">Subject</div>
              <div className="font-medium">{previewSubject || '(empty subject)'}</div>
            </div>
            {format === 'html' ? (
              <iframe
                title="HTML preview"
                sandbox=""
                className="h-80 w-full rounded-md border bg-white"
                srcDoc={previewBody}
              />
            ) : (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-sm">
                {previewBody || '(empty message)'}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ColdOutreachPage;
