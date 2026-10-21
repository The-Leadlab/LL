import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiOrigin } from '@/lib/apiOrigin'
import { organizationsAPI } from '@/services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '../../components/ui/Dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription } from '../../components/ui/Form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Upload, X } from 'lucide-react';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  description: z.string().optional(),
  website: z.string().optional(),
  is_active: z.boolean().default(true),
  logo: z.custom<File>()
    .optional()
    .refine(
      (file) => {
        if (!file) return true;
        return file.size <= MAX_FILE_SIZE;
      },
      'Max file size is 5MB'
    )
    .refine(
      (file) => {
        if (!file) return true;
        return ACCEPTED_IMAGE_TYPES.includes(file.type);
      },
      'Only .jpg, .jpeg, .png and .webp formats are supported'
    ),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

export function OrganizationManagement() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingOrg, setEditingOrg] = React.useState<any>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  const form = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      description: '',
      website: '',
      is_active: true,
    }
  });

  const { data: organizations = [], isLoading: isLoadingOrgs, error: orgsError } = useQuery({
    queryKey: ['organizations', 'include-inactive'],
    queryFn: async () => {
      try {
        // Org management needs inactive teams so admins can review/reactivate
        const response = await organizationsAPI.getAll({ include_inactive: true });
        
        // Make sure we return an array
        const orgs = response.data || [];
        const result = Array.isArray(orgs) ? orgs : [];
        
        return result;
      } catch (error) {
        console.error('Error fetching organizations:', error);
        return [];
      }
    },
  });

  const filteredOrganizations = React.useMemo(() => {
    if (!searchTerm) return organizations;
    return organizations.filter(org => 
      org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.website?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [organizations, searchTerm]);

  const createOrgMutation = useMutation({
    mutationFn: async (data: OrganizationFormData) => {
      // Add https:// if website doesn't start with http:// or https://
      if (data.website && !data.website.match(/^https?:\/\//)) {
        data.website = 'https://' + data.website;
      }
      
      const formData = new FormData();
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      if (data.website) formData.append('website', data.website);
      formData.append('is_active', String(data.is_active));
      
      if (data.logo instanceof File) {
        formData.append('logo', data.logo);
      }

      // Log the form data for debugging
      for (const [key, value] of formData.entries()) {
      }
      
      const response = await organizationsAPI.create(formData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization created successfully');
    },
    onError: (error: any) => {
      console.error('Create organization error:', error);
      console.error('Error details:', error.response?.data);
      
      let errorMessage = 'Failed to create organization';
      let isPartialSuccess = false;
      
      if (error.response?.data?.detail) {
        errorMessage = typeof error.response.data.detail === 'string' 
          ? error.response.data.detail 
          : Array.isArray(error.response.data.detail) 
            ? error.response.data.detail[0]?.msg || errorMessage
            : errorMessage;
            
        // Check if this is a partial success (org created but logo failed)
        isPartialSuccess = errorMessage.includes('Organization was created but');
      }
      
      if (isPartialSuccess) {
        toast.warning(errorMessage);
        // Still close the dialog as the organization was created
        setIsDialogOpen(false);
        form.reset();
        setPreviewUrl(null);
        // Refresh the organizations list
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
      } else {
        toast.error(errorMessage);
        setError(errorMessage);
      }
    },
  });

  const updateOrgMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: OrganizationFormData }) => {
      // Add https:// if website doesn't start with http:// or https://
      if (data.website && !data.website.match(/^https?:\/\//)) {
        data.website = 'https://' + data.website;
      }
      
      const formData = new FormData();
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      if (data.website) formData.append('website', data.website);
      formData.append('is_active', String(data.is_active));
      
      if (data.logo instanceof File) {
        formData.append('logo', data.logo);
      }
      
      return organizationsAPI.update(id, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization updated successfully');
    },
    onError: (error: any) => {
      console.error('Update organization error:', error);
      let errorMessage = 'Failed to update organization';
      
      if (error.response?.data?.detail) {
        errorMessage = typeof error.response.data.detail === 'string' 
          ? error.response.data.detail 
          : Array.isArray(error.response.data.detail) 
            ? error.response.data.detail[0]?.msg || errorMessage
            : errorMessage;
      }
      
      toast.error(errorMessage);
      setError(errorMessage);
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (id: number) => organizationsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete organization');
    },
  });

  const onSubmit = async (data: OrganizationFormData) => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (editingOrg) {
        await updateOrgMutation.mutateAsync({ id: editingOrg.id, data });
      } else {
        await createOrgMutation.mutateAsync(data);
      }
      
      // Close dialog and reset form only on success
      setIsDialogOpen(false);
      form.reset();
      setPreviewUrl(null);
    } catch (error: any) {
      console.error('Form submission error:', error);
      console.error('Error response:', error.response);
      const errorMessage = typeof error === 'string' ? error : 'An error occurred while saving the organization';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddOrg = () => {
    setEditingOrg(null);
    form.reset({
      name: '',
      description: '',
      website: '',
      is_active: true,
    });
    setPreviewUrl(null);
    setIsDialogOpen(true);
  };

  const handleEditOrg = (org: any) => {
    setEditingOrg(org);
    form.reset({
      name: org.name,
      description: org.description || '',
      website: org.website || '',
      is_active: org.is_active,
    });
    setPreviewUrl(org.logo_filename || null);
    setIsDialogOpen(true);
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPreviewUrl(null);
      form.setValue('logo', undefined);
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Logo file size must be less than 5MB');
      event.target.value = '';
      return;
    }

    // Validate file type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Logo file must be JPEG, PNG or WebP');
      event.target.value = '';
      return;
    }

    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    form.setValue('logo', file);
  };

  if (isLoadingOrgs) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (orgsError) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p>Error loading organizations: {orgsError.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <Input
          placeholder="Search organizations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <Button 
          onClick={handleAddOrg}
          className="bg-primary hover:bg-primary/90 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Add Organization
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white">
          <DialogHeader>
            <DialogTitle>{editingOrg ? 'Edit' : 'Add'} Organization</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit(onSubmit)(e);
              }} 
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input {...field} type="text" placeholder="example.com" />
                    </FormControl>
                    <FormDescription>
                      https:// will be added automatically if not provided
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="logo"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>Logo</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept={ACCEPTED_IMAGE_TYPES.join(',')}
                          onChange={(e) => {
                            handleLogoChange(e);
                          }}
                          {...field}
                        />
                        {previewUrl && (
                          <div className="relative w-20 h-20">
                            <img
                              src={previewUrl}
                              alt="Logo preview"
                              className="w-full h-full object-cover rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewUrl(null);
                                onChange(null);
                              }}
                              className="absolute -top-2 -right-2 bg-white rounded-full p-1"
                            >
                              <X className="w-4 h-4 text-gray-500" />
                            </button>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Maximum file size: 5MB. Accepted formats: JPEG, PNG, WebP
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Organization will be visible and operational
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setEditingOrg(null);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  variant="outline"
                  disabled={updateOrgMutation.isPending || createOrgMutation.isPending}
                >
                  {updateOrgMutation.isPending || createOrgMutation.isPending ? (
                    'Saving...'
                  ) : editingOrg ? (
                    'Update'
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
              {error && (
                <div className="text-red-500 text-sm mt-2">{error}</div>
              )}
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4">
        {Array.isArray(filteredOrganizations) && filteredOrganizations.map((org) => (
          <div
            key={org.id}
            className="p-4 border rounded-lg shadow-sm flex justify-between items-center bg-white"
          >
            <div className="flex items-center space-x-4">
              {org.logo_filename ? (
                <img
                  src={`${getApiOrigin()}/api/v1/organizations/logo/${org.id}/${org.logo_filename}`}
                  alt={org.name}
                  className="w-12 h-12 rounded object-cover"
                  onError={(e) => {
                    // If logo fails to load, show fallback
                    const target = e.target as HTMLImageElement;
                    target.onerror = null;
                    target.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="12">${org.name.charAt(0)}</text></svg>`;
                  }}
                />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center">
                  <span className="text-2xl font-semibold text-gray-400">
                    {org.name.charAt(0)}
                  </span>
                </div>
              )}
              <div>
                <h3 className="font-semibold">{org.name}</h3>
                {org.description && (
                  <p className="text-sm text-gray-600">{org.description}</p>
                )}
                {org.website && (
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {org.website}
                  </a>
                )}
              </div>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEditOrg(org)}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
