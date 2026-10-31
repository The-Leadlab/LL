import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/Card';
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage 
} from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { 
  Building2, 
  Globe, 
  Save, 
  Upload, 
  X, 
  CheckCircle, 
  AlertCircle,
  Calendar,
  Users,
  Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { getApiOrigin } from '@/lib/apiOrigin'
import { organizationsAPI } from '@/services/api';

// Validation schema
const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(255, 'Name is too long'),
  description: z.string().optional(),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  is_active: z.boolean().optional(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

interface Organization {
  id: number;
  name: string;
  description?: string;
  website?: string;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
  logo_filename?: string;
  logo_content_type?: string;
}

export function OrganizationPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      description: '',
      website: '',
      is_active: true,
    }
  });

  // Fetch organization data
  const { data: organization, isLoading, error: fetchError } = useQuery({
    queryKey: ['organization', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) throw new Error('No organization ID');
      const response = await organizationsAPI.get(user.organization_id);
      return response.data;
    },
    enabled: !!user?.organization_id,
  });

  // Update organization mutation
  const updateOrganizationMutation = useMutation({
    mutationFn: async (data: { id: number; formData: FormData }) => {
      const response = await organizationsAPI.update(data.id, data.formData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      toast.success('Organization updated successfully!');
      setIsEditing(false);
      setError(null);
    },
    onError: (error: any) => {
      console.error('Update error:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to update organization';
      setError(errorMessage);
      toast.error(errorMessage);
    },
  });

  // Update form when organization data loads
  useEffect(() => {
    if (organization) {
      form.reset({
        name: organization.name,
        description: organization.description || '',
        website: organization.website || '',
        is_active: organization.is_active,
      });
      
      // Set logo preview if exists
      if (organization.logo_filename) {
        setLogoPreview(`${getApiOrigin()}/api/v1/organizations/logo/${organization.id}/${organization.logo_filename}`);
      }
    }
  }, [organization, form]);

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Logo file size must be less than 5MB');
        return;
      }
      
      setLogoFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const onSubmit = async (data: OrganizationFormData) => {
    if (!organization) return;
    
    try {
      setError(null);
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      if (data.website) formData.append('website', data.website);
      formData.append('is_active', String(data.is_active ?? true));
      
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      
      await updateOrganizationMutation.mutateAsync({
        id: organization.id,
        formData,
      });
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setError(null);
    setLogoFile(null);
    
    // Reset form to original values
    if (organization) {
      form.reset({
        name: organization.name,
        description: organization.description || '',
        website: organization.website || '',
        is_active: organization.is_active,
      });
      
      // Reset logo preview
      if (organization.logo_filename) {
        setLogoPreview(`${getApiOrigin()}/api/v1/organizations/logo/${organization.id}/${organization.logo_filename}`);
      } else {
        setLogoPreview(null);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (fetchError || !organization) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load organization data. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Organization Settings</h1>
          <p className="text-muted-foreground">
            Manage your organization's profile and settings
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)}>
            Edit Organization
          </Button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Information Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Information
            </CardTitle>
            <CardDescription>
              Basic information about your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization Name *</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          disabled={!isEditing}
                          placeholder="Enter organization name"
                        />
                      </FormControl>
                      <FormMessage />
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
                        <Textarea 
                          {...field} 
                          disabled={!isEditing}
                          placeholder="Brief description of your organization"
                          rows={3}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional description that appears in organization listings
                      </FormDescription>
                      <FormMessage />
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
                        <Input 
                          {...field} 
                          disabled={!isEditing}
                          placeholder="https://www.example.com"
                          type="url"
                        />
                      </FormControl>
                      <FormDescription>
                        Your organization's website URL
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Logo Upload Section */}
                {isEditing && (
                  <div className="space-y-2">
                    <FormLabel>Organization Logo</FormLabel>
                    <div className="space-y-2">
                      {logoPreview && (
                        <div className="relative w-24 h-24">
                          <img 
                            src={logoPreview} 
                            alt="Logo preview" 
                            className="w-full h-full object-cover rounded-lg border"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                            onClick={removeLogo}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoChange}
                          className="w-auto"
                        />
                        <Button type="button" variant="outline" size="sm">
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Logo
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Upload an image file (max 5MB). Recommended: 200x200px or larger.
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {isEditing && (
                  <div className="flex gap-2 pt-4">
                    <Button 
                      type="submit" 
                      disabled={updateOrganizationMutation.isPending}
                    >
                      {updateOrganizationMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={cancelEdit}
                      disabled={updateOrganizationMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Status & Info Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={organization.is_active ? "default" : "secondary"}>
                    {organization.is_active ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </Badge>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <div className="flex items-center text-sm">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(organization.created_at).toLocaleDateString()}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Updated</span>
                  <div className="flex items-center text-sm">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(organization.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Logo Display */}
          {!isEditing && organization.logo_filename && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Organization Logo</CardTitle>
              </CardHeader>
              <CardContent>
                <img 
                  src={`${getApiOrigin()}/api/v1/organizations/logo/${organization.id}/${organization.logo_filename}`}
                  alt={organization.name}
                  className="w-full h-32 object-contain rounded-lg border bg-muted/50"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Team Management Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Management
              </CardTitle>
              <CardDescription>
                Manage your organization's team members and invitations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Link to="/team" className="w-full">
                  <Button className="w-full" variant="default">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Team
                  </Button>
                </Link>
                
                <div className="text-xs text-muted-foreground">
                  • Invite new team members
                  • Manage existing members
                  • View invitation status
                  • Set member roles and permissions
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {organization.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={organization.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Visit Website
                    </a>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Organization ID: {organization.id}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default OrganizationPage; 