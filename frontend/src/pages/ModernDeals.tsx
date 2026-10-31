/**
 * Modern Deals Page — pipeline with drag-and-drop between stages (aligned with DealStatus).
 */

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import api from '@/services/axios';
import {
  DollarSign,
  Plus,
  Filter,
  Search,
  Calendar,
  MoreVertical,
  Loader2,
  GripVertical,
  Trash2,
  Pencil,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Backend DealStatus string values */
type DealStatusStr =
  | 'Lead'
  | 'Qualified'
  | 'Proposal'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost';

interface ApiDeal {
  id: number;
  name: string;
  amount: string | number;
  status: DealStatusStr;
  valid_until?: string | null;
  lead_id: number;
  assigned_to_id: number;
  currency_id: number;
  created_at: string;
}

interface DealListBody {
  items: ApiDeal[];
  total: number;
}

/** UI pipeline column keys */
type UiStageId =
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

const STAGES: { id: UiStageId; name: string; headerClass: string; dotClass: string }[] = [
  { id: 'qualification', name: 'Lead / Qualified', headerClass: 'bg-blue-500', dotClass: 'bg-blue-500' },
  { id: 'proposal', name: 'Proposal', headerClass: 'bg-purple-500', dotClass: 'bg-purple-500' },
  { id: 'negotiation', name: 'Negotiation', headerClass: 'bg-orange-500', dotClass: 'bg-orange-500' },
  { id: 'closed_won', name: 'Closed Won', headerClass: 'bg-green-500', dotClass: 'bg-green-500' },
  { id: 'closed_lost', name: 'Closed Lost', headerClass: 'bg-red-500', dotClass: 'bg-red-500' },
];

function mapStatusToUiStage(status: string): UiStageId {
  switch (status) {
    case 'Lead':
    case 'Qualified':
      return 'qualification';
    case 'Proposal':
      return 'proposal';
    case 'Negotiation':
      return 'negotiation';
    case 'Closed Won':
      return 'closed_won';
    case 'Closed Lost':
      return 'closed_lost';
    default:
      return 'qualification';
  }
}

function uiStageToApiStatus(stage: UiStageId): DealStatusStr {
  switch (stage) {
    case 'qualification':
      return 'Qualified';
    case 'proposal':
      return 'Proposal';
    case 'negotiation':
      return 'Negotiation';
    case 'closed_won':
      return 'Closed Won';
    case 'closed_lost':
      return 'Closed Lost';
  }
}

const STATUS_WEIGHT: Record<string, number> = {
  Lead: 20,
  Qualified: 35,
  Proposal: 55,
  Negotiation: 75,
  'Closed Won': 100,
  'Closed Lost': 0,
};

const STATUS_LABEL_KEY: Record<DealStatusStr, string> = {
  Lead: 'statuses.lead',
  Qualified: 'statuses.qualified',
  Proposal: 'statuses.proposal',
  Negotiation: 'statuses.negotiation',
  'Closed Won': 'statuses.closedWon',
  'Closed Lost': 'statuses.closedLost',
};

function toAmountNumber(amount: string | number): number {
  if (typeof amount === 'number') return amount;
  const n = parseFloat(amount);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function DroppableStageBody({
  stageId,
  children,
}: {
  stageId: UiStageId;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stageId}`,
    data: { stageId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`bg-muted/50 dark:bg-background/50 rounded-b-xl border-x border-b border-border p-3 space-y-3 min-h-[320px] transition-colors ${
        isOver ? 'ring-2 ring-inset ring-primary-500 bg-primary-50/40 dark:bg-primary-950/20' : ''
      }`}
    >
      {children}
    </div>
  );
}

function DraggableDealCard({
  deal,
  disabled,
  onOpen,
  onEdit,
  onDelete,
}: {
  deal: ApiDeal;
  disabled?: boolean;
  onOpen: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useTranslation('deals');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `deal-${deal.id}`,
    data: { deal },
    disabled,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const value = toAmountNumber(deal.amount);
  const weight = STATUS_WEIGHT[deal.status] ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card rounded-lg border border-border hover:shadow-md transition-shadow ${
        isDragging ? 'opacity-50 shadow-lg z-10' : ''
      }`}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between p-4 gap-2">
        <div className="mt-0.5 shrink-0 p-1 rounded text-muted-foreground">
          <GripVertical className="w-4 h-4" />
        </div>
        <button
          type="button"
          className="flex-1 min-w-0 text-left"
          onClick={() => onOpen(deal.id)}
        >
          <h4 className="font-medium text-foreground text-sm mb-1 truncate">
            {deal.name}
          </h4>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground dark:text-muted-foreground">
            <DollarSign className="w-3 h-3 shrink-0" />
            <span className="font-semibold">${formatMoney(value)}</span>
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="p-1 hover:bg-muted rounded shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground dark:text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit(deal.id);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t('editDeal')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(deal.id);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('deleteDeal')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-4 pb-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground dark:text-muted-foreground">{t('stageWeight')}</span>
          <span className="font-medium text-foreground">{weight}%</span>
        </div>
        {deal.valid_until && (
          <div className="flex items-center text-xs text-muted-foreground dark:text-muted-foreground">
            <Calendar className="w-3 h-3 mr-1 shrink-0" />
            {t('closeBy', { date: new Date(deal.valid_until).toLocaleDateString() })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModernDeals() {
  const { t } = useTranslation('deals');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<DealStatusStr>>(() => new Set());
  const [activeDeal, setActiveDeal] = useState<ApiDeal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const { data: axiosResponse, isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: async () => api.get<DealListBody>('/deals/'),
  });

  const rawDeals: ApiDeal[] = axiosResponse?.data?.items ?? [];

  const deleteDeal = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/deals/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast({ title: t('deleted') });
    },
    onError: () => {
      toast({ title: t('deleteFailed'), variant: 'destructive' });
    },
  });

  const handleDeleteDeal = (id: number) => {
    if (window.confirm(t('deleteConfirm'))) {
      deleteDeal.mutate(id);
    }
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: DealStatusStr }) => {
      await api.put(`/deals/${id}/`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast({
        title: t('stageUpdated'),
        description: t('stageUpdatedDescription'),
      });
    },
    onError: (err: unknown) => {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'detail' in err.response.data
          ? String((err.response.data as { detail: unknown }).detail)
          : null;
      toast({
        title: t('moveFailed'),
        description: msg || t('moveFailedDescription'),
        variant: 'destructive',
      });
    },
  });

  const filteredDeals = useMemo(() => {
    let list = rawDeals;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    if (statusFilter.size > 0) {
      list = list.filter((d) => statusFilter.has(d.status));
    }
    return list;
  }, [rawDeals, searchQuery, statusFilter]);

  const dealsByStage = useMemo(() => {
    return STAGES.map((stage) => {
      const deals = filteredDeals.filter((d) => mapStatusToUiStage(d.status) === stage.id);
      const totalValue = deals.reduce((sum, d) => sum + toAmountNumber(d.amount), 0);
      return { ...stage, deals, totalValue };
    });
  }, [filteredDeals]);

  const totalValue = useMemo(
    () => filteredDeals.reduce((sum, d) => sum + toAmountNumber(d.amount), 0),
    [filteredDeals],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const dealId = Number(String(event.active.id).replace(/^deal-/, ''));
    const d = rawDeals.find((x) => x.id === dealId) ?? null;
    setActiveDeal(d);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = Number(String(active.id).replace(/^deal-/, ''));
    const overId = String(over.id);
    if (!overId.startsWith('stage-')) return;

    const stageKey = overId.replace(/^stage-/, '') as UiStageId;
    if (!STAGES.some((s) => s.id === stageKey)) return;

    const deal = rawDeals.find((d) => d.id === dealId);
    if (!deal) return;

    const newStatus = uiStageToApiStatus(stageKey);
    if (deal.status === newStatus) return;

    updateStatus.mutate({ id: dealId, status: newStatus });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background p-4 sm:p-6 md:p-8">
      <div className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{t('title')}</h1>
            <p className="text-muted-foreground dark:text-muted-foreground">
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                  {t('loading')}
                </span>
              ) : (
                <>
                  {t('pipelineSummary', { value: formatMoney(totalValue), shown: filteredDeals.length })}
                  {searchQuery.trim() ? ` ${t('totalSuffix', { total: rawDeals.length })}` : ''}
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground dark:text-foreground0">
              {t('dragHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/deals/new')}
            className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>{t('newDeal')}</span>
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-card border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <Filter className="w-5 h-5 text-muted-foreground dark:text-muted-foreground" />
            <span className="text-foreground dark:text-muted-foreground">{t('filters')}</span>
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3 xl:grid-cols-5">
          {dealsByStage.map((stage) => (
            <div key={stage.id} className="flex w-[min(100%,18rem)] flex-shrink-0 flex-col md:w-auto">
              <div className="bg-card rounded-t-xl p-4 border-x border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${stage.dotClass}`} />
                    <h3 className="font-semibold text-foreground text-sm">
                      {t(`stages.${stage.id}`)}
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground">{stage.deals.length}</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  ${formatMoney(stage.totalValue)}
                </div>
              </div>

              <DroppableStageBody stageId={stage.id}>
                {isLoading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={`skel-${stage.id}-${i}`}
                        className="mb-2 h-20 animate-pulse rounded-lg bg-muted dark:bg-muted"
                      />
                    ))
                  : stage.deals.map((deal) => (
                      <DraggableDealCard
                        key={deal.id}
                        deal={deal}
                        disabled={updateStatus.isPending || deleteDeal.isPending}
                        onOpen={(id) => navigate(`/deals/${id}`)}
                        onEdit={(id) => navigate(`/deals/${id}`)}
                        onDelete={handleDeleteDeal}
                      />
                    ))}
                {!isLoading && stage.deals.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground dark:text-muted-foreground text-sm">
                    {t('dropHere')}
                  </div>
                )}
              </DroppableStageBody>
            </div>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDeal ? (
            <div className="pointer-events-none w-[280px] rounded-lg border border-primary-300 bg-card p-3 shadow-xl dark:border-primary-700 dark:bg-card">
              <p className="text-sm font-medium text-foreground">{activeDeal.name}</p>
              <p className="text-xs text-muted-foreground">
                ${formatMoney(toAmountNumber(activeDeal.amount))} · {t(STATUS_LABEL_KEY[activeDeal.status] ?? 'statuses.lead')}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('filterTitle')}</DialogTitle>
            <DialogDescription>
              {t('filterDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'] as DealStatusStr[]).map(
              (s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 text-sm text-foreground dark:text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-neutral-300"
                    checked={statusFilter.has(s)}
                    onChange={() => {
                      setStatusFilter((prev) => {
                        const next = new Set(prev);
                        if (next.has(s)) next.delete(s);
                        else next.add(s);
                        return next;
                      });
                    }}
                  />
                  {t(STATUS_LABEL_KEY[s])}
                </label>
              )
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setStatusFilter(new Set())}>
              {t('common:clear')}
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>
              {t('done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
