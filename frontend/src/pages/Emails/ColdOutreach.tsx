import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, FileSpreadsheet, Link2, Loader2, Mail, PlayCircle, Search, Send, Sparkles, Upload, Users } from 'lucide-react';
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
import { emailSequencesAPI, type EmailSequence } from '@/services/api/email-sequences';
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
const SENT_STATUS_VALUES = new Set(['sent', 'send', 'done', 'emailed', 'yes']);
const MAX_MINUTES_BETWEEN_SENDS = 60;
const MAX_EMAILS_PER_HOUR = 500;

function parsePositiveNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundPace(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function hourCapFromMinutes(minutes: number): string {
  if (minutes <= 0) return '';
  return String(Math.max(1, Math.min(MAX_EMAILS_PER_HOUR, Math.round(60 / minutes))));
}
const IMPORT_FIELD_OPTIONS = [
  { value: 'skip', label: 'Ignore this column' },
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'full_name', label: 'Full name' },
  { value: 'company', label: 'Company' },
  { value: 'job_title', label: 'Job title' },
  { value: 'unique_lead_id', label: 'Sheet / external ID' },
  { value: 'status', label: 'Status (Sent / skip)' },
  { value: 'telephone', label: 'Phone' },
  { value: 'linkedin', label: 'LinkedIn' },
];

function sheetStatus(lead: Lead): string {
  return (lead.outreach_meta?.status || '').trim();
}

function campaignStatus(lead: Lead, campaignId?: number | null): string {
  if (!campaignId) return '';
  const campaigns = (lead.outreach_meta as { campaigns?: Record<string, { status?: string } | string> } | null | undefined)
    ?.campaigns;
  if (!campaigns) return '';
  const entry = campaigns[String(campaignId)];
  if (!entry) return '';
  return typeof entry === 'string' ? entry : (entry.status || '').trim();
}

function isSheetSent(lead: Lead, campaignId?: number | null): boolean {
  if (campaignId) {
    return SENT_STATUS_VALUES.has(campaignStatus(lead, campaignId).toLowerCase());
  }
  return SENT_STATUS_VALUES.has(sheetStatus(lead).toLowerCase());
}

function quoteSheetTitle(title: string): string {
  const raw = (title || 'Sheet1').trim() || 'Sheet1';
  if (/^[A-Za-z0-9_]+$/.test(raw)) return raw;
  return `'${raw.replace(/'/g, "''")}'`;
}

function parseSpreadsheetId(value: string): string {
  const raw = (value || '').trim();
  const fromPath = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = raw.match(/[?&]id=([a-zA-Z0-9\-_]+)/);
  if (fromQuery) return fromQuery[1];
  return raw;
}

function gidFromSheetUrl(url: string): number | null {
  const match = (url || '').match(/[?&#]gid=(\d+)/);
  return match ? Number(match[1]) : null;
}

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

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test((value || '').trim());
}

function wrapHtmlPreviewDocument(html: string): string {
  const trimmed = (html || '').trim();
  if (!trimmed) {
    return '<!DOCTYPE html><html><body><p style="color:#666">(empty message)</p></body></html>';
  }
  if (/<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>
body{margin:16px;font-family:Georgia,serif;color:#111;line-height:1.5;background:#fff}
img{max-width:100%;height:auto}
a{color:#0b57d0}
</style></head><body>${trimmed}</body></html>`;
}

function leadPersonalityLabel(lead: Lead): string {
  const psycho = lead.psychometrics || {};
  const raw =
    psycho.personality_type ||
    psycho.personality ||
    psycho.type ||
    psycho.disc ||
    psycho.profile ||
    lead.wpi ||
    '';
  return String(raw || '').trim();
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
  const [format, setFormat] = useState<'text' | 'html'>('html');
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  const [addPeopleMethod, setAddPeopleMethod] = useState<'paste' | 'csv' | 'sheet'>('paste');
  const [delayMinutes, setDelayMinutes] = useState('1');
  const [emailsPerMinute, setEmailsPerMinute] = useState('1');
  const [scheduleAt, setScheduleAt] = useState('');
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [sendWindowStart, setSendWindowStart] = useState('');
  const [sendWindowEnd, setSendWindowEnd] = useState('');
  const [maxPerHour, setMaxPerHour] = useState('60');
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
  const [sheetTab, setSheetTab] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ready' | 'all' | 'sent'>('ready');
  const [personalityFilter, setPersonalityFilter] = useState<string>('all');
  const [skipIfSent, setSkipIfSent] = useState(true);
  const [campaignMode, setCampaignMode] = useState<'existing' | 'new'>('new');
  const [campaignId, setCampaignId] = useState<string>('');
  const [campaignName, setCampaignName] = useState('');
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
  const selectedClient = clients.find((client) => String(client.id) === clientId);
  const clientInitializedRef = useRef(false);

  useEffect(() => {
    if (clientInitializedRef.current || !clients.length) return;
    clientInitializedRef.current = true;
    if (clientId !== 'all') return;
    const preferred =
      clients.find((client) => (client.lead_count || 0) > 0) || clients[0];
    if (preferred) setClientId(String(preferred.id));
  }, [clients, clientId]);

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

  const { data: campaigns = [] } = useQuery({
    queryKey: ['email-sequences'],
    queryFn: () => emailSequencesAPI.getAll(),
  });

  const selectedCampaign = campaigns.find((item: EmailSequence) => String(item.id) === campaignId);
  const activeCampaignId =
    campaignMode === 'existing' && campaignId ? Number(campaignId) : null;

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
  const selectedSheetId = parseSpreadsheetId(
    sheetUrl.trim() || sheetChoice || googleStatus?.spreadsheet_id || '',
  );

  const { data: sheetTabsData } = useQuery({
    queryKey: ['outreach-google-sheet-tabs', selectedSheetId],
    queryFn: () => outreachAPI.listSpreadsheetTabs(selectedSheetId),
    enabled: Boolean(sheetsReady && selectedSheetId),
  });
  const sheetTabs = sheetTabsData?.tabs || [];

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

  useEffect(() => {
    setSheetTab('');
  }, [selectedSheetId]);

  useEffect(() => {
    if (!sheetTabs.length) return;
    const gid = gidFromSheetUrl(sheetUrl);
    const byGid = gid != null ? sheetTabs.find((tab) => Number(tab.sheet_id) === gid) : undefined;
    setSheetTab((current) => {
      if (byGid) return byGid.title;
      if (current && sheetTabs.some((tab) => tab.title === current)) return current;
      return sheetTabs[0].title;
    });
  }, [sheetTabs, sheetUrl]);

  useEffect(() => {
    if (!sheetTab) return;
    setSheetRange(`${quoteSheetTitle(sheetTab)}!A1:Z500`);
  }, [sheetTab]);

  const personalityOptions = useMemo(() => {
    const values = new Set<string>();
    for (const lead of leads) {
      const label = leadPersonalityLabel(lead);
      if (label) values.add(label);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const visibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter === 'sent' && !isSheetSent(lead, activeCampaignId)) return false;
      if (statusFilter === 'ready' && isSheetSent(lead, activeCampaignId)) return false;
      if (personalityFilter !== 'all' && leadPersonalityLabel(lead) !== personalityFilter) return false;
      if (!q) return true;
      const hay = [
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.company,
        lead.job_title,
        lead.client_name,
        lead.unique_lead_id,
        sheetStatus(lead),
        campaignStatus(lead, activeCampaignId),
        leadPersonalityLabel(lead),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leads, search, statusFilter, personalityFilter, activeCampaignId]);

  const readyLeadCount = leads.filter(
    (lead) => Boolean(lead.email) && !isSheetSent(lead, activeCampaignId),
  ).length;
  const sentLeadCount = leads.filter((lead) => isSheetSent(lead, activeCampaignId)).length;

  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedIds.has(lead.id)),
    [leads, selectedIds],
  );
  const previewLead = selectedLeads[0] || visibleLeads[0] || leads[0];
  const previewAsHtml = format === 'html' || looksLikeHtml(body);
  const previewSubject = previewLead ? applyTokens(subject, previewLead, false) : subject;
  const previewBody = previewLead ? applyTokens(body, previewLead, previewAsHtml) : body;
  const previewHtmlDocument = wrapHtmlPreviewDocument(previewBody);

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
    setSelectedIds(
      new Set(
        visibleLeads
          .filter((lead) => Boolean(lead.email) && (!skipIfSent || !isSheetSent(lead, activeCampaignId)))
          .map((lead) => lead.id),
      ),
    );
  };

  const selectAllLoaded = () => {
    setSelectedIds(
      new Set(
        leads
          .filter((lead) => Boolean(lead.email) && (!skipIfSent || !isSheetSent(lead, activeCampaignId)))
          .map((lead) => lead.id),
      ),
    );
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
    ready_ids?: number[];
    already_sent?: number;
  }) => {
    setPasteEmails('');
    closeImportPreview();
    await refetchLeads();
    const idsToSelect = (result.ready_ids?.length ? result.ready_ids : result.lead_ids) || [];
    setSelectedIds(new Set(idsToSelect));
    setStatusFilter(idsToSelect.length ? 'ready' : 'all');
    const updated = result.updated || 0;
    const alreadySent = result.already_sent || 0;
    toast({
      title: idsToSelect.length ? 'People added and selected' : 'Import finished',
      description: idsToSelect.length
        ? `${idsToSelect.length} ready to email on ${selectedClient?.name || 'this list'}. Write your message on the right, then Send.`
        : `Imported ${result.imported}${updated ? `, updated ${updated}` : ''}, skipped ${result.skipped}${alreadySent ? `, already Sent ${alreadySent}` : ''}.`,
    });
    requestAnimationFrame(() => {
      listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const ensureImportClient = () => {
    if (importClientId) return true;
    toast({
      title: 'Choose a client list first',
      description: 'Pick the list these people belong to (for example Paystack), then add them again.',
      variant: 'destructive',
    });
    return false;
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
    if (!ensureImportClient()) return;
    previewMutation.mutate({ text: trimmed, source });
  };

  const openPreviewFromSheet = () => {
    if (!ensureImportClient()) return;
    if (!selectedSheetId) {
      toast({
        title: 'Paste a Google Sheet URL',
        description: 'Copy the spreadsheet link from Google Sheets, then click Preview.',
        variant: 'destructive',
      });
      return;
    }
    previewMutation.mutate({ spreadsheet_id: selectedSheetId });
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

  const insertMergeToken = (token: string) => {
    const insert = `{{${token}}}`;
    const el = bodyTextareaRef.current;
    if (!el) {
      setBody((prev) => {
        if (!prev) return insert;
        const spacer = prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' ';
        return `${prev}${spacer}${insert}`;
      });
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? start;
    const next = `${body.slice(0, start)}${insert}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + insert.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const confirmImportPreview = () => {
    if (!pendingImport) return;
    if (!ensureImportClient()) return;
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
      if (campaignMode === 'existing' && !campaignId) {
        throw new Error('Choose a campaign, or switch to New campaign and name it.');
      }
      if (campaignMode === 'new' && !campaignName.trim()) {
        throw new Error('Name this campaign before sending.');
      }
      const minutes = Math.max(
        0,
        Math.min(parsePositiveNumber(delayMinutes) || 1, MAX_MINUTES_BETWEEN_SENDS),
      );
      const delay = Math.round(minutes * 60 * 100) / 100;
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
        campaign_id: campaignMode === 'existing' ? Number(campaignId) : null,
        campaign_name:
          campaignMode === 'existing'
            ? selectedCampaign?.name || null
            : campaignName.trim(),
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
          skip_if_sent: skipIfSent,
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
    onSuccess: async (summary) => {
      setProgress(null);
      if (summary.batchId) setLastBatchId(summary.batchId);
      await Promise.all([
        refetchLeads(),
        queryClient.invalidateQueries({ queryKey: ['email-sequences'] }),
        queryClient.invalidateQueries({ queryKey: ['outreach-jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['outreach-runs'] }),
      ]);
      if (summary.mode === 'queued' || (summary.queued || 0) > 0) {
        toast({
          title: 'Campaign queued',
          description: `Queued ${summary.queued || summary.total} emails. Track progress under Runs.`,
        });
      } else {
        toast({
          title: 'Campaign finished',
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
  const hasCampaign =
    (campaignMode === 'existing' && Boolean(campaignId)) ||
    (campaignMode === 'new' && Boolean(campaignName.trim()));
  const canSend =
    Boolean(accountId) &&
    selectedIds.size > 0 &&
    canPreview &&
    hasCampaign &&
    !sendMutation.isPending;
  const sendBlockedReason = !hasCampaign
    ? 'Name a new campaign or choose an existing one before sending.'
    : !accountId
      ? 'Choose a mailbox to send from.'
      : selectedIds.size === 0
        ? 'Select people in the list first (or add them below).'
        : !canPreview
          ? 'Add a subject and message before sending.'
          : null;

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
    <div className="container mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Cold Outreach</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Name a campaign, choose a client list, add people if needed, then send. History shows under Runs and Campaigns.
          </p>
          <ol className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            <li className="rounded-full border border-slate-200 bg-white px-3 py-1">1. Campaign</li>
            <li className="rounded-full border border-slate-200 bg-white px-3 py-1">2. People</li>
            <li className="rounded-full border border-slate-200 bg-white px-3 py-1">3. Write &amp; send</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/emails')}>
            Back to Inbox
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/emails/connections')}>
            <Link2 className="mr-1 h-4 w-4" />
            Connections
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/emails/runs')}>
            <PlayCircle className="mr-1 h-4 w-4" />
            Runs
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/email-sequences')}>
            Campaigns
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Users className="h-5 w-5 text-slate-700" />
              Recipients
            </CardTitle>
            <p className="text-sm text-slate-500">
              People live on a client list. Add them under the table, then tick who should get this email.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div ref={listSectionRef} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="sm:col-span-2 xl:col-span-2">
                  <Label>Client list</Label>
                  <Select
                    value={clientId}
                    onValueChange={(value) => {
                      setClientId(value);
                      setSelectedIds(new Set());
                      setSearch('');
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Choose a client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All clients</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={String(client.id)}>
                          {client.name}
                          {typeof client.lead_count === 'number' ? ` (${client.lead_count})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'ready' | 'all' | 'sent')}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ready">Ready ({readyLeadCount})</SelectItem>
                      <SelectItem value="sent">Sent ({sentLeadCount})</SelectItem>
                      <SelectItem value="all">All ({leads.length})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Personality</Label>
                  <Select value={personalityFilter} onValueChange={setPersonalityFilter}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All personalities</SelectItem>
                      {personalityOptions.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    selectedClient
                      ? `Search ${selectedClient.name}`
                      : 'Search loaded people'
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectVisibleWithEmail}>
                  Select visible
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
                  {leadsFetching ? 'Refreshing…' : 'Refresh'}
                </Button>
                <span className="ml-auto text-sm font-medium text-slate-700">
                  {selectedIds.size} selected
                </span>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {leadsLoading ? (
                  <div className="flex items-center justify-center p-10 text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading people…
                  </div>
                ) : visibleLeads.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-300" />
                    <h3 className="mt-3 text-base font-medium text-slate-900">
                      {selectedClient
                        ? `No people on ${selectedClient.name} yet`
                        : 'No people match this filter'}
                    </h3>
                    <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                      {clientId === 'all'
                        ? 'Pick a client list above, then add people with paste, CSV, or Google Sheet below.'
                        : 'Use Add people below the table. After import, ready rows are selected so you can send.'}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button type="button" size="sm" onClick={() => setAddPeopleMethod('paste')}>
                        Paste emails
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setAddPeopleMethod('csv')}>
                        Upload CSV
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setAddPeopleMethod('sheet')}>
                        Google Sheet
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[26rem] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80">
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
                          {clientId === 'all' && <TableHead>Client</TableHead>}
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleLeads.map((lead) => {
                          const hasEmail = Boolean(lead.email);
                          const sent = isSheetSent(lead, activeCampaignId);
                          const status =
                            campaignStatus(lead, activeCampaignId) || sheetStatus(lead);
                          return (
                            <TableRow
                              key={lead.id}
                              className={!hasEmail ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}
                              onClick={() => hasEmail && toggleLead(lead.id, !selectedIds.has(lead.id))}
                            >
                              <TableCell onClick={(event) => event.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(lead.id)}
                                  disabled={!hasEmail}
                                  onCheckedChange={(checked) => toggleLead(lead.id, Boolean(checked))}
                                />
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-slate-500">
                                {lead.unique_lead_id || lead.id}
                              </TableCell>
                              <TableCell>{lead.first_name || '—'}</TableCell>
                              <TableCell>{lead.last_name || '—'}</TableCell>
                              <TableCell className="max-w-[180px] truncate">{lead.email || 'No email'}</TableCell>
                              <TableCell className="max-w-[140px] truncate">{lead.company || '—'}</TableCell>
                              <TableCell className="max-w-[140px] truncate">{lead.job_title || '—'}</TableCell>
                              {clientId === 'all' && (
                                <TableCell className="max-w-[140px] truncate">{lead.client_name || '—'}</TableCell>
                              )}
                              <TableCell>
                                <span className={sent ? 'text-emerald-700' : 'text-slate-500'}>
                                  {status || 'Ready'}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                {selectedClient ? `${selectedClient.name} · ` : 'All clients · '}
                {readyLeadCount} ready · {sentLeadCount} already Sent ·{' '}
                {leads.filter((lead) => lead.email).length} of {leads.length} loaded have an email
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Add people</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Imports land on the client list above
                    {selectedClient ? ` (${selectedClient.name})` : ''}. Preview columns, then confirm.
                  </p>
                </div>
                {clientId === 'all' && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    Choose a specific client list before importing.
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
                {(
                  [
                    { id: 'paste', label: 'Paste' },
                    { id: 'csv', label: 'CSV file' },
                    { id: 'sheet', label: 'Google Sheet' },
                  ] as const
                ).map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    className={`rounded px-3 py-1.5 text-sm ${
                      addPeopleMethod === method.id
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    onClick={() => setAddPeopleMethod(method.id)}
                  >
                    {method.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 space-y-3">
                {addPeopleMethod === 'paste' && (
                  <>
                    <Label>Paste emails or a CSV table</Label>
                    <Textarea
                      value={pasteEmails}
                      onChange={(event) => setPasteEmails(event.target.value)}
                      placeholder={'email,first_name,last_name,company\nada@example.com,Ada,Lovelace,Analytical\n\nAli Attia <ali@the-leadlab.com>'}
                      className="min-h-[110px] bg-white font-mono text-xs"
                    />
                    <Button
                      type="button"
                      disabled={!pasteEmails.trim() || previewMutation.isPending || importTextMutation.isPending}
                      onClick={() => openPreviewFromText(pasteEmails, 'outreach_paste')}
                    >
                      {previewMutation.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-1 h-4 w-4" />
                      )}
                      Preview &amp; add to list
                    </Button>
                  </>
                )}

                {addPeopleMethod === 'csv' && (
                  <>
                    <p className="text-sm text-slate-600">
                      Upload a CSV with email, first name, last name, and company columns. We will preview the mapping before saving.
                    </p>
                    <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Choose CSV file
                      <input
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        className="hidden"
                        onChange={(event) => {
                          if (!ensureImportClient()) {
                            event.target.value = '';
                            return;
                          }
                          onCsvFile(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </>
                )}

                {addPeopleMethod === 'sheet' && (
                  <>
                    {sheetsReady ? (
                      <div className="space-y-2">
                        {googleStatus?.connected && googleStatus?.can_write_sheets === false && (
                          <p className="text-xs text-amber-800">
                            Reconnect Google so LeadLab can write Sent back into the Status column after each send.
                          </p>
                        )}
                        {sheetFiles.length > 0 && (
                          <Select value={sheetChoice || undefined} onValueChange={setSheetChoice}>
                            <SelectTrigger className="bg-white">
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
                          className="bg-white"
                          value={sheetUrl}
                          onChange={(event) => setSheetUrl(event.target.value)}
                          placeholder="Paste a Google Sheets URL"
                        />
                        {sheetTabs.length > 0 && (
                          <Select value={sheetTab || undefined} onValueChange={setSheetTab}>
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Choose a tab" />
                            </SelectTrigger>
                            <SelectContent>
                              {sheetTabs.map((tab) => (
                                <SelectItem key={`${tab.sheet_id || tab.title}`} value={tab.title}>
                                  {tab.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Input
                          className="bg-white"
                          value={sheetRange}
                          onChange={(event) => setSheetRange(event.target.value)}
                          placeholder="Cleaned - Lucas!A1:Z500"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            disabled={!selectedSheetId || previewMutation.isPending}
                            onClick={openPreviewFromSheet}
                          >
                            {previewMutation.isPending ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="mr-1 h-4 w-4" />
                            )}
                            Preview &amp; add to list
                          </Button>
                          {googleStatus?.can_write_sheets === false && (
                            <Button type="button" variant="outline" onClick={() => void connectGoogle()} disabled={connectingGoogle}>
                              {connectingGoogle ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                              Reconnect Google
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Rows marked Sent are skipped. After a successful send we write Sent into that cell.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Button type="button" variant="outline" onClick={() => void connectGoogle()} disabled={connectingGoogle}>
                          {connectingGoogle ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
                          Connect Google Sheets
                        </Button>
                        <p className="text-xs text-slate-500">
                          Google opens a permission page. Scroll to the bottom and click Continue, then Allow.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Mail className="h-5 w-5 text-slate-700" />
              Compose &amp; send
            </CardTitle>
            <p className="text-sm text-slate-500">
              Write once, preview as the recipient will see it, then send to the selected people.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
              <div>
                <Label>Campaign</Label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Every send belongs to a campaign. A new campaign can email the same person again; skip-already-sent only applies inside the selected campaign.
                </p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  className={`rounded px-3 py-1.5 text-sm ${
                    campaignMode === 'new' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  onClick={() => setCampaignMode('new')}
                >
                  New campaign
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-1.5 text-sm ${
                    campaignMode === 'existing' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  onClick={() => setCampaignMode('existing')}
                >
                  Existing campaign
                </button>
              </div>
              {campaignMode === 'new' ? (
                <Input
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="e.g. Paystack Lucas wave 2"
                />
              ) : (
                <Select value={campaignId || undefined} onValueChange={setCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((item: EmailSequence) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

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
              <p className="mt-1 text-xs text-slate-500">
                Recipients see {selectedAccount?.email || 'this mailbox'} as the sender.
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
                ref={bodyTextareaRef}
                className="min-h-[220px] font-mono text-sm"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={
                  format === 'html'
                    ? '<p>Hi {{first_name}},</p><p>I wanted to reach out…</p>'
                    : 'Hi {{first_name}},\n\nI wanted to reach out…'
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                Click a merge field to insert it at the cursor. HTML mode is recommended for logos and styled emails.
              </p>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Minutes between each email</Label>
                <Input
                  type="number"
                  min={0.1}
                  max={MAX_MINUTES_BETWEEN_SENDS}
                  step={0.5}
                  value={delayMinutes}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDelayMinutes(value);
                    const minutes = Math.min(
                      MAX_MINUTES_BETWEEN_SENDS,
                      parsePositiveNumber(value),
                    );
                    if (!minutes) {
                      setEmailsPerMinute('');
                      setMaxPerHour('');
                      return;
                    }
                    setEmailsPerMinute(roundPace(1 / minutes));
                    setMaxPerHour(hourCapFromMinutes(minutes));
                  }}
                />
              </div>
              <div>
                <Label>Emails per minute</Label>
                <Input
                  type="number"
                  min={0.1}
                  max={MAX_EMAILS_PER_HOUR / 60}
                  step={0.1}
                  value={emailsPerMinute}
                  onChange={(event) => {
                    const value = event.target.value;
                    setEmailsPerMinute(value);
                    const rate = parsePositiveNumber(value);
                    if (!rate) {
                      setDelayMinutes('');
                      setMaxPerHour('');
                      return;
                    }
                    const minutes = Math.min(MAX_MINUTES_BETWEEN_SENDS, 1 / rate);
                    setDelayMinutes(roundPace(minutes));
                    setMaxPerHour(hourCapFromMinutes(minutes));
                  }}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-gray-500">
              {parsePositiveNumber(delayMinutes)
                ? `That's about ${maxPerHour || hourCapFromMinutes(parsePositiveNumber(delayMinutes))} emails per hour. The hourly cap fills in automatically.`
                : 'Set minutes between emails or emails per minute. The hourly cap fills in automatically.'}
            </p>

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
              <Label>Max emails per hour</Label>
              <Input
                type="number"
                min={1}
                max={MAX_EMAILS_PER_HOUR}
                value={maxPerHour}
                onChange={(event) => setMaxPerHour(event.target.value)}
                placeholder="Filled from send pace"
              />
              <p className="mt-1 text-xs text-gray-500">
                Auto-filled from the pace above. Lower it if you want a stricter hourly cap.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={skipIfSent}
                onCheckedChange={(checked) => setSkipIfSent(Boolean(checked))}
              />
              <Label className="font-normal">
                Skip people already sent in this campaign
              </Label>
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

            <div className="space-y-2 border-t border-slate-100 pt-4">
              {sendBlockedReason && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {sendBlockedReason}
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
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(importPreview)} onOpenChange={(open) => !open && closeImportPreview()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Add people to {selectedClient?.name || 'this list'}</DialogTitle>
            <DialogDescription>
              We found {importPreview?.total_rows || 0} rows
              {importPreview?.has_status
                ? ` (${importPreview.sent_count || 0} already Sent, ${importPreview.ready_count ?? importPreview.total_rows} ready)`
                : ''}. Confirm the column mapping, then add them under your client list so you can select and send.
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
                      <TableHead>Status</TableHead>
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
                        <TableCell>{row.status || 'Ready'}</TableCell>
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
                  Import {importPreview.total_rows} people onto {selectedClient?.name || 'list'}
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
            {previewAsHtml ? (
              <iframe
                title="HTML preview"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="h-[28rem] w-full rounded-md border bg-white"
                srcDoc={previewHtmlDocument}
              />
            ) : (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-sm">
                {previewBody || '(empty message)'}
              </pre>
            )}
            {previewAsHtml && format !== 'html' ? (
              <p className="text-xs text-amber-700">
                Showing a visual HTML preview because the body looks like HTML. Switch Format to HTML before sending.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ColdOutreachPage;
