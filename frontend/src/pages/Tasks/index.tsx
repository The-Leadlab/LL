import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search, Plus, Calendar, Clock, User, Building, Filter, CheckCircle, AlertCircle, 
  Loader2, List, Kanban, TrendingUp, Target, BarChart3, XCircle, Download,
  MoreHorizontal, Eye, Edit, Trash2, RefreshCw, Settings, Grid3X3, Star, Zap
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import tasksAPI, { TaskStatus, TaskPriority } from '@/services/tasks';
import type { Task } from '@/services/tasks';
import { format, isToday, isTomorrow, isYesterday, differenceInDays } from 'date-fns';
import { TaskDetailModal } from './TaskDetailModal';
import { PageContainer } from '@/components/ui/PageContainer';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Professional task stages with enterprise colors
const TASK_STATUSES = [
  { 
    value: TaskStatus.PENDING, 
    label: 'Pending', 
    color: 'bg-gray-50', 
    borderColor: 'border-gray-300', 
    textColor: 'text-gray-800',
    badgeColor: 'bg-gray-200 text-gray-800',
    icon: Clock, 
    description: 'Tasks waiting to be started',
    probability: 10
  },
  { 
    value: TaskStatus.IN_PROGRESS, 
    label: 'In Progress', 
    color: 'bg-indigo-50', 
    borderColor: 'border-indigo-300', 
    textColor: 'text-indigo-800',
    badgeColor: 'bg-indigo-200 text-indigo-800',
    icon: TrendingUp, 
    description: 'Currently active tasks',
    probability: 50
  },
  { 
    value: TaskStatus.COMPLETED, 
    label: 'Completed', 
    color: 'bg-green-50', 
    borderColor: 'border-green-400', 
    textColor: 'text-green-800',
    badgeColor: 'bg-green-200 text-green-800',
    icon: CheckCircle, 
    description: 'Successfully completed tasks',
    probability: 100
  },
  { 
    value: TaskStatus.CANCELLED, 
    label: 'Cancelled', 
    color: 'bg-red-50', 
    borderColor: 'border-red-400', 
    textColor: 'text-red-800',
    badgeColor: 'bg-red-200 text-red-800',
    icon: XCircle, 
    description: 'Cancelled or rejected tasks',
    probability: 0
  },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All Priorities' },
  { value: 'URGENT', label: 'Urgent', color: 'text-red-600', icon: '🔴' },
  { value: 'HIGH', label: 'High', color: 'text-orange-600', icon: '🟠' },
  { value: 'MEDIUM', label: 'Medium', color: 'text-yellow-600', icon: '🟡' },
  { value: 'LOW', label: 'Low', color: 'text-green-600', icon: '🟢' }
];

const priorityColors: Record<TaskPriority, string> = {
  LOW: 'bg-green-50 text-green-700 border-green-200',
  MEDIUM: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  URGENT: 'bg-red-50 text-red-700 border-red-200'
};

const priorityIcons: Record<TaskPriority, string> = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  URGENT: '🔴'
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

// Due date status
const getDueDateStatus = (dueDate: string) => {
  const today = new Date();
  const due = new Date(dueDate);
  const diff = differenceInDays(due, today);
  
  if (diff < 0) return { label: 'Overdue', color: 'text-red-600 bg-red-50' };
  if (diff === 0) return { label: 'Due today', color: 'text-orange-600 bg-orange-50' };
  if (diff <= 2) return { label: 'Coming soon', color: 'text-yellow-600 bg-yellow-50' };
  return { label: 'Upcoming', color: 'text-gray-600 bg-gray-50' };
};

const getTasks = async () => {
  try {
    const response = await tasksAPI.getTasks({
      sort_by: 'due_date',
      sort_desc: false,
    });
    return {
      items: response.items || [],
      total: response.total || 0
    };
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    throw error;
  }
};

const updateTask = async (data: { id: number; status: TaskStatus }) =>
  tasksAPI.updateTask(data.id, { status: data.status });

interface TasksByStatus {
  [key: string]: Task[];
}

export function TasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  const {
    data: tasksData,
    isLoading,
    error,
    refetch: refetchTasks
  } = useQuery({
    queryKey: ['tasks'],
    queryFn: getTasks
  });

  const updateTaskMutation = useMutation({
    mutationFn: updateTask,
    onSuccess: () => {
      refetchTasks();
      toast({ title: 'Success', description: 'Task status updated successfully' });
    },
    onError: (error) => {
      console.error('Error updating task:', error);
      toast({ title: 'Error', description: 'Failed to update task status' });
    }
  });

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Görev detaylarını açmadan önce kullanıcı izinlerini kontrol et
  const handleTaskClick = (task: Task) => {
    tasksAPI.getTask(task.id)
      .then(response => {
        setSelectedTask(response);
        setIsDetailOpen(true);
      })
      .catch(error => {
        console.error('Error fetching task details:', error);
        setErrorMessage('You do not have permission to access this task details. Please contact your administrator.');
        setErrorModalOpen(true);
        refetchTasks();
      });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !tasksData?.items) return;

    const taskId = parseInt(result.draggableId);
    const newStatus = result.destination.droppableId as TaskStatus;
    
    updateTaskMutation.mutate({ id: taskId, status: newStatus });
  };

  // Filter tasks based on search term and priority
  const filteredTasks = useMemo(() => {
    if (!tasksData?.items) return [];
    
    return tasksData.items.filter((task: any) => {
      // Search filter
      const searchMatch = !searchTerm ? true : (
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.lead ? 
          `${task.lead.first_name} ${task.lead.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (task.lead.company?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
          task.lead.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          task.lead.last_name.toLowerCase().includes(searchTerm.toLowerCase())
          : false)
      );
      
      // Priority filter
      const priorityMatch = priorityFilter === 'all' ? true : task.priority === priorityFilter;
      
      return searchMatch && priorityMatch;
    });
  }, [tasksData?.items, searchTerm, priorityFilter]);

  // Task analytics calculations
  const analytics = useMemo(() => {
    if (!filteredTasks) return null;
    
    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter(task => task.status === TaskStatus.COMPLETED).length;
    const pendingTasks = filteredTasks.filter(task => task.status === TaskStatus.PENDING).length;
    const inProgressTasks = filteredTasks.filter(task => task.status === TaskStatus.IN_PROGRESS).length;
    const cancelledTasks = filteredTasks.filter(task => task.status === TaskStatus.CANCELLED).length;
    const overdueTasks = filteredTasks.filter(task => {
      const dueDate = new Date(task.due_date);
      const today = new Date();
      return dueDate < today && task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.CANCELLED;
    }).length;
    
    // Completion rate
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // Productivity score (completed vs total active)
    const activeTasks = totalTasks - cancelledTasks;
    const productivityScore = activeTasks > 0 ? Math.round((completedTasks / activeTasks) * 100) : 0;
    
    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      overdueTasks,
      completionRate,
      productivityScore
    };
  }, [filteredTasks]);

  // Group tasks by status
  const tasksByStatus: TasksByStatus = useMemo(() => {
    if (!filteredTasks) return {};
    
    return filteredTasks.reduce((acc: TasksByStatus, task: Task) => {
      if (!acc[task.status]) {
        acc[task.status] = [];
      }
      acc[task.status].push(task);
      return acc;
    }, {} as TasksByStatus);
  }, [filteredTasks]);

  // Professional Analytics Dashboard - Deals Style
  const AnalyticsCards = () => {
    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter((task: Task) => task.status === TaskStatus.COMPLETED).length;
    const overdueTasks = filteredTasks.filter((task: Task) => {
      const today = new Date();
      const dueDate = new Date(task.due_date);
      return dueDate < today && task.status !== TaskStatus.COMPLETED;
    }).length;
    const inProgressTasks = filteredTasks.filter((task: Task) => task.status === TaskStatus.IN_PROGRESS).length;
    
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {/* Total Tasks */}
        <Card className="border border-gray-200 bg-white hover:shadow-lg transition-all duration-200 hover:border-indigo-300">
          <CardContent className="p-6 pt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                  <BarChart3 className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                  <p className="text-2xl font-bold text-gray-900">{totalTasks}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge className="bg-indigo-100 text-indigo-700 text-xs">
                Active Pipeline
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Completed Tasks */}
        <Card className="border border-gray-200 bg-white hover:shadow-lg transition-all duration-200 hover:border-green-300">
          <CardContent className="p-6 pt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-gray-900">{completedTasks}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge className="bg-green-100 text-green-700 text-xs">
                {completionRate}% Success Rate
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* In Progress Tasks */}
        <Card className="border border-gray-200 bg-white hover:shadow-lg transition-all duration-200 hover:border-blue-300">
          <CardContent className="p-6 pt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">In Progress</p>
                  <p className="text-2xl font-bold text-gray-900">{inProgressTasks}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-700 text-xs">
                Active Work
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Overdue Tasks */}
        <Card className="border border-gray-200 bg-white hover:shadow-lg transition-all duration-200 hover:border-red-300">
          <CardContent className="p-6 pt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Overdue</p>
                  <p className="text-2xl font-bold text-gray-900">{overdueTasks}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge className="bg-red-100 text-red-700 text-xs">
                {overdueTasks > 0 ? 'Needs Attention' : 'On Track'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Professional Task Card Component - Deals Style
  const TaskCard = ({ task, isDragging = false }: { task: Task; isDragging?: boolean }) => {
    const dueStatus = getDueDateStatus(task.due_date);
    
    return (
      <Card className={`cursor-pointer transition-all duration-200 group relative overflow-hidden ${
        isDragging ? 'shadow-2xl scale-105 z-50 rotate-1' : 'hover:shadow-lg hover:-translate-y-0.5'
      } bg-white border border-gray-200`}>
        <CardContent className="p-4 pt-6">
          {/* Header: Priority and More Actions */}
          <div className="flex items-center justify-between mb-3">
            <Badge className={`text-xs font-medium px-2 py-1 rounded-md flex-shrink-0 ${
              task.priority === 'URGENT' ? 'bg-red-50 text-red-700 border border-red-200' :
              task.priority === 'HIGH' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
              task.priority === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 
              'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {priorityIcons[task.priority as TaskPriority]} {task.priority}
            </Badge>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem onClick={() => handleTaskClick(task)}>
                  <Eye className="h-3 w-3 mr-2" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Edit className="h-3 w-3 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Task Title */}
          <h4 className="font-semibold text-gray-900 text-sm mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">
            {task.title}
          </h4>

          {/* Description */}
          {task.description && (
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Lead Information */}
          {task.lead && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-md">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-indigo-600">
                  {task.lead.first_name[0]}{task.lead.last_name[0]}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {task.lead.first_name} {task.lead.last_name}
                </p>
                {task.lead.company && (
                  <p className="text-xs text-gray-500 truncate">{task.lead.company}</p>
                )}
              </div>
            </div>
          )}

          {/* Due Date */}
          <div className="flex items-center justify-between mb-3 p-2 bg-gray-50 rounded-md">
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-900">{formatDate(task.due_date)}</p>
                <p className="text-xs text-gray-500">{formatTime(task.due_date)}</p>
              </div>
            </div>
            <Badge className={`text-xs px-2 py-0.5 rounded-md ${
              dueStatus.label === 'Overdue' ? 'bg-red-50 text-red-700 border border-red-200' :
              dueStatus.label === 'Due today' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
              dueStatus.label === 'Coming soon' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 
              'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {dueStatus.label}
            </Badge>
          </div>

          {/* Progress */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Progress</span>
              <span className="text-xs font-medium text-gray-700">
                {task.status === TaskStatus.COMPLETED ? '100%' :
                 task.status === TaskStatus.IN_PROGRESS ? '50%' :
                 task.status === TaskStatus.PENDING ? '10%' : '0%'}
              </span>
            </div>
            <Progress 
              value={
                task.status === TaskStatus.COMPLETED ? 100 :
                task.status === TaskStatus.IN_PROGRESS ? 50 :
                task.status === TaskStatus.PENDING ? 10 : 0
              }
              className="h-1.5"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                task.status === TaskStatus.COMPLETED ? 'bg-green-500' :
                task.status === TaskStatus.IN_PROGRESS ? 'bg-indigo-500' :
                task.status === TaskStatus.PENDING ? 'bg-gray-400' : 'bg-red-500'
              }`}></div>
              <span className="text-xs text-gray-600 capitalize">
                {task.status.replace('_', ' ')}
              </span>
            </div>
            <span className="text-xs text-gray-400 font-mono">#{task.id}</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Kanban View Component - Deals Style
  const KanbanView = () => (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Task Pipeline Overview</h2>
        <p className="text-sm text-gray-600 mt-1">Drag and drop tasks between stages</p>
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TASK_STATUSES.map((stage) => {
              const stageTasks = tasksByStatus[stage.value] || [];
              const StageIcon = stage.icon;

              return (
                <div key={stage.value} className="min-w-0 w-full">
                  <div className="mb-4">
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`p-1.5 rounded-lg ${stage.color} border ${stage.borderColor} flex-shrink-0`}>
                            <StageIcon className={`h-3 w-3 ${stage.textColor}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm truncate">{stage.label}</h3>
                            <p className="text-xs text-gray-500 truncate">{stage.description}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-gray-900">{stageTasks.length}</p>
                          <p className="text-xs text-gray-500">tasks</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Progress</span>
                        <span className="font-medium text-gray-700">{stage.probability}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                        <div 
                          className={`h-1 rounded-full ${
                            stage.value === TaskStatus.PENDING ? 'bg-gray-400' : 
                            stage.value === TaskStatus.IN_PROGRESS ? 'bg-indigo-400' : 
                            stage.value === TaskStatus.COMPLETED ? 'bg-green-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${stage.probability}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <Droppable droppableId={stage.value}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-2 min-h-[300px] max-h-[500px] overflow-y-auto p-2 rounded-lg transition-colors ${
                          snapshot.isDraggingOver ? 'bg-gray-50 border-2 border-dashed border-gray-300' : ''
                        }`}
                      >
                        {stageTasks.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id.toString()} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => handleTaskClick(task)}
                              >
                                <TaskCard task={task} isDragging={snapshot.isDragging} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        
                        {stageTasks.length === 0 && (
                          <div className="flex items-center justify-center h-24 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
                            <div className="text-center">
                              <StageIcon className="h-5 w-5 mx-auto mb-1 opacity-50" />
                              <p className="text-[10px]">No tasks</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>
    </div>
  );

  if (isLoading) {
    return (
      <PageContainer className="flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
          <p className="text-gray-500">Loading tasks...</p>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="bg-red-50 border border-red-200 text-red-700 p-8 rounded-lg flex flex-col items-center max-w-md mx-auto">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load tasks</h3>
          <p className="text-sm text-center mb-4">We couldn't retrieve your tasks. Please try again or contact support if the issue persists.</p>
          <Button 
            onClick={() => refetchTasks()} 
            variant="outline" 
            className="bg-white text-red-600 border-red-200 hover:bg-red-50"
          >
            Try Again
          </Button>
        </div>
      </PageContainer>
    );
  }

  // Main Component Return - Full Screen Layout (Deals Style)
  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="h-full max-w-none p-4 space-y-4 w-full">
        {/* Professional Header - Full Width */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between">
              <div className="mb-4 lg:mb-0">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Task Management</h1>
                <p className="text-gray-600">Organize and track your tasks through the workflow</p>
              </div>
              
              <div className="flex items-center gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          queryClient.invalidateQueries({ queryKey: ['tasks'] });
                          refetchTasks();
                        }}
                        className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Refresh task data</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Export task data to CSV</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <Button onClick={() => navigate('/tasks/new')} className="bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 font-medium">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Task
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics - Full Width */}
        <AnalyticsCards />

        {/* Professional Toolbar - Full Width */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4">
            <div className="space-y-4">
              {/* Row 1: Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search tasks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-full border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                
                <div className="flex gap-2 sm:gap-3">
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full sm:w-48 border-gray-300 focus:border-indigo-500 focus:ring-indigo-500">
                      <SelectValue placeholder="Filter by priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            {option.icon && <span>{option.icon}</span>}
                            <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: View Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 font-medium hidden sm:inline">View:</span>
                  <Tabs value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                    <TabsList className="grid w-full grid-cols-2 bg-gray-100 h-10 p-1 rounded-lg">
                      <TabsTrigger 
                        value="kanban" 
                        className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-600 hover:text-gray-900"
                      >
                        <Kanban className="h-4 w-4 flex-shrink-0" />
                        <span className="hidden sm:inline">Board</span>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="list" 
                        className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-600 hover:text-gray-900"
                      >
                        <List className="h-4 w-4 flex-shrink-0" />
                        <span className="hidden sm:inline">List</span>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="min-h-[600px]">
          {!filteredTasks || filteredTasks.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="max-w-md mx-auto">
                <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No tasks found</h3>
                <p className="text-gray-600 mb-6">Get started by creating your first task or adjust your filters.</p>
                <Button onClick={() => navigate('/tasks/new')} className="bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Task
                </Button>
              </div>
            </Card>
          ) : (
            <Tabs value={viewMode} className="w-full">
              <TabsContent value="kanban" className="mt-0">
                <KanbanView />
              </TabsContent>
              
              <TabsContent value="list" className="mt-0">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* List header */}
                  <div className="grid grid-cols-12 gap-4 p-4 border-b border-gray-100 bg-gray-50 font-medium text-sm text-gray-600">
                    <div className="col-span-4">Task</div>
                    <div className="col-span-2">Due Date</div>
                    <div className="col-span-2">Priority</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2">Assigned</div>
                  </div>
                  
                  {/* List body */}
                  <div className="divide-y divide-gray-100">
                    {filteredTasks.map((task: Task) => {
                      const dueStatus = getDueDateStatus(task.due_date);
                      const statusInfo = TASK_STATUSES.find(s => s.value === task.status);
                      
                      return (
                        <div 
                          key={task.id} 
                          className="grid grid-cols-12 gap-4 p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => handleTaskClick(task)}
                        >
                          <div className="col-span-4">
                            <div className="font-medium text-gray-900 mb-1">{task.title}</div>
                            {task.description && (
                              <p className="text-sm text-gray-500 line-clamp-1">{task.description}</p>
                            )}
                          </div>
                          <div className="col-span-2 flex items-center">
                            <div className="flex flex-col">
                              <div className="text-sm text-gray-900">{formatDate(task.due_date)}</div>
                              <div className="text-xs text-gray-500">{formatTime(task.due_date)}</div>
                            </div>
                          </div>
                          <div className="col-span-2 flex items-center">
                            <Badge className={`text-xs px-2 py-1 border ${priorityColors[task.priority as TaskPriority]}`}>
                              {priorityIcons[task.priority as TaskPriority]} {task.priority}
                            </Badge>
                          </div>
                          <div className="col-span-2 flex items-center">
                            <Badge className={`text-xs px-2 py-1 ${statusInfo?.badgeColor}`}>
                              {statusInfo?.label}
                            </Badge>
                          </div>
                          <div className="col-span-2 flex items-center">
                            {task.lead ? (
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                                  <span className="text-xs font-medium text-indigo-600">
                                    {(task.lead.first_name?.[0] || '?')}{(task.lead.last_name?.[0] || '')}
                                  </span>
                                </div>
                                <span className="text-sm text-gray-700 truncate">
                                  {task.lead.first_name} {task.lead.last_name}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-gray-400">
                                <User className="h-4 w-4" />
                                <span className="text-sm">Unassigned</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Task Detail Modal */}
        {selectedTask && (
          <TaskDetailModal
            isOpen={isDetailOpen}
            task={selectedTask}
            onClose={() => {
              refetchTasks();
              setTimeout(() => {
                setIsDetailOpen(false);
                setSelectedTask(null);
              }, 100);
            }}
          />
        )}

        {/* Error Modal */}
        <Dialog open={errorModalOpen} onOpenChange={setErrorModalOpen}>
          <DialogContent className="sm:max-w-[500px] bg-white shadow-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-red-600 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                <span>Access Error</span>
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-700">{errorMessage}</p>
            </div>
            <div className="mt-4 flex justify-end">
              <Button 
                onClick={() => setErrorModalOpen(false)} 
                className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                OK
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default TasksPage;