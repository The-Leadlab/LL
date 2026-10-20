import { useTranslation } from 'react-i18next';
/**
 * Full-page deal view with edit form (PUT /deals/{id}).
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/services/axios';
import dealsAPI from '@/services/api/deals';
import { ArrowLeft, Calendar, DollarSign, Loader2, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useToast } from '@/hooks/use-toast';

const DEAL_STATUSES = [
  'Lead',
  'Qualified',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
] as const;

interface ApiDeal {
  id: number;
  name: string;
  amount: string | number;
  status: string;
  valid_until?: string | null;
  lead_id: number;
  assigned_to_id: number;
  currency_id: number;
  created_at: string;
}

export function ModernDealDetail() {
  const { t } = useTranslation('modules');
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const dealId = Number(id);

  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [status, setStatus] = useState<string>('Qualified');
  const [validUntil, setValidUntil] = useState('');

  const { data: deal, isLoading, error } = useQuery({
    queryKey: ['deal', dealId],
    queryFn: async () => {
      const r = await api.get<ApiDeal>(`/deals/${dealId}/`);
      return r.data;
    },
    enabled: Number.isFinite(dealId) && dealId > 0,
  });

  const { data: leadName } = useQuery({
    queryKey: ['deal-lead-name', deal?.lead_id],
    queryFn: async () => {
      if (!deal?.lead_id) return null;
      const res = await api.get(`/leads/${deal.lead_id}/`);
      const payload = res.data?.data ?? res.data;
      const first = payload?.first_name ?? '';
      const last = payload?.last_name ?? '';
      const full = `${first} ${last}`.trim();
      return full || `Lead #${deal.lead_id}`;
    },
    enabled: Boolean(deal?.lead_id),
  });

  const { data: assigneeName } = useQuery({
    queryKey: ['deal-assignee-name', deal?.assigned_to_id],
    queryFn: async () => {
      if (!deal?.assigned_to_id) return null;
      try {
        const roster = await api.get('/users/assignable', { params: { limit: 200 } });
        const items = Array.isArray(roster.data?.items) ? roster.data.items : [];
        const match = items.find((u: { id?: number }) => Number(u.id) === Number(deal.assigned_to_id));
        if (match) {
          const full = `${match.first_name || ''} ${match.last_name || ''}`.trim();
          if (full) return full;
        }
      } catch {
        /* fall through to direct user fetch */
      }
      try {
        const res = await api.get(`/users/${deal.assigned_to_id}`);
        const first = res.data?.first_name ?? '';
        const last = res.data?.last_name ?? '';
        const full = `${first} ${last}`.trim();
        if (full) return full;
      } catch {
        /* keep fallback */
      }
      return null;
    },
    enabled: Boolean(deal?.assigned_to_id),
  });

  const { data: currencyLabel } = useQuery({
    queryKey: ['deal-currency', deal?.currency_id],
    queryFn: async () => {
      if (!deal?.currency_id) return null;
      const res = await api.get('/currencies');
      const rows = Array.isArray(res.data) ? res.data : res.data?.items || [];
      const match = rows.find((c: { id?: number }) => Number(c.id) === Number(deal.currency_id));
      if (!match) return null;
      const code = match.code || '';
      const symbol = match.symbol || '';
      return [symbol, code].filter(Boolean).join(' ') || null;
    },
    enabled: Boolean(deal?.currency_id),
  });

  useEffect(() => {
    if (!deal) return;
    setName(deal.name);
    setAmountStr(
      typeof deal.amount === 'number' ? String(deal.amount) : String(deal.amount ?? '')
    );
    setStatus(DEAL_STATUSES.includes(deal.status as (typeof DEAL_STATUSES)[number]) ? deal.status : 'Qualified');
    setValidUntil(deal.valid_until ? deal.valid_until.slice(0, 10) : '');
  }, [deal]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(amountStr.replace(/,/g, ''));
      if (!Number.isFinite(amount)) {
        throw new Error('Invalid amount');
      }
      await dealsAPI.updateDeal(dealId, {
        name: name.trim(),
        amount,
        status,
        valid_until: validUntil.trim() ? validUntil : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast({ title: t('dealDetail.toast.saved') });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : t('dealDetail.toast.saveError');
      toast({ title: t('dealDetail.toast.saveFailed'), description: msg, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await dealsAPI.deleteDeal(dealId);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast({ title: t('dealDetail.toast.deleted') });
      navigate('/deals', { replace: true });
    },
    onError: () => {
      toast({ title: t('dealDetail.toast.deleteFailed'), variant: 'destructive' });
    },
  });

  if (!Number.isFinite(dealId) || dealId <= 0) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8">
        <p className="text-neutral-600 dark:text-neutral-400">{t('dealDetail.invalid')}</p>
        <button
          type="button"
          onClick={() => navigate('/deals')}
          className="mt-4 text-primary-600 hover:underline"
        >
          {t('dealDetail.backToDeals')}
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8">
        <p className="text-neutral-600 dark:text-neutral-400">{t('dealDetail.loadFailed')}</p>
        <button
          type="button"
          onClick={() => navigate('/deals')}
          className="mt-4 text-primary-600 hover:underline"
        >
          {t('dealDetail.backToDeals')}
        </button>
      </div>
    );
  }

  const amountDisplay =
    typeof deal.amount === 'number' ? deal.amount : parseFloat(String(deal.amount)) || 0;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8">
      <button
        type="button"
        onClick={() => navigate('/deals')}
        className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('dealDetail.backToPipeline')}
      </button>

      <div className="max-w-2xl rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">{t('dealDetail.title')}</h1>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="deal-name">Name</Label>
            <Input
              id="deal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="deal-amount">Amount</Label>
            <Input
              id="deal-amount"
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-neutral-500">Current value: ${amountDisplay.toLocaleString()}</p>
          </div>
          <div>
            <Label htmlFor="deal-status">Status</Label>
            <select
              id="deal-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 flex h-11 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {DEAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="deal-valid-until">Valid Until (optional)</Label>
            <Input
              id="deal-valid-until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-neutral-500">{t('dealDetail.noExpiryHint')}</p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={updateMutation.isPending || deleteMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('dealDetail.saving')}
                </>
              ) : (
                t('dealDetail.save')
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/leads/${deal.lead_id}`)}>
              {t('dealDetail.openLead')}: {leadName || `#${deal.lead_id}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              disabled={deleteMutation.isPending || updateMutation.isPending}
              onClick={() => {
                if (window.confirm(t('dealDetail.confirmDelete'))) {
                  deleteMutation.mutate();
                }
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete deal
                </>
              )}
            </Button>
          </div>
        </form>

        <div className="mt-8 space-y-3 border-t border-neutral-200 pt-6 text-sm text-neutral-600 dark:text-neutral-300 dark:border-neutral-600">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-neutral-400" />
            <span>{currencyLabel || `Currency ${deal.currency_id}`}</span>
          </div>
          {deal.valid_until && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-neutral-400" />
              <span>Original close date: {new Date(deal.valid_until).toLocaleDateString()}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-neutral-400" />
            <span>
              Assigned to {assigneeName || 'teammate'} · Created {new Date(deal.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
