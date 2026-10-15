import api from '../axios';
import { Deal } from '@/types/deal';

export interface DealCreate {
  name: string;
  description?: string;
  amount: number;
  currency_id: number;
  status: string;
  valid_until?: string | null;
  assigned_to_id: number;
  lead_id: number;
}

export interface DealUpdate extends Partial<DealCreate> {}

export interface DealsParams {
  search?: string;
  sort_by?: string;
  sort_desc?: boolean;
  lead_id?: number;
  assigned_to_id?: number;
  page?: number;
  per_page?: number;
}

const dealsAPI = {
  getDeals: async (params: DealsParams = {}) => {
    const response = await api.get('/deals', { params });
    return response.data;
  },

  getDeal: async (id: number): Promise<Deal> => {
    const response = await api.get(`/deals/${id}`);
    return response.data;
  },

  createDeal: async (data: DealCreate): Promise<Deal> => {
    const response = await api.post('/deals', data);
    return response.data;
  },

  updateDeal: async (id: number, data: DealUpdate): Promise<Deal> => {
    const response = await api.put(`/deals/${id}`, data);
    return response.data;
  },

  deleteDeal: async (id: number): Promise<void> => {
    await api.delete(`/deals/${id}`);
  }
};

export default dealsAPI; 