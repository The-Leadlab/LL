/**
 * CPQ quote routes: new + detail/edit (read-only summary until full editor exists).
 */

import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cpqAPI } from '@/services/api/cpq';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export function ModernQuoteNewPage() {
  const { t } = useTranslation('modules');
  const navigate = useNavigate();
  const [validUntil, setValidUntil] = React.useState('');
  const [items, setItems] = React.useState([{ product_id: 0, quantity: 1, discount_percent: 0 }]);
  const { data: products = [] } = useQuery({
    queryKey: ['cpq-products-for-quote'],
    queryFn: () => cpqAPI.getProducts(undefined, true),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      cpqAPI.createQuote({
        valid_until: validUntil || undefined,
        items: items
          .filter((i) => i.product_id > 0)
          .map((i) => ({ product_id: i.product_id, quantity: i.quantity, discount_percent: i.discount_percent, unit_price: 0 })),
      }),
    onSuccess: (quote) => {
      toast.success(t('cpq.quotePage.created'));
      navigate(`/cpq/quotes/${quote.id}`);
    },
    onError: () => toast.error(t('cpq.quotePage.createFailed')),
  });

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-4 md:p-8">
      <Button
        type="button"
        variant="ghost"
        className="mb-4 min-h-[44px]"
        onClick={() => navigate('/cpq/quotes')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('cpq.quotePage.backToQuotes')}
      </Button>
      <h1 className="mb-4 text-2xl font-bold text-neutral-900 dark:text-neutral-50">{t('cpq.quotePage.newTitle')}</h1>
      <div className="max-w-3xl space-y-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <div>
          <label className="text-sm font-medium">{t('cpq.quotePage.validUntil')}</label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2"
          />
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-6">
              <label className="text-sm font-medium">{t('cpq.quotePage.product')}</label>
              <select
                value={item.product_id}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setItems(items.map((x, i) => (i === idx ? { ...x, product_id: val } : x)));
                }}
                className="mt-1 w-full rounded-md border px-3 py-2"
              >
                <option value={0}>{t('cpq.quotePage.selectProduct')}</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.base_price})</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('cpq.quotePage.qty')}</label>
              <input type="number" min={1} value={item.quantity} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) || 1 } : x)))} className="mt-1 w-full rounded-md border px-3 py-2" />
            </div>
            <div className="col-span-3">
              <label className="text-sm font-medium">{t('cpq.quotePage.discount')}</label>
              <input type="number" min={0} max={100} value={item.discount_percent} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, discount_percent: Number(e.target.value) || 0 } : x)))} className="mt-1 w-full rounded-md border px-3 py-2" />
            </div>
            <div className="col-span-1">
              <Button type="button" variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setItems([...items, { product_id: 0, quantity: 1, discount_percent: 0 }])}>
            <Plus className="h-4 w-4 mr-2" /> {t('cpq.quotePage.addItem')}
          </Button>
          <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t('cpq.quotePage.createQuote')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ModernQuoteDetailPage() {
  const { t } = useTranslation('modules');
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isEdit = pathname.endsWith('/edit');
  const quoteId = Number(id);

  const { data: quote, isLoading, error } = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => cpqAPI.getQuote(quoteId),
    enabled: Number.isFinite(quoteId) && quoteId > 0,
  });

  if (!Number.isFinite(quoteId) || quoteId <= 0) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-neutral-600 dark:text-neutral-400">{t('cpq.quotePage.invalid')}</p>
        <Button type="button" className="mt-4 min-h-[44px]" onClick={() => navigate('/cpq/quotes')}>
          {t('cpq.quotePage.quotes')}
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-neutral-600 dark:text-neutral-400">{t('cpq.quotePage.notFound')}</p>
        <Button type="button" className="mt-4 min-h-[44px]" onClick={() => navigate('/cpq/quotes')}>
          {t('cpq.quotePage.backToQuotes')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-4 md:p-8">
      <Button
        type="button"
        variant="ghost"
        className="mb-4 min-h-[44px]"
        onClick={() => navigate('/cpq/quotes')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('cpq.quotePage.back')}
      </Button>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{t('cpq.quotePage.quoteTitle', { number: quote.quote_number })}</h1>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        {t('cpq.quotePage.statusLine', { mode: isEdit ? t('cpq.quotePage.edit') : t('cpq.quotePage.view'), status: quote.status })}
      </p>
      <div className="max-w-2xl rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">{t('cpq.quotePage.total')}</dt>
            <dd className="font-medium text-neutral-900 dark:text-neutral-50">
              {quote.total_amount} {quote.currency}
            </dd>
          </div>
          {quote.valid_until && (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">{t('cpq.quotePage.validUntil')}</dt>
              <dd>{new Date(quote.valid_until).toLocaleDateString()}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">{t('cpq.quotePage.createdAt')}</dt>
            <dd>{new Date(quote.created_at).toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
