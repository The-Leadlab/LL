import api from '../axios';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  organization_id: number;
  is_active: boolean;
  is_admin: boolean;
  job_title?: string;
  is_self?: boolean;
}

export interface UserResponse {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  organization_id: number;
  is_active: boolean;
  is_admin: boolean;
  job_title?: string;
}

export interface UserListResponse {
  items: UserResponse[];
  total: number;
  page: number;
  size: number;
  has_more: boolean;
}

// Geliştirilen mock users verisi - daha gerçekçi
const mockUsers: User[] = [
  {
    id: 1,
    email: 'admin@example.com',
    first_name: 'Admin',
    last_name: 'User',
    organization_id: 1,
    is_active: true,
    is_admin: true,
    job_title: 'Administrator'
  },
  {
    id: 2,
    email: 'sales@example.com',
    first_name: 'Sales',
    last_name: 'Manager',
    organization_id: 1,
    is_active: true,
    is_admin: false,
    job_title: 'Sales Manager'
  },
  {
    id: 3,
    email: 'support@example.com',
    first_name: 'Support',
    last_name: 'Specialist',
    organization_id: 1,
    is_active: true,
    is_admin: false,
    job_title: 'Support Specialist'
  },
  {
    id: 4,
    email: 'marketing@example.com',
    first_name: 'Marketing',
    last_name: 'Director',
    organization_id: 1,
    is_active: true,
    is_admin: false,
    job_title: 'Marketing Director'
  },
  {
    id: 5,
    email: 'finance@example.com',
    first_name: 'Finance',
    last_name: 'Analyst',
    organization_id: 1,
    is_active: true,
    is_admin: false,
    job_title: 'Finance Analyst'
  }
];

// API fonksiyonları - gerçek veritabanı verilerini alacak şekilde düzeltildi
const getOrganizationUsers = async (): Promise<User[]> => {
  try {
    // URL sonuna / ekleyerek yönlendirmeyi önleyelim
    const response = await api.get<User[]>('/users/organization-users/');
    console.log('Organization users response:', response.data);
    return response.data;
  } catch (error) {
    console.log('Error fetching organization users:', error);
    throw error;
  }
};

const getById = async (id: number): Promise<User> => {
  try {
    const response = await api.get<User>(`/users/${id}/`);
    return response.data;
  } catch (error) {
    console.log(`Error fetching user with id ${id}:`, error);
    throw error;
  }
};

const getCurrentUser = async (): Promise<User> => {
  try {
    const response = await api.get<User>('/users/me/');
    return response.data;
  } catch (error) {
    console.log('Error fetching current user:', error);
    throw error;
  }
};

interface GetUsersParams {
  skip?: number;
  limit?: number;
  organization_id?: number;
}

const getAll = async (params: GetUsersParams = {}) => {
  const response = await api.get('/users/', { params });
  return response.data;
};

const getAssignable = async () => {
  const response = await api.get('/users/assignable');
  return response.data;
};

const create = async (data: Partial<User>): Promise<User> => {
  try {
    const response = await api.post<User>('/users/', data);
    return response.data;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

const update = async (id: number, data: Partial<User>): Promise<User> => {
  try {
    const response = await api.put<User>(`/users/${id}/`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

const remove = async (id: number): Promise<void> => {
  try {
    await api.delete(`/users/${id}/`);
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

const usersAPI = {
  getOrganizationUsers,
  getAll,
  getAssignable,
  getById,
  getCurrentUser,
  create,
  update,
  remove
};

export default usersAPI;
