import api from '../axios';
// Lead duplicate tanımını ortadan kaldıralım
// import { Lead, LeadStage, LeadWithStats } from '@/types/leads';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface Stage {
  id: number;
  name: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Note {
  id: number;
  content: string;
  created_at: string;
  updated_at: string;
  user: User;
}

export interface Lead {
  id: number;
  first_name: string;
  last_name: string;
  company: string | null;
  job_title: string | null;
  email: string | null;
  telephone: string | null;
  mobile: string | null;
  location: string | null;
  linkedin: string | null;
  country: string | null;
  website: string | null;
  sector: string | null;
  unique_lead_id: string | null;
  time_in_current_role: string | null;
  lab_comments: string | null;
  client_comments: string | null;
  psychometrics: Record<string, any> | null;
  wpi: string | null;
  source: string | null;
  est_wealth_experience: string | null;
  organization_id: number;
  user_id: number;
  stage_id: number;
  created_by: number;
  created_at: string;
  updated_at: string | null;
  is_deleted: boolean;
  visible: boolean;
  full_name: string;
  stage: Stage | null;
  user: User | null;
  creator: User | null;
  tags: Tag[];
  notes: Note[];
  client_id?: number | null;
  client_name?: string | null;
}

export interface LeadCreate {
  first_name: string;
  last_name: string;
  email?: string;
  company?: string;
  job_title?: string;
  location?: string;
  stage_id: number;
  client_id?: number;
}

export interface LeadUpdate extends Partial<LeadCreate> {}

export interface LeadStage {
  id: number;
  name: string;
  description?: string;
  color: string;
  order_index: number;
  organization_id: number;
  is_active: boolean;
}

export interface LeadWithStats extends Lead {
  stats?: {
    total_deals?: number;
    total_value?: number;
    win_rate?: number;
    avg_deal_size?: number;
  };
}

export interface LeadStats {
  total: number;
  new: number;
  qualified: number;
  contacted: number;
  converted: number;
  hot_prospects?: number;
  qualification_rate?: number;
}

interface LeadsParams {
  search?: string;
  sort_by?: string;
  sort_desc?: boolean;
  stage_id?: number;
  assigned_to_id?: number;
  tag?: string;
  skip?: number;
  limit?: number;
}

interface LeadQueryParams {
  search?: string;
  skip?: number;
  limit?: number;
  sort_by?: string;
  sort_desc?: boolean;
}

interface LeadResponse {
  success: boolean;
  message: string;
  data: Lead | Lead[]; 
}

// Her zaman response verecek şekilde API çağrıları
export const getLeads = async (params: LeadQueryParams = {}): Promise<any> => {
  console.log('Getting leads with params:', params);
  try {
    const response = await api.get('/leads/', { params });
    const d = response.data;
    if (d && Array.isArray(d.results)) {
      return d;
    }
    if (Array.isArray(d)) {
      return {
        results: d,
        total: d.length,
        page: 0,
        size: d.length,
        has_more: false,
      };
    }
    return d;
  } catch (error) {
    console.log('Error in getLeads:', error);
    throw error;
  }
};

export const getById = async (id: number): Promise<LeadResponse> => {
  try {
    const response = await api.get(`/leads/${id}/`);
    return response.data;
  } catch (error) {
    console.log('Error in getById:', error);
    throw error;
  }
};

export const create = async (data: Partial<Lead>): Promise<LeadResponse> => {
  try {
    const response = await api.post(`/leads/`, data);
    return response.data;
  } catch (error) {
    console.error('Error creating lead:', error);
    throw error;
  }
};

export const update = async (id: number, data: Partial<Lead>): Promise<LeadResponse> => {
  try {
    const response = await api.put(`/leads/${id}/`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating lead:', error);
    throw error;
  }
};

export const remove = async (id: number): Promise<LeadResponse> => {
  try {
    const response = await api.delete(`/leads/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Error deleting lead:', error);
    throw error;
  }
};

const updateTags = async (id: number, data: { tags: number[] }) => {
  try {
    const response = await api.patch<Lead>(`/leads/${id}/tags/`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating lead tags:', error);
    throw error;
  }
};

// leadsAPI export'u ekleniyor
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
    client_id?: number;
  }): Promise<any> => {
    return api.get('/leads/', { params });
  },

  getLeads: async (params?: {
    search?: string;
    sort_by?: string;
    sort_desc?: boolean;
    stage_id?: number;
    assigned_to_id?: number;
    skip?: number;
    limit?: number;
    tag?: string;
    client_id?: number;
  }): Promise<any> => {
    const response = await api.get('/leads/', { params });
    const data = response.data;
    if (data?.results != null) {
      return {
        results: data.results,
        total: data.total ?? data.results.length,
        page: data.page ?? 0,
        size: data.size ?? data.results.length,
        has_more: data.has_more ?? false,
      };
    }
    const list = Array.isArray(data) ? data : [];
    return {
      results: list,
      total: list.length,
      page: 0,
      size: list.length,
      has_more: false,
    };
  },

  getById: async (id: number): Promise<any> => {
    return api.get(`/leads/${id}`);
  },

  create: async (data: Partial<Lead>): Promise<any> => {
    return api.post('/leads/', data);
  },

  update: async (id: number, data: Partial<Lead>): Promise<any> => {
    return api.put(`/leads/${id}`, data);
  },

  delete: async (id: number): Promise<any> => {
    return api.delete(`/leads/${id}`);
  },

  uploadCSV: async (formData: FormData): Promise<any> => {
    return api.post('/leads/import/csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  moveToClient: async (data: {
    to_client_id: number;
    lead_ids?: number[];
    from_client_id?: number;
    move_all_from_client?: boolean;
  }): Promise<any> => {
    return api.post('/leads/bulk/move-client', data);
  },

  exportCSV: async (params?: {
    search?: string;
    tag?: string;
    client_id?: number;
    filters?: any;
  }): Promise<Blob> => {
    const response = await api.get('/leads/export/csv', {
      params,
      responseType: 'blob',
    });
    const blob = response.data as Blob;
    const ct = String(response.headers['content-type'] || blob.type || '');
    if (ct.includes('application/json') || ct.includes('json')) {
      const text = await blob.text();
      let msg = 'Export failed';
      try {
        const j = JSON.parse(text) as { detail?: unknown };
        if (typeof j.detail === 'string') msg = j.detail;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const head = await blob.slice(0, 1).text();
    if (head === '{') {
      const text = await blob.text();
      let msg = 'Export failed';
      try {
        const j = JSON.parse(text) as { detail?: unknown };
        if (typeof j.detail === 'string') msg = j.detail;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return blob;
  },

  downloadTemplate: async (): Promise<Blob> => {
    const response = await api.get('/leads/template', {
      responseType: 'blob',
    });
    return response.data;
  },

  requestInfo: async (data: { lead_id: number; field_name: string; notes?: string }): Promise<any> => {
    return await api.post('/requests/info-request', data);
  },

  getLeadStats: async (): Promise<LeadStats> => {
    const response = await api.get('/leads/stats');
    return response.data;
  }
};

export default leadsAPI;
