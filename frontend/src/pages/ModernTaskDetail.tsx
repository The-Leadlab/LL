import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowLeft } from 'lucide-react';
import tasksAPI from '@/services/tasks';
import { TaskDetailModal } from './Tasks/TaskDetailModal';
import { Button } from '@/components/ui/Button';

/**
 * Standalone task detail at /tasks/:id (matches post-create redirect from New Task).
 */
export function ModernTaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const taskId = id ? parseInt(id, 10) : NaN;

  const { data: task, isLoading, isError } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksAPI.getTask(taskId),
    enabled: Number.isFinite(taskId) && taskId > 0,
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

  if (isError || !task || !task.id) {
    return (
      <div className="p-8">
        <p className="mb-4 text-red-600">Task not found or you don&apos;t have access.</p>
        <Button type="button" onClick={() => navigate('/tasks')}>
          Back to Tasks
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <Button type="button" variant="ghost" className="mb-4" onClick={() => navigate('/tasks')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Tasks
      </Button>
      <TaskDetailModal task={task} isOpen={true} onClose={() => navigate('/tasks')} />
    </div>
  );
}
