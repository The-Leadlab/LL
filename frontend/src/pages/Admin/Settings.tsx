import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsAPI, OrganizationSettings, EmailSettings, EmailTemplate } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'react-hot-toast';

export function Settings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState('organization');

  // Fetch organization settings
  const { data: orgSettings, isLoading: isOrgLoading } = useQuery({
    queryKey: ['organizationSettings'],
    queryFn: async () => {
      const response = await settingsAPI.getOrganizationSettings();
      return response.data;
    },
  });

  // Fetch email settings
  const { data: emailSettings, isLoading: isEmailLoading } = useQuery({
    queryKey: ['emailSettings'],
    queryFn: async () => {
      const response = await settingsAPI.getEmailSettings();
      return response.data;
    },
  });

  // Fetch email templates
  const { data: emailTemplates = [], isLoading: isTemplatesLoading } = useQuery({
    queryKey: ['emailTemplates'],
    queryFn: async () => {
      const response = await settingsAPI.getEmailTemplates();
      return response.data;
    },
  });

  // Update organization settings
  const updateOrgSettingsMutation = useMutation({
    mutationFn: (data: Partial<OrganizationSettings>) => settingsAPI.updateOrganizationSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizationSettings'] });
      toast.success('Organization settings updated successfully');
    },
    onError: () => {
      toast.error('Failed to update organization settings');
    },
  });

  // Update email settings
  const updateEmailSettingsMutation = useMutation({
    mutationFn: (data: Partial<EmailSettings>) => settingsAPI.updateEmailSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailSettings'] });
      toast.success('Email settings updated successfully');
    },
    onError: () => {
      toast.error('Failed to update email settings');
    },
  });

  // Create email template
  const createEmailTemplateMutation = useMutation({
    mutationFn: (data: Omit<EmailTemplate, 'id'>) => settingsAPI.createEmailTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailTemplates'] });
      toast.success('Email template created successfully');
    },
    onError: () => {
      toast.error('Failed to create email template');
    },
  });

  if (isOrgLoading || isEmailLoading || isTemplatesLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-semibold">Settings</h2>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="templates">Email Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div>
                  <Label>Organization Name</Label>
                  <Input
                    value={orgSettings?.name || ''}
                    onChange={(e) => {
                      updateOrgSettingsMutation.mutate({
                        ...orgSettings,
                        name: e.target.value,
                      });
                    }}
                  />
                </div>

                <div>
                  <Label>Timezone</Label>
                  <Input
                    value={orgSettings?.timezone || ''}
                    onChange={(e) => {
                      updateOrgSettingsMutation.mutate({
                        ...orgSettings,
                        timezone: e.target.value,
                      });
                    }}
                  />
                </div>

                <div>
                  <Label>Currency</Label>
                  <Input
                    value={orgSettings?.currency || ''}
                    onChange={(e) => {
                      updateOrgSettingsMutation.mutate({
                        ...orgSettings,
                        currency: e.target.value,
                      });
                    }}
                  />
                </div>

                <div>
                  <Label>Contact Email</Label>
                  <Input
                    type="email"
                    value={orgSettings?.contact_email || ''}
                    onChange={(e) => {
                      updateOrgSettingsMutation.mutate({
                        ...orgSettings,
                        contact_email: e.target.value,
                      });
                    }}
                  />
                </div>

                <div>
                  <Label>Contact Phone</Label>
                  <Input
                    value={orgSettings?.contact_phone || ''}
                    onChange={(e) => {
                      updateOrgSettingsMutation.mutate({
                        ...orgSettings,
                        contact_phone: e.target.value,
                      });
                    }}
                  />
                </div>

                <div>
                  <Label>Address</Label>
                  <Input
                    value={orgSettings?.address || ''}
                    onChange={(e) => {
                      updateOrgSettingsMutation.mutate({
                        ...orgSettings,
                        address: e.target.value,
                      });
                    }}
                  />
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Email Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div>
                  <Label>SMTP Host</Label>
                  <Input
                    value={emailSettings?.smtp_host || ''}
                    onChange={(e) => {
                      updateEmailSettingsMutation.mutate({
                        ...emailSettings,
                        smtp_host: e.target.value,
                      });
                    }}
                  />
                </div>

                <div>
                  <Label>SMTP Port</Label>
                  <Input
                    type="number"
                    value={emailSettings?.smtp_port || ''}
                    onChange={(e) => {
                      updateEmailSettingsMutation.mutate({
                        ...emailSettings,
                        smtp_port: parseInt(e.target.value),
                      });
                    }}
                  />
                </div>

                <div>
                  <Label>SMTP Username</Label>
                  <Input
                    value={emailSettings?.smtp_username || ''}
                    onChange={(e) => {
                      updateEmailSettingsMutation.mutate({
                        ...emailSettings,
                        smtp_username: e.target.value,
                      });
                    }}
                  />
                </div>

                <div>
                  <Label>SMTP Password</Label>
                  <Input
                    type="password"
                    value={emailSettings?.smtp_password || ''}
                    onChange={(e) => {
                      updateEmailSettingsMutation.mutate({
                        ...emailSettings,
                        smtp_password: e.target.value,
                      });
                    }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={emailSettings?.smtp_use_tls || false}
                    onChange={(e) => {
                      updateEmailSettingsMutation.mutate({
                        ...emailSettings,
                        smtp_use_tls: e.target.checked,
                      });
                    }}
                  />
                  <Label>Use TLS</Label>
                </div>

                <div>
                  <Label>Default From Email</Label>
                  <Input
                    type="email"
                    value={emailSettings?.default_from_email || ''}
                    onChange={(e) => {
                      updateEmailSettingsMutation.mutate({
                        ...emailSettings,
                        default_from_email: e.target.value,
                      });
                    }}
                  />
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Email Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {emailTemplates.map((template: EmailTemplate) => (
                  <div
                    key={template.id}
                    className="border p-4 rounded-lg space-y-2"
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">{template.name}</h3>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          settingsAPI.deleteEmailTemplate(template.id);
                          queryClient.invalidateQueries({ queryKey: ['emailTemplates'] });
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">{template.subject}</p>
                    <p className="text-sm">{template.body}</p>
                  </div>
                ))}

                <Button
                  onClick={() => {
                    createEmailTemplateMutation.mutate({
                      name: 'New Template',
                      subject: 'Subject',
                      body: 'Email body',
                      is_active: true,
                    });
                  }}
                >
                  Add Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 