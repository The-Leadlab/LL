import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { forecastsAPI, Forecast, ForecastPeriod } from '@/services/api/forecasts';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, Target, DollarSign, Award, Calendar,
  Loader2, CheckCircle, Send, Edit, Plus, Trash2
} from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';

export const ForecastDashboard: React.FC = () => {
  const { t } = useTranslation('modules');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    pipeline_amount: '',
    best_case_amount: '',
    commit_amount: '',
    closed_amount: ''
  });

  // Fetch active period (404 = no period configured — not an infinite retry case)
  const {
    data: activePeriod,
    isLoading: isPeriodLoading,
    isError: isActivePeriodError,
    error: activePeriodError,
    refetch: refetchActivePeriod,
  } = useQuery({
    queryKey: ['forecast-periods', 'active'],
    queryFn: forecastsAPI.getActivePeriod,
    retry: false,
  });

  // Fetch my forecast
  const { data: myForecast, isLoading: isForecastLoading } = useQuery({
    queryKey: ['my-forecast', activePeriod?.id],
    queryFn: () => forecastsAPI.getMyForecast(activePeriod!.id),
    enabled: !!activePeriod
  });

  // Save forecast mutation
  const createPeriodMutation = useMutation({
    mutationFn: forecastsAPI.createPeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast-periods'] });
      toast({
        title: t('forecasting.toast.periodCreatedTitle'),
        description: t('forecasting.toast.periodCreated'),
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : t('forecasting.toast.periodFailed');
      toast({ title: t('forecasting.toast.error'), description: msg, variant: 'destructive' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof forecastsAPI.createOrUpdateForecast>[0]) =>
      forecastsAPI.createOrUpdateForecast(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-forecast'] });
      setIsEditDialogOpen(false);
      toast({
        title: t('forecasting.toast.success'),
        description: t('forecasting.toast.updated')
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
        ? String((err.response.data as { detail?: unknown }).detail)
        : t('forecasting.toast.saveFailed');
      toast({ title: t('forecasting.toast.saveFailedTitle'), description: msg, variant: 'destructive' });
    },
  });

  // Submit forecast mutation
  const submitMutation = useMutation({
    mutationFn: (id: number) => forecastsAPI.submitForecast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-forecast'] });
      toast({
        title: t('forecasting.toast.success'),
        description: t('forecasting.toast.submitted')
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => forecastsAPI.deleteForecast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-forecast'] });
      toast({ title: t('forecasting.toast.deletedTitle'), description: t('forecasting.toast.deleted') });
    },
  });

  const handleEdit = () => {
    if (myForecast) {
      setFormData({
        pipeline_amount: myForecast.pipeline_amount.toString(),
        best_case_amount: myForecast.best_case_amount.toString(),
        commit_amount: myForecast.commit_amount.toString(),
        closed_amount: myForecast.closed_amount.toString()
      });
    } else {
      setFormData({
        pipeline_amount: '0',
        best_case_amount: '0',
        commit_amount: '0',
        closed_amount: '0'
      });
    }
    setIsEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!activePeriod) {
      toast({
        title: t('forecasting.toast.noActivePeriodTitle'),
        description: t('forecasting.toast.noActivePeriod'),
        variant: 'destructive',
      });
      return;
    }

    saveMutation.mutate({
      period_id: activePeriod.id,
      pipeline_amount: parseFloat(formData.pipeline_amount),
      best_case_amount: parseFloat(formData.best_case_amount),
      commit_amount: parseFloat(formData.commit_amount),
      closed_amount: parseFloat(formData.closed_amount)
    });
  };

  const quotaAttainment = myForecast && myForecast.quota_amount
    ? (myForecast.closed_amount / myForecast.quota_amount) * 100
    : 0;

  const finalCommit = myForecast?.manager_adjusted_commit || myForecast?.commit_amount || 0;

  if (isPeriodLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </PageContainer>
    );
  }

  // Non-404 errors loading active period
  if (isActivePeriodError && (activePeriodError as { response?: { status?: number } })?.response?.status !== 404) {
    return (
      <PageContainer>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-800">{t('forecasting.loadPeriodFailed')}</p>
          <Button className="mt-4" variant="outline" onClick={() => refetchActivePeriod()}>
            {t('forecasting.retry')}
          </Button>
        </div>
      </PageContainer>
    );
  }

  if (activePeriod && isForecastLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </PageContainer>
    );
  }

  const handleCreateCurrentMonthPeriod = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    createPeriodMutation.mutate({
      period_type: 'monthly',
      start_date: iso(start),
      end_date: iso(end),
    });
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('forecasting.title')}</h1>
            <p className="text-gray-600 mt-1">
              {activePeriod ? (
                t('forecasting.periodLine', {
                  type: t(`forecasting.periodTypes.${activePeriod.period_type}`, {
                    defaultValue: activePeriod.period_type.charAt(0).toUpperCase() + activePeriod.period_type.slice(1),
                  }),
                  start: formatDate(activePeriod.start_date),
                  end: formatDate(activePeriod.end_date),
                })
              ) : (
                t('forecasting.noPeriod')
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={handleEdit} disabled={!activePeriod}>
                  <Edit className="h-4 w-4 mr-2" />
                  {t('forecasting.update')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('forecasting.updateTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="pipeline">{t('forecasting.pipelineAmount')}</Label>
                    <Input
                      id="pipeline"
                      type="number"
                      step="0.01"
                      value={formData.pipeline_amount}
                      onChange={(e) => setFormData({ ...formData, pipeline_amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="best_case">{t('forecasting.bestCaseAmount')}</Label>
                    <Input
                      id="best_case"
                      type="number"
                      step="0.01"
                      value={formData.best_case_amount}
                      onChange={(e) => setFormData({ ...formData, best_case_amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="commit">{t('forecasting.commitAmount')}</Label>
                    <Input
                      id="commit"
                      type="number"
                      step="0.01"
                      value={formData.commit_amount}
                      onChange={(e) => setFormData({ ...formData, commit_amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="closed">{t('forecasting.closedAmount')}</Label>
                    <Input
                      id="closed"
                      type="number"
                      step="0.01"
                      value={formData.closed_amount}
                      onChange={(e) => setFormData({ ...formData, closed_amount: e.target.value })}
                    />
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="w-full"
                  >
                    {saveMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {t('forecasting.save')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            {myForecast && myForecast.id > 0 && myForecast.status === 'draft' && (
              <Button onClick={() => submitMutation.mutate(myForecast.id)}>
                <Send className="h-4 w-4 mr-2" />
                {t('forecasting.submit')}
              </Button>
            )}
            {myForecast && myForecast.id > 0 && myForecast.status === 'draft' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => deleteMutation.mutate(myForecast.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('forecasting.deleteDraft')}
              </Button>
            )}
          </div>
        </div>

        {!activePeriod && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-medium text-amber-900">{t('forecasting.noPeriod')}</p>
              <p className="text-sm text-amber-800 mt-1">
                {t('forecasting.noPeriodBody')}
              </p>
            </div>
            <Button
              type="button"
              onClick={handleCreateCurrentMonthPeriod}
              disabled={createPeriodMutation.isPending}
            >
              {createPeriodMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {t('forecasting.createPeriod')}
            </Button>
          </div>
        )}

        {/* Status Badge */}
        {myForecast && myForecast.id > 0 && (
          <div className="flex gap-2">
            {myForecast.status === 'draft' && (
              <Badge variant="secondary">
                <Edit className="h-3 w-3 mr-1" />
                {t('forecasting.draft')}
              </Badge>
            )}
            {myForecast.status === 'submitted' && (
              <Badge className="bg-blue-100 text-blue-800">
                <Send className="h-3 w-3 mr-1" />
                {t('forecasting.submitted')}
              </Badge>
            )}
            {myForecast.status === 'approved' && (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                {t('forecasting.approved')}
              </Badge>
            )}
            {myForecast.manager_adjusted_commit && (
              <Badge variant="outline">
                {t('forecasting.managerAdjusted')}
              </Badge>
            )}
          </div>
        )}

        {/* Forecast Categories */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('forecasting.pipeline')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {formatCurrency(myForecast?.pipeline_amount || 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t('forecasting.pipelineHint')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('forecasting.bestCase')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">
                {formatCurrency(myForecast?.best_case_amount || 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t('forecasting.bestCaseHint')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('forecasting.commit')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(finalCommit)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t('forecasting.commitHint')}</p>
              {myForecast?.manager_adjusted_commit && (
                <p className="text-xs text-orange-600 mt-1">
                  {t('forecasting.manager', { amount: formatCurrency(myForecast.manager_adjusted_commit) })}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('forecasting.closed')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">
                {formatCurrency(myForecast?.closed_amount || 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t('forecasting.closedHint')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Quota Performance */}
        {myForecast && myForecast.quota_amount && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {t('forecasting.quotaAttainment')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">{t('forecasting.quota')}</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(myForecast.quota_amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('forecasting.closed')}</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(myForecast.closed_amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('forecasting.attainment')}</p>
                    <p className={`text-2xl font-bold ${quotaAttainment >= 100 ? 'text-green-600' : quotaAttainment >= 75 ? 'text-blue-600' : 'text-orange-600'}`}>
                      {quotaAttainment.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all ${quotaAttainment >= 100 ? 'bg-green-600' : quotaAttainment >= 75 ? 'bg-blue-600' : 'bg-orange-600'}`}
                    style={{ width: `${Math.min(quotaAttainment, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State — API returns placeholder forecast with id 0 when none exists */}
        {activePeriod && (!myForecast || myForecast.id === 0) && (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold mb-2">{t('forecasting.emptyTitle')}</h3>
              <p className="text-gray-600 mb-4">
                {t('forecasting.emptyBody')}
              </p>
              <Button onClick={handleEdit}>
                <Plus className="h-4 w-4 mr-2" />
                {t('forecasting.create')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
};

export default ForecastDashboard;
