import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersAPI, organizationsAPI } from '@/services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/Dialog';
import { Form, FormField, FormItem, FormLabel, FormControl } from '../../components/ui/Form';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/Select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';

const userSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  is_active: z.boolean().default(true),
  is_admin: z.boolean().default(false),
  organization_id: z.number(),
});

type UserFormData = z.infer<typeof userSchema>;

export function UserManagement() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<any>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [showPassword, setShowPassword] = React.useState(false);
  const showDangerousDebug = import.meta.env.DEV;
  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
  });

  const { data: users = [], isLoading: isUsersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await usersAPI.getAll();
      return response.data.items;
    },
  });

  const { data: organizations = [], isLoading: isOrgsLoading } = useQuery({
    queryKey: ['organizations', 'active-only'],
    queryFn: async () => {
      try {
        // Assignment dropdown: active teams only (deleted/deactivated hidden)
        const response = await organizationsAPI.getAll();
        
        // Make sure we return an array
        const orgs = response.data || [];
        const result = Array.isArray(orgs) ? orgs : [];
        return result.filter((org: { is_active?: boolean | null }) => org.is_active !== false);
      } catch (error) {
        console.error('UserManagement - Error fetching organizations:', error);
        return [];
      }
    },
  });

  const isTombstoneUser = (user: { email?: string; first_name?: string }) => {
    const email = (user.email || '').toLowerCase();
    return email.endsWith('@deleted.local') || email.startsWith('deleted+user-');
  };

  const activeUsers = React.useMemo(
    () => users.filter((user) => !isTombstoneUser(user)),
    [users],
  );

  const filteredUsers = React.useMemo(() => {
    const base = activeUsers;
    if (!searchTerm) return base;
    return base.filter(
      (user) =>
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [activeUsers, searchTerm]);

  const createUserMutation = useMutation({
    mutationFn: (data: UserFormData) => usersAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsDialogOpen(false);  
      form.reset();            
      toast.success('User created successfully');
    },
    onError: () => {
      toast.error('Failed to create user');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserFormData> }) =>
      usersAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsDialogOpen(false);  
      setEditingUser(null);    
      form.reset();            
      toast.success('User updated successfully');
    },
    onError: () => {
      toast.error('Failed to update user');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => usersAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete user');
    },
  });

  const deactivateAllExceptAliMutation = useMutation({
    mutationFn: () => usersAPI.deactivateAllExceptAli(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(res.data?.message || 'Non-Ali users were permanently deleted');
    },
    onError: () => {
      toast.error('Failed to deactivate non-Ali users');
    },
  });

  const moderateMutation = useMutation({
    mutationFn: ({ action, user_ids }: { action: 'deactivate' | 'delete'; user_ids: number[] }) =>
      usersAPI.moderateAccounts({ user_ids, action, confirm: true }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSelectedIds([]);
      toast.success(res.data?.message || 'Accounts updated');
    },
    onError: () => {
      toast.error('Could not update the selected accounts');
    },
  });

  const onSubmit = async (data: UserFormData) => {
    try {
      if (editingUser) {
        // Remove password if not changed
        if (!data.password) {
          const { password, ...updateData } = data;
          await updateUserMutation.mutateAsync({ id: editingUser.id, data: updateData });
        } else {
          await updateUserMutation.mutateAsync({ id: editingUser.id, data });
        }
      } else {
        await createUserMutation.mutateAsync(data);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowPassword(false);
    form.reset({
      email: '',
      first_name: '',
      last_name: '',
      password: '',
      is_active: true,
      is_admin: false,
      organization_id: 0,
    });
    setIsDialogOpen(true);
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setShowPassword(false);
    form.reset({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_active: user.is_active,
      is_admin: user.is_admin,
      organization_id: user.organization_id,
    });
    setIsDialogOpen(true);
  };

  const handleDeleteUser = (userId: number) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      deleteUserMutation.mutate(userId);
    }
  };

  const handleDeactivateAllExceptAli = () => {
    if (
      window.confirm(
        'This will permanently delete all users except ali@the-leadlab.com and their linked data. This cannot be undone. Continue?'
      )
    ) {
      deactivateAllExceptAliMutation.mutate();
    }
  };

  const toggleSelected = (userId: number, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, userId])] : prev.filter((id) => id !== userId)));
  };

  const suspiciousUsers = filteredUsers.filter((user) => {
    const email = (user.email || '').toLowerCase();
    const hasName = Boolean((user.first_name || '').trim() || (user.last_name || '').trim());
    return !user.is_active || !hasName || /[a-z]{12,}@gmail\.com/.test(email);
  });

  const handleSelectSuspicious = () => {
    setSelectedIds(suspiciousUsers.map((user) => user.id));
  };

  const handleBulkAction = (action: 'deactivate' | 'delete') => {
    if (!selectedIds.length) {
      toast.error('Select at least one account');
      return;
    }
    const label = action === 'delete' ? 'permanently delete' : 'deactivate';
    if (
      window.confirm(
        `This will ${label} ${selectedIds.length} selected account(s). Protected admin accounts are skipped. Continue?`
      )
    ) {
      moderateMutation.mutate({ action, user_ids: selectedIds });
    }
  };

  if (isUsersLoading || isOrgsLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center min-w-0">
        <div className="flex-1 max-w-sm min-w-0">
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-w-0"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" onClick={handleSelectSuspicious}>
            Select suspicious
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkAction('deactivate')}
            disabled={!selectedIds.length || moderateMutation.isPending}
          >
            Deactivate selected
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-300 hover:bg-red-50"
            onClick={() => handleBulkAction('delete')}
            disabled={!selectedIds.length || moderateMutation.isPending}
          >
            Delete selected
          </Button>
          {showDangerousDebug && (
          <Button
            variant="outline"
            className="text-red-600 border-red-300 hover:bg-red-50"
            onClick={handleDeactivateAllExceptAli}
            disabled={deactivateAllExceptAliMutation.isPending}
          >
            {deactivateAllExceptAliMutation.isPending ? 'Deleting...' : 'Delete all except Ali'}
          </Button>
          )}
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            if (!open) {
              setIsDialogOpen(false);
              setEditingUser(null);
              setShowPassword(false);
              form.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={handleAddUser}>Add User</Button>
            </DialogTrigger>
            <DialogContent className="bg-white sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{editingUser ? 'New Password (optional)' : 'Password'}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            {...field}
                            required={!editingUser}
                            className="pr-10"
                            autoComplete={editingUser ? 'new-password' : 'new-password'}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 bg-transparent"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="organization_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workspace</FormLabel>
                      <Select
                        value={field.value?.toString()}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an organization" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">New personal workspace (starts empty)</SelectItem>
                          {Array.isArray(organizations) && organizations.map((org: any) => (
                            <SelectItem key={org.id} value={org.id.toString()}>
                              Join team: {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <div className="space-y-6 py-2">
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm transition-colors hover:bg-gray-50">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active Status</FormLabel>
                          <div className="text-sm text-gray-500">
                            {field.value ? 'User can access the system' : 'User access is disabled'}
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-200"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_admin"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm transition-colors hover:bg-gray-50">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Admin Access</FormLabel>
                          <div className="text-sm text-gray-500">
                            {field.value ? 'Has full administrative privileges' : 'Regular user permissions'}
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="data-[state=checked]:bg-purple-500 data-[state=unchecked]:bg-gray-200"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingUser(null);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updateUserMutation.isPending || createUserMutation.isPending}
                  >
                    {updateUserMutation.isPending || createUserMutation.isPending ? (
                      'Saving...'
                    ) : editingUser ? (
                      'Update'
                    ) : (
                      'Create'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto min-w-0">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="py-3 px-4 text-left w-10">
                <input
                  type="checkbox"
                  aria-label="Select all visible users"
                  checked={filteredUsers.length > 0 && selectedIds.length === filteredUsers.length}
                  onChange={(e) => {
                    setSelectedIds(e.target.checked ? filteredUsers.map((user) => user.id) : []);
                  }}
                />
              </th>
              <th className="py-3 px-4 text-left">Name</th>
              <th className="py-3 px-4 text-left">Email</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-left">Role</th>
              <th className="py-3 px-4 text-left">Organization</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredUsers) && filteredUsers.map((user) => {
              const organization = Array.isArray(organizations) ? organizations.find(
                (org) => org.id === user.organization_id
              ) : null;
              return (
                <tr key={user.id} className="border-b">
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      aria-label={`Select ${user.email}`}
                      checked={selectedIds.includes(user.id)}
                      onChange={(e) => toggleSelected(user.id, e.target.checked)}
                    />
                  </td>
                  <td className="py-3 px-4">{user.first_name} {user.last_name}</td>
                  <td className="py-3 px-4">{user.email}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        user.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        user.is_admin
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {user.is_admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="py-3 px-4">{organization?.name || '-'}</td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
