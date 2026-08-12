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

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { leadsAPI, type Lead } from '@/services/api/leads';
import { clientsAPI, type Client } from '@/services/api/clients';
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
  Settings2,
  FolderInput,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
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
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (n: number) => void;
};

function LeadsPaginationBar({
  page,
  pageSize,
  totalLeads,
  totalPages,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onPageSizeChange,
}: PaginationBarProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      role="navigation"
      aria-label="Leads pagination"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
        <span className="font-medium">Rows per page</span>
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
          {totalLeads > 0 ? `${totalLeads} total` : 'No leads'}
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
          Previous
        </button>
        <span className="min-w-[8rem] px-2 text-center text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
          Page {Math.min(page + 1, totalPages)} / {totalPages}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={onNext}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ModernLeads() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLeads, setSelectedLeads] = useState<number[]>([]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isManageClientsOpen, setIsManageClientsOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [importClientId, setImportClientId] = useState<number | null>(null);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [moveTargetClientId, setMoveTargetClientId] = useState<number | null>(null);
  const [moveMode, setMoveMode] = useState<'selected' | 'all_in_client'>('selected');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
    setSelectedLeads([]);
  }, [debouncedSearch, selectedClientId]);

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'with-archived'],
    queryFn: () => clientsAPI.list(true),
  });

  const allClients: Client[] = clientsData?.items ?? [];
  const activeClients = allClients.filter((c) => !c.is_archived);
  const archivedClients = allClients.filter((c) => c.is_archived);

  useEffect(() => {
    if (selectedClientId != null || activeClients.length === 0) return;
    const general = activeClients.find((c) => c.is_default) ?? activeClients[0];
    setSelectedClientId(general.id);
  }, [activeClients, selectedClientId]);

  // Keep import target in sync with the active Clients tab
  useEffect(() => {
    if (selectedClientId != null) {
      setImportClientId(selectedClientId);
    }
  }, [selectedClientId]);

  // Fetch leads from backend (paginated; debounced search avoids remounting the page each keystroke)
  const { data: leadsPage, isLoading: isLoadingLeads, isFetching: isFetchingLeads } = useQuery({
    queryKey: ['leads', debouncedSearch, page, pageSize, selectedClientId],
    enabled: selectedClientId != null,
    queryFn: async () => {
      const res = await leadsAPI.getAll({
        search: debouncedSearch || undefined,
        skip: page * pageSize,
        limit: pageSize,
        sort_by: 'created_at',
        sort_desc: true,
        client_id: selectedClientId ?? undefined,
      });
      return normalizeLeadListPayload(res.data) as LeadListResponse;
    },
    placeholderData: keepPreviousData,
  });
  const leads: Lead[] = leadsPage?.results ?? [];
  const totalLeads = leadsPage?.total ?? 0;
  const pageStart = totalLeads === 0 ? 0 : page * pageSize + 1;
  const pageEnd = page * pageSize + leads.length;

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) {
        throw new Error('You must be logged in to import leads.');
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assigned_user_id', String(user.id));
      const clientForImport = importClientId ?? selectedClientId;
      if (!clientForImport) {
        throw new Error('Select a client before importing.');
      }
      formData.append('client_id', String(clientForImport));
      return leadsAPI.uploadCSV(formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      toast({
        title: "Success",
        description: "Leads imported successfully!",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ||
        error?.message ||
        "Failed to import leads";
      toast({
        title: "Error",
        description: typeof detail === "string" ? detail : JSON.stringify(detail),
        variant: "destructive",
      });
    },
  });

  const createClientMutation = useMutation({
    mutationFn: (name: string) => clientsAPI.create(name),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setNewClientName('');
      setSelectedClientId(created.id);
      toast({ title: 'Client created', description: created.name });
    },
    onError: (error: any) => {
      toast({
        title: 'Could not create client',
        description: error?.response?.data?.detail || error?.message || 'Failed',
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
      toast({ title: 'Client renamed' });
    },
    onError: (error: any) => {
      toast({
        title: 'Rename failed',
        description: error?.response?.data?.detail || error?.message || 'Failed',
        variant: 'destructive',
      });
    },
  });

  const archiveClientMutation = useMutation({
    mutationFn: (id: number) => clientsAPI.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      const general = activeClients.find((c) => c.is_default);
      if (general) setSelectedClientId(general.id);
      toast({ title: 'Client archived' });
    },
    onError: (error: any) => {
      toast({
        title: 'Archive failed',
        description: error?.response?.data?.detail || error?.message || 'Failed',
        variant: 'destructive',
      });
    },
  });

  const restoreClientMutation = useMutation({
    mutationFn: (id: number) => clientsAPI.restore(id),
    onSuccess: (restored) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setSelectedClientId(restored.id);
      toast({ title: 'Client restored' });
    },
    onError: (error: any) => {
      toast({
        title: 'Restore failed',
        description: error?.response?.data?.detail || error?.message || 'Failed',
        variant: 'destructive',
      });
    },
  });

  const moveClientMutation = useMutation({
    mutationFn: async () => {
      if (!moveTargetClientId) throw new Error('Pick a destination client');
      if (moveMode === 'all_in_client') {
        if (!selectedClientId) throw new Error('No source client');
        return leadsAPI.moveToClient({
          to_client_id: moveTargetClientId,
          from_client_id: selectedClientId,
          move_all_from_client: true,
        });
      }
      if (selectedLeads.length === 0) throw new Error('Select at least one lead');
      return leadsAPI.moveToClient({
        to_client_id: moveTargetClientId,
        lead_ids: selectedLeads,
        from_client_id: selectedClientId ?? undefined,
      });
    },
    onSuccess: (res: any) => {
      const payload = res?.data ?? res;
      const msg = payload?.message || 'Leads moved';
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setSelectedLeads([]);
      setIsMoveDialogOpen(false);
      toast({ title: 'Moved', description: typeof msg === 'string' ? msg : 'Leads moved' });
    },
    onError: (error: any) => {
      toast({
        title: 'Move failed',
        description: error?.response?.data?.detail || error?.message || 'Failed',
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
          title: "Invalid file type",
          description: "Please upload a CSV or Excel file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }
    if (!user?.id) {
      toast({
        title: "Not signed in",
        description: "Please sign in again to import leads.",
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
        title: "Success",
        description: "Template downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download template",
        variant: "destructive",
      });
    }
  };

  const handleExport = async () => {
    try {
      const blob = await leadsAPI.exportCSV({
        search: debouncedSearch || undefined,
        client_id: selectedClientId ?? undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: 'CSV download started.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not download CSV.',
        variant: 'destructive',
      });
    }
  };

  const hasMore = leadsPage?.has_more === true;
  const pagesFromTotal = Math.max(1, Math.ceil(totalLeads / pageSize));
  const totalPages = Math.max(pagesFromTotal, page + (hasMore ? 2 : 1));
  const canPrev = page > 0;
  const canNext = hasMore || (totalLeads > 0 && page < pagesFromTotal - 1);

  // Initial load only — avoid replacing the whole page (and search input) on every refetch
  if (isLoadingLeads && leadsPage === undefined) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-4 sm:p-6 md:p-8 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
              Leads
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Manage and track your sales pipeline • {totalLeads} total leads
              {totalLeads > 0 && (
                <>
                  {' '}
                  · Rows {pageStart}–{pageEnd}
                  {isFetchingLeads && (
                    <span className="ml-2 inline-flex items-center gap-1 text-primary-600">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <button
            onClick={() => navigate('/leads/new')}
            className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>Add Lead</span>
          </button>
        </div>

        {/* Clients switcher */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mr-1">
            Clients
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
            Manage
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mt-4">
          {/* Search & Filter */}
          <div className="flex items-center space-x-3 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search leads by name, company, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsFiltersOpen(true)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            >
              <Filter className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              <span className="text-neutral-700 dark:text-neutral-300">Filters</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {selectedLeads.length > 0 && (
              <button
                type="button"
                onClick={() => openMoveDialog('selected')}
                className="flex items-center space-x-2 px-4 py-2.5 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
              >
                <FolderInput className="w-4 h-4 text-primary-700 dark:text-primary-300" />
                <span className="text-primary-800 dark:text-primary-200">
                  Move {selectedLeads.length}…
                </span>
              </button>
            )}
            {selectedClientId != null && totalLeads > 0 && (
              <button
                type="button"
                onClick={() => openMoveDialog('all_in_client')}
                className="flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                title="Move every lead in this client to another client"
              >
                <FolderInput className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                <span className="text-neutral-700 dark:text-neutral-300">Move all…</span>
              </button>
            )}
            <button 
              onClick={() => {
                setImportClientId(selectedClientId);
                setIsUploadDialogOpen(true);
              }}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            >
              <Upload className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              <span className="text-neutral-700 dark:text-neutral-300">Import</span>
            </button>
            
            <button
              type="button"
              onClick={() => void handleExport()}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            >
              <Download className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              <span className="text-neutral-700 dark:text-neutral-300">Export</span>
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
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(0);
          }}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
          <table className="w-full min-w-[640px]">
            <thead className="bg-neutral-50 dark:bg-neutral-700/50 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={leads.length > 0 && leads.every((l) => selectedLeads.includes(l.id))}
                    onChange={toggleSelectAll}
                    aria-label="Select all leads on this page"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Job Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Stage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Assigned
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedLeads.includes(lead.id)}
                      onChange={() => toggleSelectLead(lead.id)}
                      aria-label={`Select ${lead.full_name || lead.id}`}
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
                          {lead.company || 'No company'}
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
                      {lead.stage?.name || 'No stage'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-900 dark:text-neutral-50">
                    {lead.user ? `${lead.user.first_name} ${lead.user.last_name}` : 'Unassigned'}
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {leads.length === 0 && (
            <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
              No leads in this client yet. Click "Add Lead" or Import to get started.
            </div>
          )}
        </div>

      <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-700">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Pagination
        </p>
        <LeadsPaginationBar
          page={page}
          pageSize={pageSize}
          totalLeads={totalLeads}
          totalPages={totalPages}
          canPrev={canPrev}
          canNext={canNext}
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
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>
              Use search and rows-per-page to narrow results. Stage, tag, and assignee filters are planned next; export respects the current search.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsFiltersOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Leads</DialogTitle>
            <DialogDescription>
              Leads will be assigned to the client selected below (defaults to the Clients tab you are viewing).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-client">Client</Label>
              <select
                id="import-client"
                value={importClientId ?? ''}
                onChange={(e) => setImportClientId(Number(e.target.value))}
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
              >
                {activeClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500">
                All rows in this upload go to this client. A CSV Client column is ignored when you pick a client here.
              </p>
            </div>

            {/* File input */}
            <div className="flex flex-col space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center space-x-2 px-4 py-8 border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-400 transition-colors"
              >
                <Upload className="w-5 h-5 text-neutral-400" />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {selectedFile ? selectedFile.name : 'Click to select file'}
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
                    onClick={() => setSelectedFile(null)}
                    className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
                  >
                    <X className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  </button>
                </div>
              )}
              
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Supported formats: CSV, XLS, XLSX
              </p>
            </div>

            {/* Download template button */}
            <button
              onClick={handleDownloadTemplate}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <FileDown className="w-4 h-4" />
              <span className="text-sm">Download Template</span>
            </button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadDialogOpen(false);
                setSelectedFile(null);
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="bg-primary-600 hover:bg-primary-700"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Leads
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Clients Dialog */}
      <Dialog open={isManageClientsOpen} onOpenChange={setIsManageClientsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Clients</DialogTitle>
            <DialogDescription>
              Add, rename, archive, or restore clients. General cannot be archived or renamed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Input
                placeholder="New client name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
              />
              <Button
                type="button"
                disabled={!newClientName.trim() || createClientMutation.isPending}
                onClick={() => createClientMutation.mutate(newClientName.trim())}
              >
                Add
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Active</p>
              {activeClients.map((client) => (
                <div
                  key={client.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3"
                >
                  {renamingId === client.id ? (
                    <>
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
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRenamingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-medium text-neutral-900 dark:text-neutral-50">
                        {client.name}
                        {client.is_default && (
                          <span className="ml-2 text-xs text-neutral-500">default</span>
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
                            Rename
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={archiveClientMutation.isPending}
                            onClick={() => archiveClientMutation.mutate(client.id)}
                          >
                            Archive
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {archivedClients.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Archived
                </p>
                {archivedClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-600 p-3"
                  >
                    <span className="flex-1 text-neutral-600 dark:text-neutral-400">
                      {client.name}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restoreClientMutation.isPending}
                      onClick={() => restoreClientMutation.mutate(client.id)}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsManageClientsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move leads to another client */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move leads to client</DialogTitle>
            <DialogDescription>
              {moveMode === 'all_in_client'
                ? `Move all leads currently in “${activeClients.find((c) => c.id === selectedClientId)?.name ?? 'this client'}” to another client.`
                : `Move ${selectedLeads.length} selected lead(s) to another client.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="move-target">Destination client</Label>
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
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!moveTargetClientId || moveClientMutation.isPending}
              onClick={() => moveClientMutation.mutate()}
            >
              {moveClientMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Moving…
                </>
              ) : (
                'Move leads'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
