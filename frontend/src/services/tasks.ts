import api from '@/lib/axios';

/** Must match backend `app.models.task` TaskStatus / TaskPriority enums (uppercase). */
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const TaskStatus = {
  PENDING: 'PENDING' as TaskStatus,
  IN_PROGRESS: 'IN_PROGRESS' as TaskStatus,
  COMPLETED: 'COMPLETED' as TaskStatus,
  CANCELLED: 'CANCELLED' as TaskStatus,
};

export const TaskPriority = {
  LOW: 'LOW' as TaskPriority,
  MEDIUM: 'MEDIUM' as TaskPriority,
  HIGH: 'HIGH' as TaskPriority,
  URGENT: 'URGENT' as TaskPriority,
};

export interface Task {
  id: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  assigned_to_id?: number | null;
  lead_id?: number | null;
  organization_id: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  assignee?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  creator?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  /** Populated when returned from API list/detail */
  lead?: {
    id: number;
    first_name: string;
    last_name: string;
    email?: string | null;
    company?: string | null;
  };
  assigned_to?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    job_title?: string | null;
  };
}

export interface TaskCreateInput {
  title: string;
  description?: string | null;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  organization_id: number;
  assigned_to_id?: number | null;
  lead_id?: number | null;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  assigned_to_id?: number | null;
  lead_id?: number | null;
}

export interface TaskFilters {
  status?: string;
  priority?: string;
  assigned_to?: string;
  created_by?: string;
  lead_id?: string;
  deal_id?: string;
  due_date_from?: string;
  due_date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_desc?: boolean;
}

export interface TaskListResponse {
  items: Task[];
  total: number;
}

export interface TaskStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
}

export interface TaskAttachment {
  filename: string;
  stored_name: string;
  size_bytes: number;
  content_type?: string;
  uploaded_at?: string;
}

function normalizeDueDate(isoOrLocal: string): string {
  const d = new Date(isoOrLocal);
  if (Number.isNaN(d.getTime())) {
    return isoOrLocal;
  }
  return d.toISOString();
}

export const getTasks = async (filters?: TaskFilters): Promise<TaskListResponse> => {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
  }
  const response = await api.get(`/tasks?${params.toString()}`);
  return response.data;
};

export const getTask = async (id: number | string): Promise<Task> => {
  const response = await api.get(`/tasks/${id}`);
  return response.data;
};

export const createTask = async (data: TaskCreateInput): Promise<Task> => {
  const response = await api.post('/tasks', {
    title: data.title,
    description: data.description ?? null,
    due_date: normalizeDueDate(data.due_date),
    priority: data.priority,
    status: data.status,
    organization_id: data.organization_id,
    assigned_to_id: data.assigned_to_id ?? undefined,
    lead_id: data.lead_id ?? undefined,
  });
  const created = response.data;
  if (!created || typeof created.id !== 'number' || created.id <= 0) {
    throw new Error('Task was not created. Please try again.');
  }
  return created;
};

export const updateTask = async (id: number | string, data: TaskUpdateInput): Promise<Task> => {
  const response = await api.put(`/tasks/${id}`, data);
  return response.data;
};

export const deleteTask = async (id: number | string): Promise<{ message: string }> => {
  const response = await api.delete(`/tasks/${id}`);
  return response.data;
};

export const completeTask = async (id: number | string): Promise<Task> => {
  const response = await api.patch(`/tasks/${id}/complete`);
  return response.data;
};

export const getTaskStats = async (): Promise<TaskStats> => {
  const response = await api.get('/tasks/stats');
  return response.data;
};

export const listTaskAttachments = async (taskId: number | string): Promise<TaskAttachment[]> => {
  const response = await api.get(`/tasks/${taskId}/attachments`);
  return response.data;
};

export const uploadTaskAttachment = async (taskId: number | string, file: File): Promise<TaskAttachment> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/tasks/${taskId}/attachments`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const deleteTaskAttachment = async (taskId: number | string, storedName: string): Promise<{ message: string }> => {
  const response = await api.delete(`/tasks/${taskId}/attachments/${encodeURIComponent(storedName)}`);
  return response.data;
};

export const getMyTasks = async (filters?: Omit<TaskFilters, 'assigned_to'>): Promise<TaskListResponse> => {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
  }
  const response = await api.get(`/tasks/my?${params.toString()}`);
  return response.data;
};

export const bulkUpdateTasks = async (
  taskIds: string[],
  updates: TaskUpdateInput
): Promise<{ message: string; updated_count: number }> => {
  const response = await api.patch('/tasks/bulk', {
    task_ids: taskIds,
    updates,
  });
  return response.data;
};

export const tasksAPI = {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  getTaskStats,
  listTaskAttachments,
  uploadTaskAttachment,
  deleteTaskAttachment,
  getMyTasks,
  bulkUpdateTasks,
};

export default tasksAPI;
