import api from '@/lib/axios';
import { AxiosResponse } from 'axios';
import { teamInvitationsAPI } from './teamInvitations';

// Types
export interface Lead {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  job_title: string | null;
  company: string | null;
  source: string | null;
  telephone: string | null;
  mobile: string | null;
  stage_id: number;
  organization_id: number;
  created_at: string;
  updated_at: string | null;
  linkedin: string | null;
  location: string | null;
  country: string | null;
  website: string | null;
  sector: string | null;
  unique_lead_id: string | null;
  time_in_current_role: string | null;
  lab_comments: string | null;
  client_comments: string | null;
  psychometrics: any | null;
  wpi: number | null;
}

export interface LeadListResponse {
  results: Lead[];
  total: number;
  page: number;
  size: number;
  has_more: boolean;
}

export interface APIResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

interface LeadCreateInput {
  first_name: string;
  last_name: string;
  email: string | null;
  company: string | null;
  job_title: string | null;
  linkedin: string | null;
  location: string | null;
  telephone: string | null;
  mobile: string | null;
  source: string | null;
  client_comments: string | null;
  stage_id: number;
  organization_id: number;
  user_id: number;
}

export interface Event {
  id: number;
  title: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  timezone?: string;
  event_type: string;
  is_all_day: boolean;
  organization_id: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  status: string;
}

export interface EventCreateInput {
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  event_type: string;
  location?: string;
  is_all_day: boolean;
  organization_id: number;
  user_id: number;
  attendee_ids?: number[];
  timezone?: string;
}

interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
  assigned_to: number;
  created_at: string;
  updated_at: string;
}

interface DealResponse {
  items: Deal[];
  total: number;
}

interface Deal {
  id: number;
  name: string;
  description: string;
  amount: string;
  status: string;
  valid_until: string | null;
  lead_id: number;
  assigned_to_id: number;
  currency_id: number;
  organization_id: number;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
}

interface LeadStage {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  organization_id: number;
  organization_role: string;  // viewer, member, manager
  job_title?: string;
}

interface UserResponse {
  items: User[];
  total: number;
}

interface InformationRequest {
  id: number;
  lead_id: number;
  lead_name: string;
  field_name: string;
  requester_id: number;
  requester_name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InformationRequestsResponse {
  data: InformationRequest[];
  total: number;
}

interface Organization {
  id: number;
  name: string;
  description: string | null;
  website: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  logo_filename: string | null;
  logo_content_type: string | null;
}

interface OrganizationResponse {
  data: Organization[];
  total: number;
}

interface UserSettings {
  language: string;
  timezone?: string;
  theme_preference?: {
    mode: string;
    fontSize: string;
  };
  notification_preferences?: {
    email?: boolean;
    push?: boolean;
    leadAssigned?: boolean;
    dealUpdated?: boolean;
    taskDue?: boolean;
    taskAssigned?: boolean;
    meetingReminder?: boolean;
    systemUpdates?: boolean;
    messages?: boolean;
    mentions?: boolean;
  };
}

export interface Tag {
  id: number;
  name: string;
  organization_id: number;
  organization_name?: string;
  created_at: string;
  updated_at: string;
}

// This interface is kept for backward compatibility
export interface TagsResponse {
  items: Tag[];
  total: number;
}

// Auth/token handling lives solely in `@/lib/axios` interceptors.
// Do not register a second 401→logout interceptor here — it races refresh and can storm redirects.

export const usersAPI = {
  getAll: async (): Promise<AxiosResponse<UserResponse>> => {
    return api.get('/users');
  },

  getById: async (id: number): Promise<AxiosResponse<User>> => {
    return api.get(`/users/${id}`);
  },

  create: async (data: Partial<User>): Promise<AxiosResponse<User>> => {
    return api.post('/users', data);
  },

  update: async (id: number, data: Partial<User>): Promise<AxiosResponse<User>> => {
    return api.patch(`/users/${id}`, data);
  },

  delete: async (id: number): Promise<AxiosResponse> => {
    return api.delete(`/users/${id}`);
  },

  deactivateAllExceptAli: async (): Promise<AxiosResponse<{ success: boolean; message: string; affected: number }>> => {
    try {
      return await api.post('/users/actions/deactivate-all-except-ali');
    } catch (error: any) {
      // Backward compatibility while backend rollout is in progress.
      if (error?.response?.status === 404) {
        return api.post('/users/deactivate-all-except-ali');
      }
      throw error;
    }
  },

  moderateAccounts: async (data: {
    user_ids: number[];
    action: 'deactivate' | 'delete';
    confirm: boolean;
  }): Promise<AxiosResponse<{ success: boolean; message: string; affected: number; skipped: number }>> => {
    return api.post('/users/actions/moderate-accounts', data);
  },

  me: async (): Promise<AxiosResponse<User>> => {
    return api.get('/users/me');
  },

  getOrganizationUsers: async (): Promise<AxiosResponse<User[]>> => {
    return api.get('/users/organization-users');
  },

  searchPlatform: async (email: string): Promise<AxiosResponse<User>> => {
    return api.get('/users/search-platform', { params: { email } });
  },
};

export const informationRequestsAPI = {
  getAllRequests: (): Promise<AxiosResponse<InformationRequest[]>> => {
    return api.get('/information-requests/all');
  },

  getMyRequests: (): Promise<AxiosResponse<InformationRequest[]>> => {
    return api.get('/information-requests');
  },

  updateStatus: (
    requestId: number,
    data: { status: string; notes?: string }
  ): Promise<AxiosResponse<InformationRequest>> => {
    return api.patch(`/information-requests/${requestId}`, data);
  },

  create: (data: { lead_id: number; field_name: string; notes?: string }): Promise<AxiosResponse<InformationRequest>> => {
    return api.post('/information-requests', data);
  },

  delete: (id: number): Promise<AxiosResponse> => {
    return api.delete(`/information-requests/${id}`);
  },
};

// API Functions
export const leadsAPI = {
  getAll: async (params?: {
    search?: string;
    sort_by?: string;
    sort_desc?: boolean;
    stage_id?: number;
    assigned_to_id?: number;
    skip?: number;
    limit?: number;
    tag?: string;
  }): Promise<APIResponse<LeadListResponse>> => {
    return api.get('/leads/', { params });
  },

  getById: async (id: number): Promise<APIResponse<Lead>> => {
    return api.get(`/leads/${id}`);
  },

  create: async (data: LeadCreateInput): Promise<APIResponse<Lead>> => {
    return api.post('/leads/', data);
  },

  update: async (id: number, data: Partial<Lead>): Promise<APIResponse<Lead>> => {
    return api.put(`/leads/${id}`, data);
  },

  delete: async (id: number): Promise<APIResponse<void>> => {
    return api.delete(`/leads/${id}`);
  },

  uploadCSV: async (formData: FormData): Promise<APIResponse<void>> => {
    return api.post('/leads/import/csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  exportCSV: async (params?: {
    search?: string;
    tag?: string;
    filters?: any;
  }): Promise<Blob> => {
    const response = await api.get('/leads/export/csv', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  downloadTemplate: async (): Promise<Blob> => {
    const response = await api.get('/leads/template', {
      responseType: 'blob',
    });
    return response.data;
  },

  requestInfo: async (data: { lead_id: number; field_name: string; notes?: string }): Promise<APIResponse<void>> => {
    return await api.post('/requests/info-request', data);
  }
};

export const eventsAPI = {
  getAll: async (params?: { start_date?: string; end_date?: string; timezone?: string }): Promise<AxiosResponse<Event[]>> => {
    return api.get('/events', { params });
  },

  getById: async (id: number): Promise<AxiosResponse<Event>> => {
    return api.get(`/events/${id}`);
  },

  create: async (data: EventCreateInput): Promise<AxiosResponse<Event>> => {
    return api.post('/events', data);
  },

  update: async (id: number, data: Partial<Event>): Promise<AxiosResponse<Event>> => {
    return api.put(`/events/${id}`, data);
  },

  delete: async (id: number): Promise<AxiosResponse> => {
    return api.delete(`/events/${id}`);
  },

  listTimezones: async (): Promise<AxiosResponse<string[]>> => {
    return api.get('/events/timezones');
  },
};

export const tasksAPI = {
  getAll: async (params?: { page?: number; limit?: number }): Promise<AxiosResponse<Task[]>> => {
    return api.get('/tasks', { params });
  },

  getById: async (id: number): Promise<AxiosResponse<Task>> => {
    return api.get(`/tasks/${id}`);
  },

  create: async (data: Partial<Task>): Promise<AxiosResponse<Task>> => {
    return api.post('/tasks', data);
  },

  update: async (id: number, data: Partial<Task>): Promise<AxiosResponse<Task>> => {
    return api.put(`/tasks/${id}`, data);
  },

  delete: async (id: number): Promise<AxiosResponse> => {
    return api.delete(`/tasks/${id}`);
  },
};

export const dealsAPI = {
  getAll: async (params?: { skip?: number }): Promise<AxiosResponse<DealResponse>> => {
    return api.get('/deals/', { params });
  },
  getById: async (id: number): Promise<AxiosResponse<Deal>> => {
    return api.get(`/deals/${id}`);
  },
  create: async (data: Partial<Deal>): Promise<AxiosResponse<Deal>> => {
    return api.post('/deals/', data);
  },
  update: async (id: number, data: Partial<Deal>): Promise<AxiosResponse<Deal>> => {
    return api.put(`/deals/${id}`, data);
  },
  delete: async (id: number): Promise<AxiosResponse> => {
    return api.delete(`/deals/${id}`);
  }
};

export const leadStagesAPI = {
  getAll: async (): Promise<AxiosResponse<{ data: LeadStage[] }>> => {
    return api.get('/lead-stages');
  },

  getById: async (id: number): Promise<AxiosResponse<LeadStage>> => {
    return api.get(`/lead-stages/${id}`);
  },

  create: async (data: Partial<LeadStage>): Promise<AxiosResponse<LeadStage>> => {
    return api.post('/lead-stages', data);
  },

  update: async (id: number, data: Partial<LeadStage>): Promise<AxiosResponse<LeadStage>> => {
    return api.put(`/lead-stages/${id}`, data);
  },

  delete: async (id: number): Promise<AxiosResponse> => {
    return api.delete(`/lead-stages/${id}`);
  },
};

export const healthAPI = {
  check: async (): Promise<AxiosResponse> => {
    return api.get('/health');
  },
};

export const organizationsAPI = {
  getAll: () => api.get<Organization[]>('/organizations/'),
  get: (id: number) => api.get<Organization>(`/organizations/${id}/`),
  create: (data: FormData) => {
    // Convert boolean to string for FormData
    if (data.has('is_active')) {
      data.set('is_active', data.get('is_active') === 'true' ? 'true' : 'false');
    }
    
    return api.post<Organization>('/organizations/', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  update: (id: number, data: FormData) => {
    // Convert boolean to string for FormData
    if (data.has('is_active')) {
      data.set('is_active', data.get('is_active') === 'true' ? 'true' : 'false');
    }
    
    return api.patch<Organization>(`/organizations/${id}/`, data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  delete: (id: number) => api.delete<Organization>(`/organizations/${id}/`),
  getStats: (id: number) => api.get<any>(`/organizations/${id}/stats/`),
};

export const notificationsAPI = {
  getAll: (params?: { skip?: number; limit?: number; is_read?: boolean }) =>
    api.get('/notifications', { params }),
  
  markAsRead: (id: number) =>
    api.put(`/notifications/${id}/read`),
  
  markAllAsRead: () =>
    api.put('/notifications/mark-all-read'),
  
  delete: (id: number) =>
    api.delete(`/notifications/${id}`),
};

export interface OrganizationSettings {
  id: number;
  organization_id: number;
  name: string;
  logo_url?: string;
  timezone: string;
  currency: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  lead_fields: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface EmailSettings {
  id: number;
  organization_id: number;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_use_tls: boolean;
  default_from_email?: string;
  created_at: string;
  updated_at?: string;
}

export interface EmailTemplate {
  id: number;
  organization_id: number;
  name: string;
  subject: string;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export const settingsAPI = {
  getOrganizationSettings: (): Promise<AxiosResponse<OrganizationSettings>> => 
    api.get('/settings/organization'),
  updateOrganizationSettings: (data: Partial<OrganizationSettings>): Promise<AxiosResponse<OrganizationSettings>> => 
    api.put('/settings/organization', data),

  getEmailSettings: (): Promise<AxiosResponse<EmailSettings>> => 
    api.get('/settings/email'),
  updateEmailSettings: (data: Partial<EmailSettings>): Promise<AxiosResponse<EmailSettings>> => 
    api.put('/settings/email', data),

  getEmailTemplates: (): Promise<AxiosResponse<EmailTemplate[]>> => 
    api.get('/settings/email/templates'),
  createEmailTemplate: (data: Omit<EmailTemplate, 'id' | 'organization_id' | 'created_at' | 'updated_at'>): Promise<AxiosResponse<EmailTemplate>> => 
    api.post('/settings/email/templates', data),
  updateEmailTemplate: (id: number, data: Partial<EmailTemplate>): Promise<AxiosResponse<EmailTemplate>> => 
    api.put(`/settings/email/templates/${id}`, data),
  deleteEmailTemplate: (id: number): Promise<AxiosResponse<void>> => 
    api.delete(`/settings/email/templates/${id}`),
};

export const tagsAPI = {
  getAll: async (): Promise<AxiosResponse<Tag[]>> => {
    return api.get('/tags');
  },

  getById: async (id: number): Promise<AxiosResponse<Tag>> => {
    return api.get(`/tags/${id}`);
  },

  create: async (data: Partial<Tag>): Promise<AxiosResponse<Tag>> => {
    return api.post('/tags', data);
  },

  update: async (id: number, data: Partial<Tag>): Promise<AxiosResponse<Tag>> => {
    return api.put(`/tags/${id}`, data);
  },

  delete: async (id: number): Promise<AxiosResponse> => {
    return api.delete(`/tags/${id}`);
  },
};

export default {
  users: {
    list() {
      return usersAPI.getAll();
    },
    get(id: number) {
      return usersAPI.getById(id);
    },
    update(id: number, data: Partial<User>) {
      return usersAPI.update(id, data);
    },
    me() {
      return usersAPI.me();
    },
    getOrganizationUsers() {
      return usersAPI.getOrganizationUsers();
    },
    searchPlatform(email: string) {
      return usersAPI.searchPlatform(email);
    },
  },
  leads: {
    create(data: LeadCreateInput) {
      return leadsAPI.create(data);
    },
    update(id: number, data: Partial<Lead>) {
      return leadsAPI.update(id, data);
    },
    delete(id: number) {
      return leadsAPI.delete(id);
    },
    get(id: number) {
      return leadsAPI.getById(id);
    },
    list(params: { 
      search?: string;
      sort_by?: string;
      sort_desc?: boolean;
      stage_id?: number;
      assigned_to_id?: number;
    }) {
      return leadsAPI.getAll(params);
    },
    uploadCSV(formData: FormData) {
      return leadsAPI.uploadCSV(formData);
    },
    exportCSV(params?: {
      search?: string;
      tag?: string;
      filters?: any;
    }) {
      return leadsAPI.exportCSV(params);
    },
    downloadTemplate() {
      return leadsAPI.downloadTemplate();
    },
    requestInfo(data: { lead_id: number; field_name: string; notes?: string }) {
      return leadsAPI.requestInfo(data);
    }
  },
  events: {
    create: (data: EventCreateInput) => eventsAPI.create(data),
    update: (id: number, data: Partial<Event>) => eventsAPI.update(id, data),
    delete: (id: number) => eventsAPI.delete(id),
    get: (id: number) => eventsAPI.getById(id),
    list: (params: { start_date?: string; end_date?: string; timezone?: string }) => eventsAPI.getAll(params),
    listTimezones: eventsAPI.listTimezones,
  },
  tasks: tasksAPI,
  deals: dealsAPI,
  leadStages: leadStagesAPI,
  health: healthAPI,
  informationRequests: informationRequestsAPI,
  organizations: organizationsAPI,
  notifications: notificationsAPI,
  tags: tagsAPI,
  settings: settingsAPI,
  teamInvitations: teamInvitationsAPI
};
