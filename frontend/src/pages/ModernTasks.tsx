/**
 * Modern Tasks Page — list + board with working row actions.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/services/axios';
import tasksAPI from '@/services/tasks';
import { useToast } from '@/hooks/use-toast';
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
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      const next = value.trim();
      setDebounced(next);
      onDebouncedChange(next);
    }, 300);
    return () => window.clearTimeout(t);
  }, [value, onDebouncedChange]);

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
      <input
        type="text"
        placeholder="Search tasks..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-[44px] w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-10 text-base dark:border-neutral-700 dark:bg-neutral-800"
      />
      {(isFetching || value.trim() !== debounced) && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary-600" />
      )}
    </div>
  );
}

function TaskActionsMenu({ taskId }: { taskId: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tasksAPI.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Task deleted' });
    },
    onError: () => {
      toast({ title: 'Could not delete task', variant: 'destructive' });
    },
  });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          aria-label="Task actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="z-[200] w-44">
        <DropdownMenuItem
          className="min-h-[44px] cursor-pointer"
          onClick={() => navigate(`/tasks/${taskId}`)}
        >
          <Eye className="mr-2 h-4 w-4" />
          View / edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-[44px] cursor-pointer"
          onClick={() => navigate(`/tasks/${taskId}`)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Open detail
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-[44px] cursor-pointer text-red-600 focus:text-red-600"
          onClick={() => {
            if (window.confirm('Delete this task?')) {
              deleteMutation.mutate(taskId);
            }
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ModernTasks() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const handleDebouncedSearch = useCallback((value: string) => {
    setDebouncedSearch(value);
  }, []);

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
    { id: 'PENDING', name: 'To Do', dot: 'bg-blue-500' },
    { id: 'IN_PROGRESS', name: 'In Progress', dot: 'bg-yellow-500' },
    { id: 'COMPLETED', name: 'Completed', dot: 'bg-green-500' },
    { id: 'CANCELLED', name: 'Cancelled', dot: 'bg-gray-500' },
  ];

  const tasksByStatus = useMemo(
    () =>
      statuses.map((status) => ({
        ...status,
        tasks: tasks.filter((task) => task.status === status.id),
      })),
    [tasks],
  );

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await tasksAPI.updateTask(id, { status: status as any });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast({ title: 'Could not update task status', variant: 'destructive' });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const taskId = Number(result.draggableId);
    const destinationStatus = result.destination.droppableId;
    if (!taskId || !destinationStatus) return;
    const draggedTask = tasks.find((t) => t.id === taskId);
    if (!draggedTask || draggedTask.status === destinationStatus) return;
    updateStatusMutation.mutate({ id: taskId, status: destinationStatus });
  };

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
        return 'text-neutral-600 bg-neutral-100 dark:bg-neutral-700 dark:text-neutral-400';
    }
  };

  if (isLoading && !tasksResponse) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-900">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-4 sm:p-6 md:p-8 dark:bg-neutral-900">
      <div className="mb-6 md:mb-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50 md:text-3xl">
              Tasks
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 md:text-base">
              Manage and track your tasks • {tasks.length} total tasks
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/tasks/new')}
            className="flex min-h-[44px] w-full items-center justify-center space-x-2 rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-primary-700 sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            <span>New Task</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-2xl flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <TasksSearchField isFetching={isFetching} onDebouncedChange={handleDebouncedSearch} />
            <button
              type="button"
              className="flex min-h-[44px] items-center justify-center space-x-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-700 dark:bg-neutral-800"
            >
              <Filter className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
              <span className="text-neutral-700 dark:text-neutral-300">Filters</span>
            </button>
          </div>

          <div className="flex items-center justify-center rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`flex min-h-[44px] items-center space-x-2 rounded-md px-3 py-1.5 transition-colors ${
                view === 'kanban'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="text-sm font-medium">Board</span>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex min-h-[44px] items-center space-x-2 rounded-md px-3 py-1.5 transition-colors ${
                view === 'list'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              <List className="h-4 w-4" />
              <span className="text-sm font-medium">List</span>
            </button>
          </div>
        </div>
      </div>

      {view === 'kanban' && (
        <DragDropContext onDragEnd={handleDragEnd}>
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
          {tasksByStatus.map((status) => (
            <div key={status.id} className="flex w-[min(100%,18rem)] flex-shrink-0 flex-col md:w-auto">
              <div className="mb-4 flex items-center justify-between border-b-2 border-neutral-200 pb-3 dark:border-neutral-700">
                <div className="flex items-center space-x-2">
                  <div className={`h-3 w-3 rounded-full ${status.dot}`} />
                  <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">{status.name}</h3>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">{status.tasks.length}</span>
                </div>
              </div>

              <Droppable droppableId={status.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3 min-h-[12rem]">
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
                            className={`cursor-pointer rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800 ${
                              snapshot.isDragging ? 'shadow-xl rotate-1' : ''
                            }`}
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <h4 className="flex-1 text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-50">
                                {task.title}
                              </h4>
                              <TaskActionsMenu taskId={task.id} />
                            </div>

                            {task.description && (
                              <p className="mb-3 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200">
                                {task.description}
                              </p>
                            )}
                            <p className="mb-3 text-[11px] text-neutral-400">Click title or description to edit</p>

                            <div className="flex items-center justify-between">
                              <span className={`rounded px-2 py-0.5 text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                {task.priority}
                              </span>
                              {task.due_date && (
                                <div className="flex items-center text-xs text-neutral-600 dark:text-neutral-400">
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
                  <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">No tasks</div>
                )}
            </div>
          ))}
        </div>
        </DragDropContext>
      )}

      {view === 'list' && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Task
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Priority
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Due Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Assigned To
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  <td className="px-4 py-4">
                    <div>
                      <div className="font-medium text-neutral-900 dark:text-neutral-50">{task.title}</div>
                      {task.description && (
                        <div className="line-clamp-1 text-sm text-neutral-500 dark:text-neutral-400">
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
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-neutral-900 dark:text-neutral-50">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-4 text-sm text-neutral-900 dark:text-neutral-50">
                    {task.assigned_to ? `${task.assigned_to.first_name} ${task.assigned_to.last_name}` : 'Unassigned'}
                  </td>
                  <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <TaskActionsMenu taskId={task.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && (
            <div className="py-12 text-center text-neutral-500 dark:text-neutral-400">
              No tasks found. Click &quot;New Task&quot; to create your first task.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
