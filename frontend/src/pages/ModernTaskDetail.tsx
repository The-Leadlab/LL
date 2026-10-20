import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowLeft } from 'lucide-react';
import tasksAPI from '@/services/tasks';
import type { Task } from '@/services/tasks';
import { TaskDetailModal } from './Tasks/TaskDetailModal';
import { Button } from '@/components/ui/Button';

function unwrapTask(payload: unknown): Task | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  if (typeof raw.id === 'number' && raw.id > 0) return raw as unknown as Task;
  if (raw.data && typeof raw.data === 'object') {
    const nested = raw.data as Record<string, unknown>;
    if (typeof nested.id === 'number' && nested.id > 0) return nested as unknown as Task;
  }
  return null;
}

/**
 * Standalone task detail at /tasks/:id (matches post-create redirect from New Task).
 * Renders as a page with an always-open detail panel (not a blank dialog shell).
 */
export function ModernTaskDetail() {
  const { t } = useTranslation('modules');
  const { id } = useParams();
  const navigate = useNavigate();
  const taskId = id ? parseInt(id, 10) : NaN;

  const { data: task, isLoading, isError, refetch } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const raw = await tasksAPI.getTask(taskId);
      const unwrapped = unwrapTask(raw);
      if (!unwrapped) throw new Error('Invalid task response');
      return unwrapped;
    },
    enabled: Number.isFinite(taskId) && taskId > 0,
    retry: 1,
  });

  if (!Number.isFinite(taskId) || taskId <= 0) {
    navigate('/tasks', { replace: true });
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div className="p-8">
        <p className="mb-4 text-red-600">{t('taskDetail.notFound')}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t('taskDetail.retry')}
          </Button>
          <Button type="button" onClick={() => navigate('/tasks')}>
            {t('taskDetail.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Button type="button" variant="ghost" className="mb-4" onClick={() => navigate('/tasks')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('taskDetail.back')}
      </Button>
      {/* asPage: render detail content inline so /tasks/:id is never a blank shell */}
      <TaskDetailModal
        task={task}
        isOpen={true}
        onClose={() => navigate('/tasks', { replace: true })}
        asPage
      />
    </div>
  );
}
