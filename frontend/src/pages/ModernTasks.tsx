/**
 * Modern Tasks Page — list + board with working row actions.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/services/axios';
import tasksAPI from '@/services/tasks';
import { useToast } from '@/hooks/use-toast';
import { useIsPhone } from '@/hooks/useIsPhone';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Filter,
  Search,
  Calendar,
  LayoutGrid,
  List,
  MoreVertical,
  Loader2,
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  due_date?: string;
  assigned_to?: { first_name?: string; last_name?: string };
  lead?: unknown;
  created_at: string;
}

/** Keeps keystrokes local so the kanban board is not re-rendered on every character. */
function TasksSearchField({
  isFetching = false,
  onDebouncedChange,
}: {
  isFetching?: boolean;
  onDebouncedChange: (value: string) => void;
}) {
  const { t } = useTranslation('tasks');
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = value.trim();
      setDebounced(next);
      onDebouncedChange(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value, onDebouncedChange]);

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder={t('searchPlaceholder')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-[44px] w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-10 text-base dark:border-border dark:bg-card"
      />
      {(isFetching || value.trim() !== debounced) && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary-600" />
      )}
    </div>
  );
}

function TaskActionsMenu({ taskId }: { taskId: number }) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tasksAPI.deleteTask(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ['task', id] });
      queryClient.removeQueries({ queryKey: ['task-details', id] });
      queryClient.removeQueries({ queryKey: ['task-attachments', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: t('deleted') });
    },
    onError: () => {
      toast({ title: t('deleteFailed'), variant: 'destructive' });
    },
  });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 hover:bg-muted"
          aria-label={t('taskActions')}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="z-[200] w-44">
        <DropdownMenuItem
          className="min-h-[44px] cursor-pointer"
          onClick={() => navigate(`/tasks/${taskId}`)}
        >
          <Eye className="mr-2 h-4 w-4" />
          {t('viewEdit')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-[44px] cursor-pointer"
          onClick={() => navigate(`/tasks/${taskId}`)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          {t('openDetail')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-[44px] cursor-pointer text-red-600 focus:text-red-600"
          onClick={() => {
            if (window.confirm(t('deleteConfirm'))) {
              deleteMutation.mutate(taskId);
            }
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('common:delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ModernTasks() {
  const { t } = useTranslation('tasks');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isPhone = useIsPhone();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const handleDebouncedSearch = useCallback((value: string) => {
    setDebouncedSearch(value);
  }, []);

  // Phone defaults to list; desktop keeps prior kanban default after first paint.
  useEffect(() => {
    if (isPhone) setView('list');
  }, [isPhone]);

  const { data: tasksResponse, isLoading, isFetching } = useQuery({
    queryKey: ['tasks', debouncedSearch],
    queryFn: async () => {
      const params = debouncedSearch ? { search: debouncedSearch } : {};
      return api.get('/tasks/', { params });
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const body = tasksResponse?.data;
  const tasks: Task[] = useMemo(() => {
    const list = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body)
        ? body
        : [];
    return list as Task[];
  }, [body]);

  const statuses = [
    { id: 'PENDING', name: t('statusLabels.pending'), dot: 'bg-blue-500' },
    { id: 'IN_PROGRESS', name: t('statusLabels.inProgress'), dot: 'bg-yellow-500' },
    { id: 'COMPLETED', name: t('statusLabels.completed'), dot: 'bg-green-500' },
    { id: 'CANCELLED', name: t('statusLabels.cancelled'), dot: 'bg-muted/500' },
  ];

  const tasksByStatus = useMemo(
    () =>
      statuses.map((status) => ({
        ...status,
        tasks: tasks.filter((task) => task.status === status.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statuses is derived from t
    [tasks, t],
  );

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await tasksAPI.updateTask(id, { status: status as any });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast({ title: t('statusUpdateFailed'), variant: 'destructive' });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const taskId = Number(result.draggableId);
    const destinationStatus = result.destination.droppableId;
    if (!taskId || !destinationStatus) return;
    const draggedTask = tasks.find((x) => x.id === taskId);
    if (!draggedTask || draggedTask.status === destinationStatus) return;
    updateStatusMutation.mutate({ id: taskId, status: destinationStatus });
  };

  const priorityLabel = (priority: string) =>
    t(`priorities.${(priority || '').toLowerCase()}`, { defaultValue: priority });

  const getPriorityColor = (priority: string) => {
    const p = (priority || '').toUpperCase();
    switch (p) {
      case 'URGENT':
      case 'HIGH':
        return 'text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400';
      case 'MEDIUM':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400';
      case 'LOW':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400';
      default:
        return 'text-muted-foreground bg-muted dark:bg-muted dark:text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">
              {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground md:text-base">
              {isLoading && !tasksResponse ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                  {t('loading')}
                </span>
              ) : (
                t('pageSubtitle', { count: tasks.length })
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/tasks/new')}
            className="flex min-h-[44px] w-full items-center justify-center space-x-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-primary-700 sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            <span>{t('newTask')}</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-2xl flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <TasksSearchField isFetching={isFetching} onDebouncedChange={handleDebouncedSearch} />
            <button
              type="button"
              className="flex min-h-[44px] items-center justify-center space-x-2 rounded-lg border border-border bg-card px-4 py-2.5 dark:border-border dark:bg-card"
            >
              <Filter className="h-5 w-5 text-muted-foreground dark:text-muted-foreground" />
              <span className="text-foreground dark:text-muted-foreground">{t('filters')}</span>
            </button>
          </div>

          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-1 dark:border-border dark:bg-card">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`flex min-h-[44px] items-center space-x-2 rounded-md px-3 py-1.5 transition-colors ${
                view === 'kanban'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                  : 'text-muted-foreground dark:text-muted-foreground'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="text-sm font-medium">{t('board')}</span>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex min-h-[44px] items-center space-x-2 rounded-md px-3 py-1.5 transition-colors ${
                view === 'list'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                  : 'text-muted-foreground dark:text-muted-foreground'
              }`}
            >
              <List className="h-4 w-4" />
              <span className="text-sm font-medium">{t('list')}</span>
            </button>
          </div>
        </div>
      </div>

      {view === 'kanban' && (
        <DragDropContext onDragEnd={handleDragEnd}>
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
          {tasksByStatus.map((status) => (
            <div key={status.id} className="flex w-[min(100%,18rem)] flex-shrink-0 flex-col md:w-auto">
              <div className="mb-4 flex items-center justify-between border-b-2 border-border pb-3 dark:border-border">
                <div className="flex items-center space-x-2">
                  <div className={`h-3 w-3 rounded-full ${status.dot}`} />
                  <h3 className="font-semibold text-foreground">{status.name}</h3>
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground">{status.tasks.length}</span>
                </div>
              </div>

              <Droppable droppableId={status.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3 min-h-[12rem]">
                    {isLoading && !tasksResponse && (
                      <>
                        <div className="h-24 animate-pulse rounded-lg bg-muted dark:bg-muted" />
                        <div className="h-24 animate-pulse rounded-lg bg-muted dark:bg-muted" />
                      </>
                    )}
                    {status.tasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                        {(providedDraggable, snapshot) => (
                          <div
                            ref={providedDraggable.innerRef}
                            {...providedDraggable.draggableProps}
                            {...providedDraggable.dragHandleProps}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/tasks/${task.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') navigate(`/tasks/${task.id}`);
                            }}
                            className={`cursor-pointer rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md dark:border-border dark:bg-card ${
                              snapshot.isDragging ? 'shadow-xl rotate-1' : ''
                            }`}
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <h4 className="flex-1 text-sm font-medium text-foreground hover:underline dark:text-foreground">
                                {task.title}
                              </h4>
                              <TaskActionsMenu taskId={task.id} />
                            </div>

                            {task.description && (
                              <p className="mb-3 line-clamp-2 text-xs text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-neutral-200">
                                {task.description}
                              </p>
                            )}
                            <p className="mb-3 text-[11px] text-muted-foreground">{t('clickToEdit')}</p>

                            <div className="flex items-center justify-between">
                              <span className={`rounded px-2 py-0.5 text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                {priorityLabel(task.priority)}
                              </span>
                              {task.due_date && (
                                <div className="flex items-center text-xs text-muted-foreground dark:text-muted-foreground">
                                  <Calendar className="mr-1 h-3 w-3" />
                                  {new Date(task.due_date).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
                {status.tasks.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground dark:text-muted-foreground">{t('noTasksColumn')}</div>
                )}
            </div>
          ))}
        </div>
        </DragDropContext>
      )}

      {view === 'list' && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card dark:border-border dark:bg-card">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-border bg-muted/50 dark:border-border dark:bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  {t('columnTask')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  {t('columnStatus')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  {t('priority')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  {t('dueDate')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  {t('assignedTo')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  {t('common:actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  <td className="px-4 py-4">
                    <div>
                      <div className="font-medium text-foreground">{task.title}</div>
                      {task.description && (
                        <div className="line-clamp-1 text-sm text-muted-foreground dark:text-muted-foreground">
                          {task.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                      {statuses.find((s) => s.id === task.status)?.name || task.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${getPriorityColor(task.priority)}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {task.assigned_to ? `${task.assigned_to.first_name} ${task.assigned_to.last_name}` : t('unassigned')}
                  </td>
                  <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <TaskActionsMenu taskId={task.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && (
            <div className="py-12 text-center text-muted-foreground dark:text-muted-foreground">
              {t('emptyList')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
