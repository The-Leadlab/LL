import api from '../axios';

export interface InformationRequest {
  id: number;
  lead_id: number;
  requested_by: number;
  field_name: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  requester_name: string;
  lead_name: string;
}

export interface InformationRequestCreate {
  lead_id: number;
  field_name: string;
  notes?: string;
}

export interface InformationRequestUpdate {
  status: string;
  notes?: string;
}

export const informationRequestsAPI = {
  create: async (data: InformationRequestCreate): Promise<InformationRequest> => {
    const response = await api.post('/information-requests/', data);
    return response.data;
  },

  getLeadRequests: async (leadId: number): Promise<InformationRequest[]> => {
    const response = await api.get(`/information-requests/lead/${leadId}`);
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  },

  getMyRequests: async (): Promise<InformationRequest[]> => {
    const response = await api.get('/information-requests/me');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  },

  getAllRequests: async (): Promise<InformationRequest[]> => {
    const response = await api.get('/information-requests/all');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  },

  updateStatus: async (requestId: number, data: InformationRequestUpdate): Promise<InformationRequest> => {
    const response = await api.put(`/information-requests/${requestId}/status`, data);
    return response.data;
  }
};
