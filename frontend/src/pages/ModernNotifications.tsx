import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsAPI } from '@/services/api/notifications';
import { PageContainer } from '@/components/ui/PageContainer';
import { Button } from '@/components/ui/Button';
import { Bell, CheckCheck, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ModernNotifications() {
  const { t } = useTranslation('modules');
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading, isError } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsAPI.getAll({ limit: 100 }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsAPI.markAllAsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notificationsAPI.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('notificationsPage.title')}</h1>
            <p className="text-gray-600 mt-1">{t('notificationsPage.subtitle')}</p>
          </div>
          <Button type="button" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
            <CheckCheck className="h-4 w-4 mr-2" />
            {t('notificationsPage.markAll')}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
          </div>
        ) : isError ? (
          <div className="rounded-lg border p-10 text-center text-gray-600">
            {t('notificationsPage.loadFailed')}
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border p-10 text-center text-gray-600">
            <Bell className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            {t('notificationsPage.empty')}
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n: any) => (
              <div
                key={n.id}
                className={`rounded-lg border p-4 ${n.is_read ? 'bg-white' : 'bg-blue-50 border-blue-200'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    {n.message ? <p className="text-sm text-gray-600 mt-1">{n.message}</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(n.id)}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
