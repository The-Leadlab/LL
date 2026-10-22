/**
 * Modern Leads Page - Connected to Real Backend API
 *
 * Features:
 * - Table view with search, pagination, import/export
 * - Quick actions
 * - Bulk operations
 * - Real-time search
 * - Full backend integration
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { leadsAPI, type Lead } from '@/services/api/leads';
import { clientsAPI, type Client } from '@/services/api/clients';
import { stagesAPI, type Stage } from '@/services/api/stages';
import usersAPI from '@/services/api/users';
import type { LeadListResponse } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/auth';
import {
  Search,
  Filter,
  Plus,
  Mail,
  Phone,
  MoreVertical,
  User,
  Download,
  Upload,
  FileDown,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings2,
  FolderInput,
  Eye,
  Pencil,
  Trash2,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

const SELECTED_CLIENT_KEY = 'leadlab.leads.selectedClientId';
const LEADS_SORT_KEY = 'leadlab.leads.sortBy';
const LEADS_GROUP_KEY = 'leadlab.leads.groupBy';

type LeadGroupBy = 'none' | 'personality' | 'source' | 'sector' | 'stage';
type LeadSortBy = 'created_at' | 'updated_at' | 'first_name' | 'company' | 'job_title' | 'source' | 'sector';

/** Seed client id from URL / session so leads fetch can start without waiting on clients list. */
function readInitialClientId(): number | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = Number(params.get('client_id'));
    if (Number.isFinite(fromUrl) && fromUrl > 0) return fromUrl;
    const fromStore = Number(sessionStorage.getItem(SELECTED_CLIENT_KEY));
    if (Number.isFinite(fromStore) && fromStore > 0) return fromStore;
  } catch {
    /* ignore */
  }
  return null;
}

function getLeadPersonality(lead: Lead): string {
  const psycho = lead.psychometrics;
  if (psycho && typeof psycho === 'object') {
    const combined = (psycho as Record<string, unknown>).combined_insights;
    const fromCombined =
      combined && typeof combined === 'object'
        ? (combined as Record<string, unknown>).personality_type
        : undefined;
    const direct =
      (psycho as Record<string, unknown>).personality_type ||
      (psycho as Record<string, unknown>).personality ||
      (psycho as Record<string, unknown>).DISC;
    const value = fromCombined || direct;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (lead.wpi && String(lead.wpi).trim()) return String(lead.wpi).trim();
  return 'Unknown';
}

/** Sentinel group keys (stable identifiers) -> i18n label keys. Other keys are user data and shown as-is. */
const GROUP_LABEL_KEYS: Record<string, string> = {
  'All leads': 'page.groups.allLeads',
  'No type / source': 'page.groups.noSource',
  'No sector': 'page.groups.noSector',
  'No stage': 'page.groups.noStage',
  Unknown: 'page.groups.unknown',
};

function getLeadGroupKey(lead: Lead, groupBy: LeadGroupBy): string {
  switch (groupBy) {
    case 'personality':
      return getLeadPersonality(lead);
    case 'source':
      return (lead.source && lead.source.trim()) || 'No type / source';
    case 'sector':
      return (lead.sector && lead.sector.trim()) || 'No sector';
    case 'stage':
      return lead.stage?.name || 'No stage';
    default:
      return 'All leads';
  }
}

function groupLeads(leads: Lead[], groupBy: LeadGroupBy): { key: string; leads: Lead[] }[] {
  if (groupBy === 'none') {
    return [{ key: 'All leads', leads }];
  }
  const map = new Map<string, Lead[]>();
  for (const lead of leads) {
    const key = getLeadGroupKey(lead, groupBy);
    const bucket = map.get(key);
    if (bucket) bucket.push(lead);
    else map.set(key, [lead]);
  }
  return Array.from(map.entries())
    .map(([key, items]) => ({ key, leads: items }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
function parseTotalCount(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeLeadListPayload(
  data: unknown
): LeadListResponse & { results: Lead[] } {
  if (Array.isArray(data)) {
    const list = data as Lead[];
    return {
      results: list,
      total: list.length,
      page: 0,
      size: list.length,
      has_more: false,
    };
  }
  const raw = data as LeadListResponse & { items?: Lead[] };
  const results: Lead[] =
    (Array.isArray(raw?.results) ? raw.results : undefined) ??
    (Array.isArray(raw?.items) ? raw.items : []) ??
    [];
  const total = parseTotalCount(raw?.total, results.length);
  const hasMore =
    typeof raw?.has_more === 'boolean'
      ? raw.has_more
      : typeof (raw as { hasMore?: boolean })?.hasMore === 'boolean'
        ? (raw as { hasMore?: boolean }).hasMore!
        : false;

  return {
    ...raw,
    results,
    total,
    page: raw?.page ?? 0,
    size: raw?.size ?? results.length,
    has_more: hasMore,
  } as LeadListResponse & { results: Lead[] };
}

type PaginationBarProps = {
  page: number;
  pageSize: number;
  totalLeads: number;
  totalPages: number;
  canPrev: boolean;
  canNext: boolean;
  isLoadingLeads?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (n: number) => void;
};

export function LeadsPaginationBar({
  page,
  pageSize,
  totalLeads,
  totalPages,
  canPrev,
  canNext,
  isLoadingLeads = false,
  onPrev,
  onNext,
  onPageSizeChange,
}: PaginationBarProps) {
  const { t } = useTranslation('leads');
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      role="navigation"
      aria-label={t('page.paginationAria')}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
        <span className="font-medium">{t('page.rowsPerPage')}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="min-h-[44px] min-w-[5rem] rounded-md border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="text-neutral-500 dark:text-neutral-500">
          {isLoadingLeads
            ? t('page.loadingLeadsShort')
            : totalLeads > 0
              ? t('page.totalCount', { count: totalLeads })
              : t('page.noLeadsShort')}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
        <button
          type="button"
          disabled={!canPrev}
          onClick={onPrev}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('page.previous')}
        </button>
        <span className="min-w-[8rem] px-2 text-center text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
          {t('page.pageOf', { current: Math.min(page + 1, totalPages), total: totalPages })}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={onNext}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          {t('page.next')}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Isolated search input so typing does not re-render the full leads table. */
function LeadsSearchField({
  initialValue = '',
  isFetching = false,
  onDebouncedChange,
}: {
  initialValue?: string;
  isFetching?: boolean;
  onDebouncedChange: (value: string) => void;
}) {
  const { t } = useTranslation('leads');
  const [value, setValue] = useState(initialValue);
  const [debounced, setDebounced] = useState(initialValue.trim());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = value.trim();
      setDebounced(next);
      onDebouncedChange(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value, onDebouncedChange]);

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
      <input
        type="text"
        placeholder={t('page.searchPlaceholder')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
      {(isFetching || value.trim() !== debounced) && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary-600" />
      )}
    </div>
  );
}

export function ModernLeads() {
  const { t } = useTranslation('leads');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const isAdmin = Boolean(user?.is_admin);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [debouncedSearch, setDebouncedSearch] = useState(() => (searchParams.get('q') || '').trim());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLeads, setSelectedLeads] = useState<number[]>([]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [importStep, setImportStep] = useState<'file' | 'mapping'>('file');
  const [importPreview, setImportPreview] = useState<{
    headers: string[];
    suggested_mapping: Record<string, string>;
    sample_rows: Array<{ raw: Record<string, unknown>; mapped: Record<string, unknown> }>;
    total_rows: number;
    identity_rows: number;
    skippable_empty_rows: number;
    mappable_fields: string[];
  } | null>(null);
  /** Apollo-style: file header → lead field (or "skip") */
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const [isRemappingPreview, setIsRemappingPreview] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(() => readInitialClientId());
  const [isManageClientsOpen, setIsManageClientsOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [importClientId, setImportClientId] = useState<number | null>(null);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [moveTargetClientId, setMoveTargetClientId] = useState<number | null>(null);
  const [moveMode, setMoveMode] = useState<'selected' | 'all_in_client'>('selected');
  const [sortBy, setSortBy] = useState<LeadSortBy>(() => {
    try {
      const stored = sessionStorage.getItem(LEADS_SORT_KEY) as LeadSortBy | null;
      if (stored && ['created_at', 'updated_at', 'first_name', 'company', 'job_title', 'source', 'sector'].includes(stored)) {
        return stored;
      }
    } catch { /* ignore */ }
    return 'created_at';
  });
  const [sortDesc, setSortDesc] = useState(() => {
    try {
      const stored = sessionStorage.getItem(LEADS_SORT_KEY) as LeadSortBy | null;
      if (stored && ['first_name', 'company', 'job_title', 'source', 'sector'].includes(stored)) {
        return false; // Asc for text fields
      }
    } catch { /* ignore */ }
    return true; // Desc for Newest / recently updated
  });
  const [groupBy, setGroupBy] = useState<LeadGroupBy>(() => {
    try {
      const stored = sessionStorage.getItem(LEADS_GROUP_KEY) as LeadGroupBy | null;
      if (stored && ['none', 'personality', 'source', 'sector', 'stage'].includes(stored)) {
        return stored;
      }
    } catch { /* ignore */ }
    return 'none';
  });
  const [filterStageId, setFilterStageId] = useState<number | null>(null);
  const [filterSource, setFilterSource] = useState('');
  const [filterSector, setFilterSector] = useState('');
  // Draft filters — only committed on Apply so typing does not refetch
  const [draftFilterStageId, setDraftFilterStageId] = useState<number | null>(null);
  const [draftFilterSource, setDraftFilterSource] = useState('');
  const [draftFilterSector, setDraftFilterSector] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const handleDebouncedSearch = React.useCallback((value: string) => {
    setDebouncedSearch(value);
  }, []);

  useEffect(() => {
    setPage(0);
    setSelectedLeads([]);
  }, [debouncedSearch, selectedClientId, sortBy, sortDesc, groupBy, filterStageId, filterSource, filterSector]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LEADS_SORT_KEY, sortBy);
      sessionStorage.setItem(LEADS_GROUP_KEY, groupBy);
    } catch { /* ignore */ }
  }, [sortBy, groupBy]);

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'with-archived'],
    queryFn: () => clientsAPI.list(true),
  });

  const { data: assignableUsersData } = useQuery({
    queryKey: ['assignable-users', user?.organization_id],
    queryFn: async () => {
      const res = await usersAPI.getAssignable();
      const items = res?.items ?? res?.data?.items ?? (Array.isArray(res) ? res : []);
      return items as Array<{
        id: number;
        first_name?: string;
        last_name?: string;
        email?: string;
      }>;
    },
    enabled: isAdmin && isManageClientsOpen,
  });
  const assignableUsers = Array.isArray(assignableUsersData)
    ? assignableUsersData
    : [];

  const { data: stagesData } = useQuery({
    queryKey: ['lead-stages'],
    queryFn: () => stagesAPI.getAll(),
  });
  // Guard: shared react-query cache may still hold a non-array from older queryFns
  const stages: Stage[] = Array.isArray(stagesData) ? stagesData : [];

  const allClients: Client[] = Array.isArray(clientsData?.items)
    ? clientsData.items
    : Array.isArray(clientsData)
      ? (clientsData as Client[])
      : [];
  const activeClients = allClients.filter((c) => !c.is_archived);
  const archivedClients = allClients.filter((c) => c.is_archived);

  useEffect(() => {
    if (selectedClientId != null || activeClients.length === 0) return;
    const fromUrl = Number(searchParams.get('client_id'));
    let fromStore = NaN;
    try {
      fromStore = Number(sessionStorage.getItem(SELECTED_CLIENT_KEY));
    } catch {
      fromStore = NaN;
    }
    const match =
      activeClients.find((c) => c.id === fromUrl) ||
      activeClients.find((c) => c.id === fromStore) ||
      activeClients.find((c) => c.is_default) ||
      activeClients[0];
    setSelectedClientId(match.id);
  }, [activeClients, selectedClientId, searchParams]);

  useEffect(() => {
    if (selectedClientId == null) return;
    try {
      sessionStorage.setItem(SELECTED_CLIENT_KEY, String(selectedClientId));
    } catch {
      /* ignore quota / private mode */
    }
    if (searchParams.get('client_id') !== String(selectedClientId)) {
      const next = new URLSearchParams(searchParams);
      next.set('client_id', String(selectedClientId));
      setSearchParams(next, { replace: true });
    }
  }, [selectedClientId, searchParams, setSearchParams]);

  // Keep import target in sync with the active Clients tab
  useEffect(() => {
    if (selectedClientId != null) {
      setImportClientId(selectedClientId);
    }
  }, [selectedClientId]);

  // Fetch leads from backend (paginated; debounced search avoids remounting the page each keystroke)
  // Cap grouped fetches so we don't pull 100+ heavy rows on every filter change
  const effectivePageSize = groupBy === 'none' ? pageSize : 50;
  const { data: leadsPage, isLoading: isLoadingLeads, isFetching: isFetchingLeads } = useQuery({
    queryKey: [
      'leads',
      debouncedSearch,
      page,
      effectivePageSize,
      selectedClientId,
      sortBy,
      sortDesc,
      filterStageId,
      filterSource,
      filterSector,
      groupBy,
    ],
    enabled: selectedClientId != null,
    queryFn: async ({ signal }) => {
      const res = await leadsAPI.getAll({
        search: debouncedSearch || undefined,
        skip: page * effectivePageSize,
        limit: effectivePageSize,
        sort_by: sortBy,
        sort_desc: sortDesc,
        client_id: selectedClientId ?? undefined,
        stage_id: filterStageId ?? undefined,
        source: filterSource.trim() || undefined,
        sector: filterSector.trim() || undefined,
        signal,
      });
      return normalizeLeadListPayload(res.data) as LeadListResponse;
    },
    placeholderData: keepPreviousData,
  });
  const leads: Lead[] = leadsPage?.results ?? [];
  const totalLeads = leadsPage?.total ?? 0;
  const pageStart = totalLeads === 0 ? 0 : page * effectivePageSize + 1;
  const pageEnd = page * effectivePageSize + leads.length;
  const leadGroups = useMemo(() => groupLeads(leads, groupBy), [leads, groupBy]);
  const activeFilterCount =
    (filterStageId ? 1 : 0) +
    (filterSource.trim() ? 1 : 0) +
    (filterSector.trim() ? 1 : 0);

  /** Convert Apollo UI map (header → field) to API map (lead_field → header). */
  const headerMapToFieldMap = (hm: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    Object.entries(hm).forEach(([header, field]) => {
      if (!header || !field || field === 'skip') return;
      // First header wins if two map to the same field
      if (!out[field]) out[field] = header;
    });
    return out;
  };

  /** Seed Apollo UI map from API suggested_mapping (lead_field → header). */
  const fieldMapToHeaderMap = (
    headers: string[],
    suggested: Record<string, string>,
  ): Record<string, string> => {
    const inverted: Record<string, string> = {};
    Object.entries(suggested || {}).forEach(([field, header]) => {
      if (header) inverted[header] = field;
    });
    const seeded: Record<string, string> = {};
    headers.forEach((h) => {
      seeded[h] = inverted[h] || 'skip';
    });
    return seeded;
  };

  const resetImportDialog = () => {
    setSelectedFile(null);
    setImportStep('file');
    setImportPreview(null);
    setHeaderMapping({});
    setIsPreviewing(false);
    setIsRemappingPreview(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) {
        throw new Error(t('page.errors.mustBeLoggedIn'));
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assigned_user_id', String(user.id));
      const clientForImport = importClientId ?? selectedClientId;
      if (!clientForImport) {
        throw new Error(t('page.errors.selectClientImport'));
      }
      formData.append('client_id', String(clientForImport));
      const mappingPayload = headerMapToFieldMap(headerMapping);
      if (Object.keys(mappingPayload).length > 0) {
        formData.append('column_mapping', JSON.stringify(mappingPayload));
      }
      return leadsAPI.uploadCSV(formData);
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setIsUploadDialogOpen(false);
      resetImportDialog();
      const data = res?.data?.data ?? res?.data ?? res;
      const count = data?.successful_imports;
      const skipped = data?.skipped_empty_rows;
      toast({
        title: t('common:success'),
        description:
          typeof count === 'number'
            ? t('page.importSuccessDetail', {
                count,
                skipped:
                  skipped > 0
                    ? t('page.importSkippedSuffix', { count: skipped })
                    : '',
              })
            : t('page.importSuccess'),
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ||
        error?.message ||
        t('page.importFailed');
      toast({
        title: t('common:error'),
        description: typeof detail === "string" ? detail : JSON.stringify(detail),
        variant: "destructive",
      });
    },
  });

  const deleteLeadMutation = useMutation({
    mutationFn: (id: number) => leadsAPI.delete(id, true),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setSelectedLeads((prev) => prev.filter((id) => id !== deletedId));
      toast({ title: t('deleted') });
    },
    onError: (error: any) => {
      toast({
        title: t('page.deleteFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => leadsAPI.bulkDelete(ids),
    onSuccess: (res) => {
      const n = res?.data?.deleted ?? selectedLeads.length;
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setSelectedLeads([]);
      toast({ title: t('page.bulkDeleted', { count: n }) });
    },
    onError: (error: any) => {
      toast({
        title: t('page.deleteFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const createClientMutation = useMutation({
    mutationFn: (name: string) => clientsAPI.create(name),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setNewClientName('');
      setSelectedClientId(created.id);
      toast({ title: t('page.clientCreated'), description: created.name });
    },
    onError: (error: any) => {
      toast({
        title: t('page.clientCreateFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const renameClientMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => clientsAPI.rename(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setRenamingId(null);
      setRenameValue('');
      toast({ title: t('page.clientRenamed') });
    },
    onError: (error: any) => {
      toast({
        title: t('page.renameFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const invalidateLeadTotals = () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['leadStats'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
  };

  const archiveClientMutation = useMutation({
    mutationFn: (id: number) => clientsAPI.archive(id),
    onSuccess: () => {
      invalidateLeadTotals();
      const general = activeClients.find((c) => c.is_default);
      if (general) setSelectedClientId(general.id);
      toast({ title: t('page.clientArchived') });
    },
    onError: (error: any) => {
      toast({
        title: t('page.archiveFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const restoreClientMutation = useMutation({
    mutationFn: (id: number) => clientsAPI.restore(id),
    onSuccess: (restored) => {
      invalidateLeadTotals();
      setSelectedClientId(restored.id);
      toast({ title: t('page.clientRestored') });
    },
    onError: (error: any) => {
      toast({
        title: t('page.restoreFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: (id: number) => clientsAPI.delete(id),
    onSuccess: (result) => {
      invalidateLeadTotals();
      if (selectedClientId === result.client_id) {
        const general = activeClients.find((c) => c.is_default);
        if (general) setSelectedClientId(general.id);
      }
      toast({
        title: t('page.clientDeleted'),
        description: t('page.clientDeletedHint', { count: result.deleted_leads }),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('page.deleteClientFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const requestDeleteClientMutation = useMutation({
    mutationFn: (id: number) => clientsAPI.requestDelete(id),
    onSuccess: (result) => {
      toast({
        title: t('page.deleteRequestSent'),
        description: t('page.deleteRequestSentHint', {
          name: result.client_name,
          count: result.admins_notified,
        }),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('page.deleteRequestFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const assignClientMutation = useMutation({
    mutationFn: ({
      id,
      assignedUserId,
    }: {
      id: number;
      assignedUserId: number | null;
    }) => clientsAPI.assign(id, assignedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast({ title: t('page.clientAssigned') });
    },
    onError: (error: any) => {
      toast({
        title: t('page.assignClientFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const moveClientMutation = useMutation({
    mutationFn: async () => {
      if (!moveTargetClientId) throw new Error(t('page.errors.pickDestination'));
      if (moveMode === 'all_in_client') {
        if (!selectedClientId) throw new Error(t('page.errors.noSourceClient'));
        return leadsAPI.moveToClient({
          to_client_id: moveTargetClientId,
          from_client_id: selectedClientId,
          move_all_from_client: true,
        });
      }
      if (selectedLeads.length === 0) throw new Error(t('page.errors.selectOneLead'));
      return leadsAPI.moveToClient({
        to_client_id: moveTargetClientId,
        lead_ids: selectedLeads,
        from_client_id: selectedClientId ?? undefined,
      });
    },
    onSuccess: (res: any) => {
      const payload = res?.data ?? res;
      const msg = payload?.message || t('page.leadsMoved');
      invalidateLeadTotals();
      setSelectedLeads([]);
      setIsMoveDialogOpen(false);
      toast({ title: t('page.moved'), description: typeof msg === 'string' ? msg : t('page.leadsMoved') });
    },
    onError: (error: any) => {
      toast({
        title: t('page.moveFailed'),
        description: error?.response?.data?.detail || error?.message || t('common:failed'),
        variant: 'destructive',
      });
    },
  });

  const openMoveDialog = (mode: 'selected' | 'all_in_client') => {
    setMoveMode(mode);
    const dest =
      activeClients.find((c) => c.id !== selectedClientId && !c.is_default)?.id ??
      activeClients.find((c) => c.id !== selectedClientId)?.id ??
      null;
    setMoveTargetClientId(dest);
    setIsMoveDialogOpen(true);
  };

  const toggleSelectAll = () => {
    if (leads.length === 0) return;
    const allSelected = leads.every((l) => selectedLeads.includes(l.id));
    if (allSelected) {
      setSelectedLeads((prev) => prev.filter((id) => !leads.some((l) => l.id === id)));
    } else {
      setSelectedLeads((prev) => Array.from(new Set([...prev, ...leads.map((l) => l.id)])));
    }
  };

  const toggleSelectLead = (id: number) => {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast({
          title: t('page.invalidFileType'),
          description: t('page.invalidFileTypeHint'),
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      setImportStep('file');
      setImportPreview(null);
      setHeaderMapping({});
    }
  };

  const handlePreviewContinue = async () => {
    if (!selectedFile) {
      toast({
        title: t('page.noFileSelected'),
        description: t('page.noFileSelectedHint'),
        variant: "destructive",
      });
      return;
    }
    setIsPreviewing(true);
    try {
      const preview = await leadsAPI.previewImport(selectedFile);
      setImportPreview(preview);
      setHeaderMapping(
        fieldMapToHeaderMap(preview.headers || [], preview.suggested_mapping || {}),
      );
      setImportStep('mapping');
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail ||
        error?.message ||
        t('page.importPreviewFailed');
      toast({
        title: t('common:error'),
        description: typeof detail === 'string' ? detail : JSON.stringify(detail),
        variant: 'destructive',
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  // Recompute identity counts + samples when the user remaps columns (Apollo-style)
  useEffect(() => {
    if (importStep !== 'mapping' || !selectedFile) return;
    if (Object.keys(headerMapping).length === 0) return;

    const fieldMap = headerMapToFieldMap(headerMapping);
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsRemappingPreview(true);
      try {
        const preview = await leadsAPI.previewImport(
          selectedFile,
          Object.keys(fieldMap).length > 0 ? fieldMap : undefined,
        );
        if (cancelled) return;
        setImportPreview(preview);
      } catch {
        // Keep last good preview; toast only on hard failures during confirm
      } finally {
        if (!cancelled) setIsRemappingPreview(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [headerMapping, importStep, selectedFile]);

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: t('page.noFileSelected'),
        description: t('page.noFileSelectedHint'),
        variant: "destructive",
      });
      return;
    }
    if (!user?.id) {
      toast({
        title: t('page.notSignedIn'),
        description: t('page.notSignedInHint'),
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      await uploadMutation.mutateAsync(selectedFile);
    } finally {
      setIsUploading(false);
    }
  };

  const importFieldLabel = (field: string) => {
    if (field === 'skip') return t('page.importSkipColumn');
    const key = `page.importField_${field}`;
    const translated = t(key);
    return translated === key ? field : translated;
  };

  const mappingFieldOptions = useMemo(() => {
    const preferred = [
      'first_name',
      'last_name',
      'full_name',
      'email',
      'company',
      'job_title',
      'telephone',
      'mobile',
      'linkedin',
      'location',
      'country',
      'website',
      'sector',
      'lab_comments',
      'unique_lead_id',
      'source',
    ];
    const fromPreview = importPreview?.mappable_fields || preferred;
    const ordered = [
      ...preferred.filter((f) => fromPreview.includes(f)),
      ...fromPreview.filter((f) => !preferred.includes(f) && f !== 'client_id' && f !== 'client'),
    ];
    return ['skip', ...ordered];
  }, [importPreview]);

  const hasIdentityMapped = useMemo(() => {
    const fields = new Set(
      Object.values(headerMapping).filter((f) => f && f !== 'skip'),
    );
    return (
      fields.has('email') ||
      fields.has('first_name') ||
      fields.has('last_name') ||
      fields.has('full_name')
    );
  }, [headerMapping]);

  const canConfirmImport =
    Boolean(selectedFile) &&
    hasIdentityMapped &&
    (importPreview?.identity_rows ?? 0) > 0 &&
    !isUploading &&
    !isRemappingPreview;

  // Handle download template
  const handleDownloadTemplate = async () => {
    try {
      const blob = await leadsAPI.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'leads-import-template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: t('common:success'),
        description: t('page.templateDownloaded'),
      });
    } catch (error) {
      toast({
        title: t('common:error'),
        description: t('page.templateFailed'),
        variant: "destructive",
      });
    }
  };

  const handleExport = async () => {
    toast({ title: t('page.exporting'), description: t('page.exportingHint') });
    try {
      const blob = await leadsAPI.exportCSV({
        search: debouncedSearch || undefined,
        client_id: selectedClientId ?? undefined,
        stage_id: filterStageId ?? undefined,
        source: filterSource.trim() || undefined,
        sector: filterSector.trim() || undefined,
        sort_by: sortBy,
        sort_desc: sortDesc,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({ title: t('page.exported'), description: t('page.exportedHint') });
    } catch {
      toast({
        title: t('page.exportFailed'),
        description: t('page.exportFailedHint'),
        variant: 'destructive',
      });
    }
  };

  const hasMore = leadsPage?.has_more === true;
  const pagesFromTotal = Math.max(1, Math.ceil(totalLeads / effectivePageSize));
  const totalPages = Math.max(pagesFromTotal, page + (hasMore ? 2 : 1));
  const canPrev = page > 0;
  const canNext = hasMore || (totalLeads > 0 && page < pagesFromTotal - 1);

  const showLeadsSkeleton = isLoadingLeads && leadsPage === undefined;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
              {t('title')}
            </h1>
            <div className="flex flex-col gap-0.5 text-neutral-600 dark:text-neutral-400 sm:block">
              <span className="block sm:inline">{t('page.manageSubtitle')}</span>
              <span className="hidden sm:inline"> · </span>
              <span className="block sm:inline">
                {showLeadsSkeleton ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-600" />
                    {t('page.loading')}
                  </span>
                ) : (
                  <>
                    {debouncedSearch || activeFilterCount > 0
                      ? t('page.matchingCount', { count: totalLeads })
                      : t('page.totalLeadsCount', { count: totalLeads })}
                    {totalLeads > 0 && (
                      <>
                        {' '}
                        · {t('page.rowsRange', { start: pageStart, end: pageEnd })}
                        {isFetchingLeads && (
                          <span className="ml-2 inline-flex items-center gap-1 text-primary-600">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          </span>
                        )}
                      </>
                    )}
                  </>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              const qs = selectedClientId != null ? `?client_id=${selectedClientId}` : '';
              navigate(`/leads/form${qs}`);
            }}
            className="inline-flex min-h-[44px] shrink-0 items-center space-x-2 whitespace-nowrap bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">{t('addLead')}</span>
            <span className="sm:hidden">{t('addLeadShort')}</span>
          </button>
        </div>

        {/* Clients switcher */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mr-1">
            {t('page.clients')}
          </span>
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {activeClients.map((client) => {
              const selected = selectedClientId === client.id;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setSelectedClientId(client.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    selected
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                  }`}
                >
                  {client.name}
                  {typeof client.lead_count === 'number' && (
                    <span className={`ml-1.5 tabular-nums ${selected ? 'opacity-90' : 'text-neutral-500'}`}>
                      ({client.lead_count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setIsManageClientsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700"
          >
            <Settings2 className="w-4 h-4" />
            {t('page.manage')}
          </button>
        </div>

        {/* Toolbar: search row, then wrap row for sort/group/actions */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex w-full max-w-3xl items-center gap-2 sm:gap-3">
            <LeadsSearchField
              initialValue={debouncedSearch}
              isFetching={isFetchingLeads}
              onDebouncedChange={handleDebouncedSearch}
            />
            <button
              type="button"
              onClick={() => {
                setDraftFilterStageId(filterStageId);
                setDraftFilterSource(filterSource);
                setDraftFilterSector(filterSector);
                setIsFiltersOpen(true);
              }}
              className="flex shrink-0 items-center space-x-2 px-3 sm:px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            >
              <Filter className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              <span className="text-neutral-700 dark:text-neutral-300">
                {t('page.filters')}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex max-w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
              <ArrowUpDown className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="hidden text-neutral-500 dark:text-neutral-400 md:inline">{t('page.sort')}</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  const next = e.target.value as LeadSortBy;
                  setSortBy(next);
                  setSortDesc(next === 'created_at' || next === 'updated_at');
                }}
                className="max-w-[9.5rem] truncate bg-transparent text-neutral-800 outline-none dark:text-neutral-100 sm:max-w-[12rem]"
              >
                <option value="created_at">{t('page.sortOptions.newest')}</option>
                <option value="updated_at">{t('page.sortOptions.updated')}</option>
                <option value="first_name">{t('page.sortOptions.name')}</option>
                <option value="company">{t('page.sortOptions.company')}</option>
                <option value="job_title">{t('page.sortOptions.jobTitle')}</option>
                <option value="source">{t('page.sortOptions.source')}</option>
                <option value="sector">{t('page.sortOptions.sector')}</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDesc((v) => !v)}
                className="min-h-[36px] min-w-[44px] rounded px-2 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                title={sortDesc ? t('page.descending') : t('page.ascending')}
              >
                {sortDesc ? t('page.descShort') : t('page.ascShort')}
              </button>
            </label>
            <label className="flex max-w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
              <Layers className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="hidden text-neutral-500 dark:text-neutral-400 md:inline">{t('page.group')}</span>
              <select
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value as LeadGroupBy);
                  setCollapsedGroups({});
                }}
                className="max-w-[9.5rem] truncate bg-transparent text-neutral-800 outline-none dark:text-neutral-100 sm:max-w-[12rem]"
              >
                <option value="none">{t('page.groupOptions.none')}</option>
                <option value="personality">{t('page.groupOptions.personality')}</option>
                <option value="source">{t('page.groupOptions.source')}</option>
                <option value="sector">{t('page.groupOptions.sector')}</option>
                <option value="stage">{t('page.groupOptions.stage')}</option>
              </select>
            </label>

            {selectedLeads.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => openMoveDialog('selected')}
                  className="flex min-h-[44px] items-center gap-2 px-3 sm:px-4 py-2.5 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                >
                  <FolderInput className="w-4 h-4 shrink-0 text-primary-700 dark:text-primary-300" />
                  <span className="text-primary-800 dark:text-primary-200">
                    {t('page.moveSelected', { count: selectedLeads.length })}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        t('page.bulkDeleteConfirm', { count: selectedLeads.length }),
                      )
                    ) {
                      bulkDeleteMutation.mutate(selectedLeads);
                    }
                  }}
                  className="flex min-h-[44px] items-center gap-2 px-3 sm:px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4 shrink-0 text-red-700 dark:text-red-300" />
                  <span className="text-red-800 dark:text-red-200">
                    {bulkDeleteMutation.isPending
                      ? t('page.deleting')
                      : t('page.deleteSelected', { count: selectedLeads.length })}
                  </span>
                </button>
              </>
            )}
            {selectedClientId != null && totalLeads > 0 && (
              <button
                type="button"
                onClick={() => openMoveDialog('all_in_client')}
                className="flex min-h-[44px] items-center gap-2 px-3 sm:px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                title={t('page.moveAllTitle')}
              >
                <FolderInput className="w-4 h-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
                <span className="hidden sm:inline text-neutral-700 dark:text-neutral-300">{t('page.moveAll')}</span>
                <span className="sm:hidden text-neutral-700 dark:text-neutral-300">{t('page.moveShort')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setImportClientId(selectedClientId);
                resetImportDialog();
                setIsUploadDialogOpen(true);
              }}
              className="flex min-h-[44px] items-center gap-2 px-3 sm:px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
              title={t('common:import')}
            >
              <Upload className="w-4 h-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
              <span className="hidden sm:inline text-neutral-700 dark:text-neutral-300">{t('common:import')}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              className="flex min-h-[44px] items-center gap-2 px-3 sm:px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
              title={t('common:export')}
            >
              <Download className="w-4 h-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
              <span className="hidden sm:inline text-neutral-700 dark:text-neutral-300">{t('common:export')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <LeadsPaginationBar
          page={page}
          pageSize={pageSize}
          totalLeads={totalLeads}
          totalPages={totalPages}
          canPrev={canPrev}
          canNext={canNext}
          isLoadingLeads={isLoadingLeads}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(0);
          }}
        />
      </div>

      <div className="space-y-4">
        {leadGroups.map((group) => {
          const collapsed = Boolean(collapsedGroups[group.key]);
          return (
            <div
              key={group.key}
              className={`relative -mx-4 overflow-x-auto rounded-none border-y border-neutral-200 bg-white shadow-sm sm:mx-0 sm:rounded-xl sm:border dark:border-neutral-700 dark:bg-neutral-800 ${
                isFetchingLeads ? 'opacity-70' : ''
              }`}
            >
              {isFetchingLeads && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-white/40 pt-16 dark:bg-neutral-900/40">
                  <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('page.updatingResults')}
                  </span>
                </div>
              )}
              {groupBy !== 'none' && (
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedGroups((prev) => ({
                      ...prev,
                      [group.key]: !prev[group.key],
                    }))
                  }
                  className="flex w-full items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-left dark:border-neutral-700 dark:bg-neutral-700/40"
                >
                  <span className="flex items-center gap-2 font-medium text-neutral-900 dark:text-neutral-50">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                    />
                    {GROUP_LABEL_KEYS[group.key] ? t(GROUP_LABEL_KEYS[group.key]) : group.key}
                  </span>
                  <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium tabular-nums text-neutral-700 dark:bg-neutral-600 dark:text-neutral-100">
                    {group.leads.length}
                  </span>
                </button>
              )}
              {!collapsed && (
                <table className="w-full min-w-[720px] sm:min-w-[640px]">
                  {groupBy === 'none' && (
                    <thead className="bg-neutral-50 dark:bg-neutral-700/50 border-b border-neutral-200 dark:border-neutral-700">
                      <tr>
                        <th className="px-3 sm:px-6 py-3 text-left">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded"
                            checked={leads.length > 0 && leads.every((l) => selectedLeads.includes(l.id))}
                            onChange={toggleSelectAll}
                            aria-label={t('page.selectAll')}
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {t('page.columnLead')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {t('page.columnContact')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {t('page.columnJobTitle')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {t('page.columnStage')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {t('page.columnTypePersonality')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {t('page.columnAssigned')}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {t('common:actions')}
                        </th>
                      </tr>
                    </thead>
                  )}
                  {groupBy !== 'none' && (
                    <thead className="bg-neutral-50/80 dark:bg-neutral-700/30 border-b border-neutral-200 dark:border-neutral-700">
                      <tr>
                        <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase">{t('page.columnSelect')}</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase">{t('page.columnLead')}</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase">{t('page.columnContact')}</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase">{t('page.columnJobTitle')}</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase">{t('page.columnStage')}</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase">{t('page.columnTypePersonality')}</th>
                        <th className="px-6 py-2 text-left text-xs font-medium text-neutral-500 uppercase">{t('page.columnAssigned')}</th>
                        <th className="px-6 py-2 text-right text-xs font-medium text-neutral-500 uppercase">{t('common:actions')}</th>
                      </tr>
                    </thead>
                  )}
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                    {group.leads.map((lead) => (
                      <tr
                        key={lead.id}
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 sm:px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded"
                            checked={selectedLeads.includes(lead.id)}
                            onChange={() => toggleSelectLead(lead.id)}
                            aria-label={t('page.selectLead', { name: lead.full_name || lead.id })}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center">
                              <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                            </div>
                            <div>
                              <div className="font-medium text-neutral-900 dark:text-neutral-50">
                                {lead.full_name || `${lead.first_name} ${lead.last_name}`}
                              </div>
                              <div className="text-sm text-neutral-500 dark:text-neutral-400">
                                {lead.company || t('page.noCompany')}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-neutral-900 dark:text-neutral-50">{lead.email || '-'}</div>
                          <div className="text-sm text-neutral-500 dark:text-neutral-400">{lead.telephone || lead.mobile || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-neutral-900 dark:text-neutral-50">{lead.job_title || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
                            {lead.stage?.name || t('page.groups.noStage')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-neutral-900 dark:text-neutral-50">
                            {lead.source || '—'}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            {GROUP_LABEL_KEYS[getLeadPersonality(lead)] ? t(GROUP_LABEL_KEYS[getLeadPersonality(lead)]) : getLeadPersonality(lead)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-900 dark:text-neutral-50">
                          {lead.user ? `${lead.user.first_name} ${lead.user.last_name}` : t('page.unassigned')}
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                                aria-label={t('page.actionsFor', { name: lead.full_name || lead.id })}
                              >
                                <MoreVertical className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-[200] w-44">
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => navigate(`/leads/${lead.id}`)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                {t('common:view')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => navigate(`/leads/${lead.id}?edit=1`)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                {t('common:edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => {
                                  setSelectedLeads([lead.id]);
                                  setMoveMode('selected');
                                  setIsMoveDialogOpen(true);
                                }}
                              >
                                <FolderInput className="mr-2 h-4 w-4" />
                                {t('page.moveToClient')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer text-red-600 focus:text-red-600"
                                disabled={deleteLeadMutation.isPending}
                                onClick={() => {
                                  const name = lead.full_name || `${lead.first_name} ${lead.last_name}`.trim() || t('page.thisLead');
                                  if (window.confirm(t('page.deleteConfirm', { name }))) {
                                    deleteLeadMutation.mutate(lead.id);
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {deleteLeadMutation.isPending && deleteLeadMutation.variables === lead.id
                                  ? t('page.deleting')
                                  : t('common:delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
        {showLeadsSkeleton && (
          <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-700" />
            ))}
          </div>
        )}
        {!showLeadsSkeleton && !isLoadingLeads && !isFetchingLeads && leads.length === 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white py-12 text-center text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            {t('page.emptyClient')}
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-700">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {t('page.pagination')}
        </p>
        <LeadsPaginationBar
          page={page}
          pageSize={pageSize}
          totalLeads={totalLeads}
          totalPages={totalPages}
          canPrev={canPrev}
          canNext={canNext}
          isLoadingLeads={isLoadingLeads}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(0);
          }}
        />
      </div>

      <Dialog open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('page.organizeTitle')}</DialogTitle>
            <DialogDescription>
              {t('page.organizeDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="filter-stage">{t('page.pipelineStage')}</Label>
              <select
                id="filter-stage"
                value={draftFilterStageId ?? ''}
                onChange={(e) =>
                  setDraftFilterStageId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              >
                <option value="">{t('page.allStages')}</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-source">{t('page.sortOptions.source')}</Label>
              <Input
                id="filter-source"
                placeholder={t('page.sourcePlaceholder')}
                value={draftFilterSource}
                onChange={(e) => setDraftFilterSource(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-sector">{t('page.sortOptions.sector')}</Label>
              <Input
                id="filter-sector"
                placeholder={t('page.sectorPlaceholder')}
                value={draftFilterSector}
                onChange={(e) => setDraftFilterSector(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraftFilterStageId(null);
                setDraftFilterSource('');
                setDraftFilterSector('');
                setFilterStageId(null);
                setFilterSource('');
                setFilterSector('');
              }}
            >
              {t('common:clear')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setFilterStageId(draftFilterStageId);
                setFilterSource(draftFilterSource);
                setFilterSector(draftFilterSector);
                setIsFiltersOpen(false);
              }}
            >
              {t('common:apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog
        open={isUploadDialogOpen}
        onOpenChange={(open) => {
          setIsUploadDialogOpen(open);
          if (!open) resetImportDialog();
        }}
      >
        <DialogContent className={importStep === 'mapping' ? 'sm:max-w-4xl max-h-[90vh] overflow-y-auto' : 'sm:max-w-md'}>
          <DialogHeader>
            <DialogTitle>{t('importLeads')}</DialogTitle>
            <DialogDescription>
              {importStep === 'file'
                ? t('page.importDescription')
                : t('page.importMappingHint')}
            </DialogDescription>
            <div className="flex gap-2 pt-2 text-xs font-medium">
              <span className={importStep === 'file' ? 'text-primary-600' : 'text-neutral-400'}>
                {t('page.importStepFile')}
              </span>
              <span className="text-neutral-300">→</span>
              <span className={importStep === 'mapping' ? 'text-primary-600' : 'text-neutral-400'}>
                {t('page.importStepMapping')}
              </span>
            </div>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {importStep === 'file' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="import-client">{t('page.client')}</Label>
                  <select
                    id="import-client"
                    value={importClientId ?? ''}
                    onChange={(e) => setImportClientId(Number(e.target.value))}
                    className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                  >
                    {activeClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.is_default ? ` (${t('page.defaultLabel')})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-500">
                    {t('page.importClientHint')}
                  </p>
                </div>

                <div className="flex flex-col space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center space-x-2 px-4 py-8 border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-400 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-neutral-400" />
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      {selectedFile ? selectedFile.name : t('page.clickToSelectFile')}
                    </span>
                  </button>
                  
                  {selectedFile && (
                    <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/20 rounded flex items-center justify-center">
                          <FileDown className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{selectedFile.name}</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {(selectedFile.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setImportPreview(null);
                          setHeaderMapping({});
                        }}
                        className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
                      >
                        <X className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                      </button>
                    </div>
                  )}
                  
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t('page.supportedFormats')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  <span className="text-sm">{t('page.downloadTemplate')}</span>
                </button>
              </>
            ) : (
              <>
                {importPreview && (
                  <p className="text-xs text-neutral-500 flex items-center gap-2">
                    {isRemappingPreview && (
                      <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    )}
                    {t('page.importPreviewStats', {
                      identity: importPreview.identity_rows,
                      skipped: importPreview.skippable_empty_rows,
                      total: importPreview.total_rows,
                    })}
                  </p>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {t('page.importMappingTitle')}
                  </p>
                  <p className="text-xs text-neutral-500">{t('page.importMappingHint')}</p>
                  {(importPreview?.headers || []).map((header) => (
                    <div key={header} className="grid grid-cols-2 gap-2 items-center">
                      <Label className="text-xs text-neutral-600 dark:text-neutral-400 truncate" title={header}>
                        {header}
                      </Label>
                      <select
                        value={headerMapping[header] ?? 'skip'}
                        onChange={(e) =>
                          setHeaderMapping((prev) => ({
                            ...prev,
                            [header]: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                      >
                        {mappingFieldOptions.map((field) => (
                          <option key={`${header}-${field}`} value={field}>
                            {importFieldLabel(field)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {importPreview && importPreview.sample_rows.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t('page.importSampleTitle')}</p>
                    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-neutral-50 dark:bg-neutral-800">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-medium">{importFieldLabel('first_name')}</th>
                            <th className="px-2 py-1.5 text-left font-medium">{importFieldLabel('last_name')}</th>
                            <th className="px-2 py-1.5 text-left font-medium">{importFieldLabel('company')}</th>
                            <th className="px-2 py-1.5 text-left font-medium">{importFieldLabel('email')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.sample_rows.map((row, i) => (
                            <tr key={i} className="border-t border-neutral-100 dark:border-neutral-700">
                              <td className="px-2 py-1.5">{String(row.mapped?.first_name ?? '—')}</td>
                              <td className="px-2 py-1.5">{String(row.mapped?.last_name ?? '—')}</td>
                              <td className="px-2 py-1.5">{String(row.mapped?.company ?? '—')}</td>
                              <td className="px-2 py-1.5">{String(row.mapped?.email ?? '—')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            {importStep === 'mapping' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setImportStep('file')}
                  disabled={isUploading}
                >
                  {t('page.importBack')}
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!canConfirmImport}
                  className="bg-primary-600 hover:bg-primary-700"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('page.uploading')}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {t('page.importConfirmCount', {
                        count: importPreview?.identity_rows ?? 0,
                      })}
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsUploadDialogOpen(false);
                    resetImportDialog();
                  }}
                  disabled={isUploading || isPreviewing}
                >
                  {t('common:cancel')}
                </Button>
                <Button
                  onClick={handlePreviewContinue}
                  disabled={!selectedFile || isPreviewing}
                  className="bg-primary-600 hover:bg-primary-700"
                >
                  {isPreviewing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('page.uploading')}
                    </>
                  ) : (
                    t('page.importContinue')
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Clients Dialog */}
      <Dialog open={isManageClientsOpen} onOpenChange={setIsManageClientsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('page.manageClientsTitle')}</DialogTitle>
            <DialogDescription>
              {t('page.manageClientsDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Input
                placeholder={t('page.newClientName')}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
              />
              <Button
                type="button"
                disabled={!newClientName.trim() || createClientMutation.isPending}
                onClick={() => createClientMutation.mutate(newClientName.trim())}
              >
                {t('common:add')}
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('page.active')}</p>
              {activeClients.map((client) => (
                <div
                  key={client.id}
                  className="flex flex-col gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3"
                >
                  {renamingId === client.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="flex-1 min-w-[8rem]"
                      />
                      <Button
                        size="sm"
                        disabled={!renameValue.trim() || renameClientMutation.isPending}
                        onClick={() =>
                          renameClientMutation.mutate({ id: client.id, name: renameValue.trim() })
                        }
                      >
                        {t('common:save')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRenamingId(null)}>
                        {t('common:cancel')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex-1 font-medium text-neutral-900 dark:text-neutral-50">
                          {client.name}
                          {client.is_default && (
                            <span className="ml-2 text-xs text-neutral-500">{t('page.defaultLabel')}</span>
                          )}
                          {!client.is_default && client.assigned_user_name && (
                            <span className="ml-2 text-xs text-neutral-500">
                              · {client.assigned_user_name}
                            </span>
                          )}
                          {!client.is_default && !client.assigned_user_id && (
                            <span className="ml-2 text-xs text-neutral-500">
                              · {t('page.sharedWithTeam')}
                            </span>
                          )}
                        </span>
                        {!client.is_default && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRenamingId(client.id);
                                setRenameValue(client.name);
                              }}
                            >
                              {t('page.rename')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={archiveClientMutation.isPending}
                              onClick={() => archiveClientMutation.mutate(client.id)}
                            >
                              {t('page.archive')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 dark:text-red-400"
                              disabled={
                                deleteClientMutation.isPending ||
                                requestDeleteClientMutation.isPending
                              }
                              onClick={() => {
                                const count = client.lead_count ?? 0;
                                if (isAdmin) {
                                  if (
                                    window.confirm(
                                      t('page.deleteClientConfirm', {
                                        name: client.name,
                                        count,
                                      })
                                    )
                                  ) {
                                    deleteClientMutation.mutate(client.id);
                                  }
                                } else if (
                                  window.confirm(
                                    t('page.requestDeleteConfirm', {
                                      name: client.name,
                                      count,
                                    })
                                  )
                                ) {
                                  requestDeleteClientMutation.mutate(client.id);
                                }
                              }}
                            >
                              {t('page.deleteClient')}
                            </Button>
                          </>
                        )}
                      </div>
                      {isAdmin && !client.is_default && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-neutral-500 whitespace-nowrap">
                            {t('page.assignTo')}
                          </label>
                          <select
                            className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                            value={
                              client.assigned_user_id == null
                                ? ''
                                : String(client.assigned_user_id)
                            }
                            disabled={assignClientMutation.isPending}
                            onChange={(e) => {
                              const raw = e.target.value;
                              assignClientMutation.mutate({
                                id: client.id,
                                assignedUserId: raw === '' ? null : Number(raw),
                              });
                            }}
                          >
                            <option value="">{t('page.sharedWithTeam')}</option>
                            {assignableUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {[u.first_name, u.last_name].filter(Boolean).join(' ') ||
                                  u.email ||
                                  `#${u.id}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {archivedClients.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t('page.archived')}
                </p>
                {archivedClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-600 p-3"
                  >
                    <span className="flex-1 text-neutral-600 dark:text-neutral-400">
                      {client.name}
                      {typeof client.lead_count === 'number' && (
                        <span className="ml-2 text-xs text-neutral-500">
                          ({client.lead_count})
                        </span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        restoreClientMutation.isPending ||
                        deleteClientMutation.isPending ||
                        requestDeleteClientMutation.isPending
                      }
                      onClick={() => restoreClientMutation.mutate(client.id)}
                    >
                      {t('page.restore')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                      disabled={
                        deleteClientMutation.isPending ||
                        requestDeleteClientMutation.isPending
                      }
                      onClick={() => {
                        const count = client.lead_count ?? 0;
                        if (isAdmin) {
                          if (
                            window.confirm(
                              t('page.deleteClientConfirm', {
                                name: client.name,
                                count,
                              })
                            )
                          ) {
                            deleteClientMutation.mutate(client.id);
                          }
                        } else if (
                          window.confirm(
                            t('page.requestDeleteConfirm', {
                              name: client.name,
                              count,
                            })
                          )
                        ) {
                          requestDeleteClientMutation.mutate(client.id);
                        }
                      }}
                    >
                      {t('page.deleteClient')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsManageClientsOpen(false)}>
              {t('common:close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move leads to another client */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('page.moveDialogTitle')}</DialogTitle>
            <DialogDescription>
              {moveMode === 'all_in_client'
                ? t('page.moveAllDescription', {
                    name: activeClients.find((c) => c.id === selectedClientId)?.name ?? t('page.thisClient'),
                  })
                : t('page.moveSelectedDescription', { count: selectedLeads.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="move-target">{t('page.destinationClient')}</Label>
            <select
              id="move-target"
              value={moveTargetClientId ?? ''}
              onChange={(e) => setMoveTargetClientId(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
            >
              {activeClients
                .filter((c) => c.id !== selectedClientId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsMoveDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              type="button"
              disabled={!moveTargetClientId || moveClientMutation.isPending}
              onClick={() => moveClientMutation.mutate()}
            >
              {moveClientMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('page.moving')}
                </>
              ) : (
                t('page.moveLeads')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
