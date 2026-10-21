import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Calendar, Clock, User, Building } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/hooks/use-toast';
import { TaskPriority, TaskStatus, tasksAPI } from '@/services/tasks';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { TaskDetailModal } from './TaskDetailModal';

const TASK_STATUSES = [
  { value: TaskStatus.PENDING, label: 'Pending', color: 'bg-yellow-50 border-yellow-200', icon: '⏳' },
  { value: TaskStatus.IN_PROGRESS, label: 'In Progress', color: 'bg-blue-50 border-blue-200', icon: '🔄' },
  { value: TaskStatus.COMPLETED, label: 'Completed', color: 'bg-green-50 border-green-200', icon: '✅' },
  { value: TaskStatus.CANCELLED, label: 'Cancelled', color: 'bg-gray-50 border-gray-200', icon: '❌' },
];

const priorityColors = {
  [TaskPriority.LOW]: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  [TaskPriority.MEDIUM]: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  [TaskPriority.HIGH]: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  [TaskPriority.URGENT]: 'bg-red-100 text-red-700 hover:bg-red-200',
};

// Tarih formatlama fonksiyonu
const formatDate = (date: string) => {
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d, yyyy');
};

// Zaman formatlama fonksiyonu
const formatTime = (date: string) => {
  return format(new Date(date), 'HH:mm');
};

export function TaskList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', searchTerm],
    queryFn: async () => {
      try {
        const response = await tasksAPI.getTasks({
          sort_by: 'due_date',
          sort_desc: false,
        });
        setError(null);
        return {
          items: response.items || [],
          total: response.total || 0
        };
      } catch (error: any) {
        console.error('Error fetching tasks:', error);
        setError('Failed to load tasks');
        return { items: [], total: 0 };
      }
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: (data: { id: number; status: TaskStatus }) =>
      tasksAPI.updateTask(data.id, { status: data.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Success',
        description: 'Task status updated successfully',
      });
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update task status',
        variant: 'destructive',
      });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceStatus = result.source.droppableId;
    const destinationStatus = result.destination.droppableId;
    
    if (sourceStatus === destinationStatus) return;

    const taskId = parseInt(result.draggableId);
    const newStatus = destinationStatus as TaskStatus;

    updateTaskMutation.mutate({ id: taskId, status: newStatus });
  };

  // Filter tasks by search term
  const filteredTasks = tasksData?.items.filter((task: any) =>
    task.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group tasks by status
  const tasksByStatus = TASK_STATUSES.reduce((acc, status) => {
    acc[status.value] = filteredTasks?.filter(
      (task: any) => task.status === status.value
    );
    return acc;
  }, {} as Record<string, any[]>);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage and track your tasks across different stages
              </p>
            </div>
            <div className="flex gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[300px] bg-white border-gray-200 focus:border-primary"
                />
              </div>
              <Button 
                onClick={() => navigate('/tasks/new')}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            </div>
          </div>

          {/* Task Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            {TASK_STATUSES.map((status) => (
              <div
                key={status.value}
                className={`${status.color} rounded-lg p-4 border shadow-sm`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{status.icon}</span>
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {status.label}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {tasksByStatus[status.value]?.length || 0} tasks
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Boards */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-4 gap-6">
            {TASK_STATUSES.map((status) => (
              <Droppable key={status.value} droppableId={status.value}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex flex-col gap-3"
                  >
                    <div className={`p-4 rounded-lg ${status.color} border shadow-sm`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{status.icon}</span>
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {status.label}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {tasksByStatus[status.value]?.length || 0} tasks
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 min-h-[200px] p-2">
                      {tasksByStatus[status.value]?.map((task: any, taskIndex: number) => (
                        <Draggable
                          key={task.id.toString()}
                          draggableId={task.id.toString()}
                          index={taskIndex}
                        >
                          {(provided) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className="p-4 cursor-pointer hover:shadow-md transition-all duration-200 border border-gray-100 hover:border-gray-200 bg-white hover:translate-y-[-2px]"
                              onClick={() => {
                                setSelectedTask(task);
                                setIsDetailOpen(true);
                              }}
                            >
                              {/* Title and Priority */}
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 mb-1 line-clamp-1">{task.title}</h4>
                                  {task.description && (
                                    <p className="text-sm text-gray-500 line-clamp-2 mb-2">
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                                <Badge className={`${priorityColors[task.priority]} px-2 py-1`}>
                                  {task.priority.toLowerCase().replace('_', ' ')}
                                </Badge>
                              </div>

                              {/* Meta Information */}
                              <div className="flex flex-col gap-2.5">
                                {/* Due Date & Time */}
                                <div className="flex items-center text-sm text-gray-500 gap-4">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span>{formatDate(task.due_date)}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-gray-400" />
                                    <span>{formatTime(task.due_date)}</span>
                                  </div>
                                </div>

                                {/* Assigned To & Lead */}
                                <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-2.5">
                                  <div className="flex items-center gap-2">
                                    {task.assigned_to && (
                                      <div className="flex items-center gap-1.5 text-gray-600">
                                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                                          {(task.assigned_to.first_name?.[0] || '?')}{(task.assigned_to.last_name?.[0] || '')}
                                        </div>
                                        <span>{task.assigned_to.first_name} {task.assigned_to.last_name}</span>
                                      </div>
                                    )}
                                  </div>
                                  {task.lead && (
                                    <div className="flex items-center gap-1.5 text-gray-500">
                                      <Building className="w-4 h-4 text-gray-400" />
                                      <span className="truncate max-w-[150px]">{task.lead.company || `${task.lead.first_name} ${task.lead.last_name}`}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedTask(null);
        }}
        task={selectedTask}
      />
    </div>
  );
}
