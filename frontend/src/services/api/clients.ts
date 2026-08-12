import api from '../axios';

export interface Client {
  id: number;
  organization_id: number;
  name: string;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at?: string | null;
  lead_count?: number | null;
}

export interface ClientList {
  items: Client[];
  total: number;
}

export const clientsAPI = {
  list: async (includeArchived = false): Promise<ClientList> => {
    const response = await api.get('/clients/', {
      params: { include_archived: includeArchived },
    });
    return response.data;
  },

  create: async (name: string): Promise<Client> => {
    const response = await api.post('/clients/', { name });
    return response.data;
  },

  rename: async (id: number, name: string): Promise<Client> => {
    const response = await api.patch(`/clients/${id}`, { name });
    return response.data;
  },

  archive: async (id: number): Promise<Client> => {
    const response = await api.post(`/clients/${id}/archive`);
    return response.data;
  },

  restore: async (id: number): Promise<Client> => {
    const response = await api.post(`/clients/${id}/restore`);
    return response.data;
  },
};

export default clientsAPI;
