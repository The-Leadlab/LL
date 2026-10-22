import api from '../axios';

export interface Stage {
  id: number;
  name: string;
  description?: string;
  color: string;
  order_index: number;
  organization_id: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StageCreate {
  name: string;
  description?: string;
  color?: string;
  order_index?: number;
}

function normalizeStagesList(payload: unknown): Stage[] {
  if (Array.isArray(payload)) return payload as Stage[];
  if (payload && typeof payload === 'object') {
    const obj = payload as { data?: unknown; results?: unknown; items?: unknown };
    if (Array.isArray(obj.data)) return obj.data as Stage[];
    if (Array.isArray(obj.results)) return obj.results as Stage[];
    if (Array.isArray(obj.items)) return obj.items as Stage[];
  }
  return [];
}

export const stagesAPI = {
  /** Always returns Stage[] (never a raw AxiosResponse) so react-query caches stay safe. */
  getAll: async (): Promise<Stage[]> => {
    const response = await api.get('/lead-stages/');
    return normalizeStagesList(response?.data ?? response);
  },

  getById: async (id: number): Promise<any> => {
    const response = await api.get(`/lead-stages/${id}/`);
    return response.data;
  },

  create: async (data: StageCreate): Promise<any> => {
    const response = await api.post('/lead-stages/', data);
    return response.data;
  },

  update: async (id: number, data: Partial<StageCreate>): Promise<any> => {
    const response = await api.put(`/lead-stages/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<any> => {
    const response = await api.delete(`/lead-stages/${id}/`);
    return response.data;
  },
};

export default stagesAPI;
