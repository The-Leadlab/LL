import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, FileSpreadsheet, Loader2, Mail, Search, Send, Sparkles, Upload, Users } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/hooks/use-toast';
import { extractEmailErrorMessage } from '@/lib/emailError';
import { clientsAPI, type Client } from '@/services/api/clients';
import { leadsAPI, type Lead } from '@/services/api/leads';
import emailAPI from '@/services/emailAPI';
import { outreachAPI, type LeadImportPreview } from '@/services/api/outreach';

const MERGE_FIELDS = [
  { token: 'first_name', label: 'First name' },
  { token: 'last_name', label: 'Last name' },
  { token: 'full_name', label: 'Full name' },
  { token: 'email', label: 'Email' },
  { token: 'company', label: 'Company' },
  { token: 'job_title', label: 'Job title' },
  { token: 'id', label: 'Lead ID' },
  { token: 'unique_lead_id', label: 'Sheet / external ID' },
] as const;

const BATCH_SIZE = 25;
const IMPORT_FIELD_OPTIONS = [
  { value: 'skip', label: 'Ignore this column' },
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'full_name', label: 'Full name' },
  { value: 'company', label: 'Company' },
  { value: 'job_title', label: 'Job title' },
  { value: 'unique_lead_id', label: 'Sheet / external ID' },
  { value: 'telephone', label: 'Phone' },
  { value: 'linkedin', label: 'LinkedIn' },
];

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
    id: String(lead.id),
    unique_lead_id: (lead.unique_lead_id || '').trim(),
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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
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
  const [pasteEmails, setPasteEmails] = useState('');
  const [sheetChoice, setSheetChoice] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetRange, setSheetRange] = useState('Sheet1!A1:Z500');
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [importPreview, setImportPreview] = useState<LeadImportPreview | null>(null);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [pendingImport, setPendingImport] = useState<{
    kind: 'text' | 'sheet';
    text?: string;
    source?: string;
    spreadsheet_id?: string;
  } | null>(null);

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId(String(accounts[0].id));
    }
  }, [accounts, accountId]);

  const selectedAccount = accounts.find((account) => String(account.id) === accountId);

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

  const { data: googleStatus } = useQuery({
    queryKey: ['outreach-google-status'],
    queryFn: outreachAPI.googleStatus,
  });

  const { data: sheetsCatalog } = useQuery({
    queryKey: ['outreach-google-spreadsheets'],
    queryFn: outreachAPI.listSpreadsheets,
    enabled: Boolean(googleStatus?.connected),
  });
  const sheetFiles = sheetsCatalog?.files || [];
  const sheetsReady = Boolean(googleStatus?.connected && googleStatus?.has_sheets_scope);

  useEffect(() => {
    const oauth = searchParams.get('sheets_oauth') || searchParams.get('email_oauth');
    if (!oauth) return;
    if (oauth === 'success') {
      toast({ title: 'Google connected', description: 'You can import a spreadsheet on this page.' });
      queryClient.invalidateQueries({ queryKey: ['outreach-google-status'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-google-spreadsheets'] });
    } else {
      toast({
        title: 'Google connection failed',
        description: searchParams.get('reason') || 'Please try again.',
        variant: 'destructive',
      });
    }
    setSearchParams({}, { replace: true });
  }, [queryClient, searchParams, setSearchParams, toast]);

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

  const importClientId = parsedClientId;

  const closeImportPreview = () => {
    setImportPreview(null);
    setPendingImport(null);
    setImportMapping({});
  };

  const applyImportedLeads = async (result: {
    imported: number;
    skipped: number;
    updated?: number;
    lead_ids: number[];
  }) => {
    setPasteEmails('');
    closeImportPreview();
    await refetchLeads();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      result.lead_ids.forEach((id) => next.add(id));
      return next;
    });
    const updated = result.updated || 0;
    toast({
      title: 'Leads ready',
      description: `Imported ${result.imported}${updated ? `, filled names on ${updated} existing` : ''}, already in CRM ${result.skipped}. They are selected in the table.`,
    });
  };

  const importTextMutation = useMutation({
    mutationFn: (payload: { text: string; source: string; mapping?: Record<string, string> }) =>
      outreachAPI.importLeadsFromText(payload.text, payload.source, {
        mapping: payload.mapping,
        client_id: importClientId,
      }),
    onSuccess: applyImportedLeads,
    onError: (error) => {
      toast({
        title: 'Could not add emails',
        description: extractEmailErrorMessage(error).description,
        variant: 'destructive',
      });
    },
  });

  const importSheetMutation = useMutation({
    mutationFn: (payload: { spreadsheet_id: string; mapping?: Record<string, string> }) =>
      outreachAPI.importGoogleSheet({
        spreadsheet_id: payload.spreadsheet_id,
        range: sheetRange.trim() || 'Sheet1!A1:Z500',
        mapping: payload.mapping,
        client_id: importClientId,
      }),
    onSuccess: applyImportedLeads,
    onError: (error) => {
      toast({
        title: 'Sheet import failed',
        description: extractEmailErrorMessage(error).description,
        variant: 'destructive',
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: (payload: { text?: string; spreadsheet_id?: string; source?: string }) =>
      outreachAPI.previewLeads({
        text: payload.text,
        spreadsheet_id: payload.spreadsheet_id,
        range: sheetRange.trim() || undefined,
      }),
    onSuccess: (preview, variables) => {
      setImportPreview(preview);
      setImportMapping({ ...preview.mapping });
      setPendingImport(
        variables.spreadsheet_id
          ? { kind: 'sheet', spreadsheet_id: variables.spreadsheet_id }
          : { kind: 'text', text: variables.text, source: variables.source || 'outreach_paste' },
      );
    },
    onError: (error) => {
      toast({
        title: 'Could not read columns',
        description: extractEmailErrorMessage(error).description,
        variant: 'destructive',
      });
    },
  });

  const openPreviewFromText = (text: string, source: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    previewMutation.mutate({ text: trimmed, source });
  };

  const connectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const result = await emailAPI.initGoogleOAuth('/emails/outreach');
      window.location.href = result.authorization_url;
    } catch (error) {
      setConnectingGoogle(false);
      toast({
        title: 'Could not start Google sign-in',
        description: extractEmailErrorMessage(error).description,
        variant: 'destructive',
      });
    }
  };

  const selectedSheetId = sheetUrl.trim() || sheetChoice || googleStatus?.spreadsheet_id || '';

  const insertMergeToken = (token: string) => {
    setBody((prev) => {
      if (!prev) return `{{${token}}}`;
      const spacer = prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' ';
      return `${prev}${spacer}{{${token}}}`;
    });
  };

  const confirmImportPreview = () => {
    if (!pendingImport) return;
    const mapping = Object.fromEntries(
      Object.entries(importMapping).filter(([, field]) => field && field !== 'skip'),
    );
    if (pendingImport.kind === 'sheet' && pendingImport.spreadsheet_id) {
      importSheetMutation.mutate({ spreadsheet_id: pendingImport.spreadsheet_id, mapping });
      return;
    }
    if (pendingImport.text) {
      importTextMutation.mutate({
        text: pendingImport.text,
        source: pendingImport.source || 'outreach_paste',
        mapping,
      });
    }
  };

  const onCsvFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text.trim()) {
        toast({ title: 'Empty file', variant: 'destructive' });
        return;
      }
      openPreviewFromText(text, 'csv_upload');
    };
    reader.readAsText(file);
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

            <div className="space-y-2 rounded-md border border-dashed p-3">
              <Label>Add people from CSV, paste, or Google Sheets</Label>
              <p className="text-xs text-gray-500">
                Include first name, last name, email, company, and an ID column if you have one. We detect those
                headers the same way a spreadsheet import would, then you can write Hi {'{{first_name}}'}.
              </p>
              <Textarea
                value={pasteEmails}
                onChange={(event) => setPasteEmails(event.target.value)}
                placeholder={'email,first_name,last_name,company\nada@example.com,Ada,Lovelace,Analytical\n\nAli Attia <ali@the-leadlab.com>'}
                className="min-h-[96px] font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pasteEmails.trim() || previewMutation.isPending || importTextMutation.isPending}
                  onClick={() => openPreviewFromText(pasteEmails, 'outreach_paste')}
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-3 w-3" />
                  )}
                  Preview pasted rows
                </Button>
                <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm">
                  <FileSpreadsheet className="mr-1 h-3 w-3" />
                  Upload CSV
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={(event) => {
                      onCsvFile(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>

              <div className="space-y-2 border-t pt-3">
                <Label>Google Sheet</Label>
                {sheetsReady ? (
                  <>
                    {sheetFiles.length > 0 && (
                      <Select value={sheetChoice || undefined} onValueChange={setSheetChoice}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a spreadsheet" />
                        </SelectTrigger>
                        <SelectContent>
                          {sheetFiles.map((file) => (
                            <SelectItem key={file.id} value={file.id}>
                              {file.name || file.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      value={sheetUrl}
                      onChange={(event) => setSheetUrl(event.target.value)}
                      placeholder="Or paste a Sheets URL"
                    />
                    <Input
                      value={sheetRange}
                      onChange={(event) => setSheetRange(event.target.value)}
                      placeholder="Sheet1!A1:Z500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedSheetId || previewMutation.isPending}
                      onClick={() => previewMutation.mutate({ spreadsheet_id: selectedSheetId })}
                    >
                      {previewMutation.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="mr-1 h-3 w-3" />
                      )}
                      Preview sheet columns
                    </Button>
                    {sheetsCatalog?.drive_error && (
                      <p className="text-xs text-amber-700">{sheetsCatalog.drive_error}</p>
                    )}
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => void connectGoogle()} disabled={connectingGoogle}>
                    {connectingGoogle ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <FileSpreadsheet className="mr-1 h-3 w-3" />}
                    Connect Google Sheets
                  </Button>
                )}
              </div>
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

            <div className="max-h-[28rem] overflow-auto rounded-md border">
              {leadsLoading ? (
                <div className="flex items-center justify-center p-8 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading leads…
                </div>
              ) : visibleLeads.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No leads match this filter.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            visibleLeads.filter((lead) => lead.email).length > 0 &&
                            visibleLeads.filter((lead) => lead.email).every((lead) => selectedIds.has(lead.id))
                          }
                          onCheckedChange={(checked) => {
                            if (checked) selectVisibleWithEmail();
                            else setSelectedIds(new Set());
                          }}
                        />
                      </TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>First name</TableHead>
                      <TableHead>Last name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Job title</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleLeads.map((lead) => {
                      const hasEmail = Boolean(lead.email);
                      return (
                        <TableRow
                          key={lead.id}
                          className={!hasEmail ? 'opacity-50' : 'cursor-pointer'}
                          onClick={() => hasEmail && toggleLead(lead.id, !selectedIds.has(lead.id))}
                        >
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(lead.id)}
                              disabled={!hasEmail}
                              onCheckedChange={(checked) => toggleLead(lead.id, Boolean(checked))}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-gray-500">
                            {lead.unique_lead_id || lead.id}
                          </TableCell>
                          <TableCell>{lead.first_name || '—'}</TableCell>
                          <TableCell>{lead.last_name || '—'}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{lead.email || 'No email'}</TableCell>
                          <TableCell className="max-w-[140px] truncate">{lead.company || '—'}</TableCell>
                          <TableCell className="max-w-[140px] truncate">{lead.job_title || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
              <p className="mt-1 text-xs text-gray-500">
                Recipients see {selectedAccount?.email || 'this mailbox'} as the sender, not the LeadLab no-reply address.
              </p>
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
              <p className="mt-1 text-xs text-gray-500">Personalize with merge fields from the table.</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {MERGE_FIELDS.map((field) => (
                  <Button
                    key={field.token}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => insertMergeToken(field.token)}
                  >
                    {`{{${field.token}}}`}
                  </Button>
                ))}
              </div>
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

      <Dialog open={Boolean(importPreview)} onOpenChange={(open) => !open && closeImportPreview()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Match columns</DialogTitle>
            <DialogDescription>
              We found {importPreview?.total_rows || 0} rows. Map first name, last name, email, and any ID column,
              then import into the recipient table.
            </DialogDescription>
          </DialogHeader>
          {importPreview && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {importPreview.headers.map((header) => (
                  <div key={header}>
                    <Label className="text-xs">{header}</Label>
                    <Select
                      value={importMapping[header] || 'skip'}
                      onValueChange={(value) =>
                        setImportMapping((prev) => ({ ...prev, [header]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPORT_FIELD_OPTIONS.map((option) => (
                          <SelectItem key={`${header}-${option.value}`} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="max-h-56 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>First name</TableHead>
                      <TableHead>Last name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.sample.map((row, index) => (
                      <TableRow key={`${row.email || 'row'}-${index}`}>
                        <TableCell>{row.email || '—'}</TableCell>
                        <TableCell>{row.first_name || '—'}</TableCell>
                        <TableCell>{row.last_name || '—'}</TableCell>
                        <TableCell>{row.company || '—'}</TableCell>
                        <TableCell>{row.unique_lead_id || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeImportPreview}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={importTextMutation.isPending || importSheetMutation.isPending}
                  onClick={confirmImportPreview}
                >
                  {(importTextMutation.isPending || importSheetMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Import {importPreview.total_rows} rows
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
