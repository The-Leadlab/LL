import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Trash2, Plus, Mail, Settings, RotateCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/axios';

interface EmailAccount {
  id: number;
  email: string;
  display_name: string;
  provider_type: 'gmail' | 'outlook' | 'yahoo' | 'custom';
  sync_status: 'active' | 'error' | 'disabled' | 'syncing';
  last_sync_at: string;
  sync_error_message?: string;
}

interface EmailProvider {
  id: string;
  name: string;
  domains: string[];
  imap_settings: {
    host: string;
    port: number;
    ssl: boolean;
  };
  smtp_settings: {
    host: string;
    port: number;
    tls: boolean;
  };
}

const EMAIL_PROVIDERS: EmailProvider[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    domains: ['gmail.com'],
    imap_settings: { host: 'imap.gmail.com', port: 993, ssl: true },
    smtp_settings: { host: 'smtp.gmail.com', port: 587, tls: true }
  },
  {
    id: 'outlook',
    name: 'Outlook/Hotmail',
    domains: ['outlook.com', 'hotmail.com', 'live.com'],
    imap_settings: { host: 'outlook.office365.com', port: 993, ssl: true },
    smtp_settings: { host: 'smtp.office365.com', port: 587, tls: true }
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    domains: ['yahoo.com'],
    imap_settings: { host: 'imap.mail.yahoo.com', port: 993, ssl: true },
    smtp_settings: { host: 'smtp.mail.yahoo.com', port: 587, tls: true }
  }
];

export const EmailIntegration: React.FC = () => {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    display_name: '',
    provider_type: 'gmail' as 'gmail' | 'outlook' | 'yahoo' | 'custom',
    custom_imap_host: '',
    custom_imap_port: 993,
    custom_smtp_host: '',
    custom_smtp_port: 465
  });

  useEffect(() => {
    loadEmailAccounts();
  }, []);

  const loadEmailAccounts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/email/accounts');
      setAccounts(response.data);
    } catch (error) {
      console.error('Failed to load email accounts:', error);
      toast({
        title: "Error",
        description: "Failed to load email accounts",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async () => {
    try {
      setLoading(true);
      
      // Auto-detect provider if not custom
      let provider_type = formData.provider_type;
      if (provider_type !== 'custom') {
        const domain = formData.email.split('@')[1]?.toLowerCase();
        const detectedProvider = EMAIL_PROVIDERS.find(p => 
          p.domains.includes(domain)
        );
        if (detectedProvider) {
          provider_type = detectedProvider.id as any;
        }
      }

      const payload = {
        email: formData.email,
        password: formData.password,
        display_name: formData.display_name || formData.email,
        provider_type: provider_type.toLowerCase(),
        custom_settings: provider_type === 'custom' ? {
          imap: {
            imap_host: formData.custom_imap_host,
            imap_port: formData.custom_imap_port,
            imap_use_ssl: true
          },
          smtp: {
            smtp_host: formData.custom_smtp_host,
            smtp_port: formData.custom_smtp_port,
            smtp_use_tls: formData.custom_smtp_port !== 465
          }
        } : null
      };

      await api.post('/email/accounts', payload);

      toast({
        title: "Success",
        description: "Email account connected successfully!"
      });
      setIsAddingAccount(false);
      setFormData({
        email: '',
        password: '',
        display_name: '',
        provider_type: 'gmail',
        custom_imap_host: '',
        custom_imap_port: 993,
        custom_smtp_host: '',
        custom_smtp_port: 465
      });
      loadEmailAccounts();
    } catch (error: any) {
      console.error('Failed to add email account:', error);
      const errorMessage = error.response?.data?.detail || error.message || "Failed to connect email account";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmailOAuth = async () => {
    try {
      setLoading(true);
      const response = await api.post('/email/oauth/google/init');
      const authUrl = response.data?.authorization_url;
      if (!authUrl) throw new Error('Missing authorization URL');
      window.location.href = authUrl;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.detail || "Could not start Gmail OAuth",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccount = async (accountId: number) => {
    if (!confirm('Are you sure you want to remove this email account?')) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/email/accounts/${accountId}`);

      toast({
        title: "Success",
        description: "Email account removed successfully"
      });
      loadEmailAccounts();
    } catch (error) {
      console.error('Failed to remove email account:', error);
      toast({
        title: "Error",
        description: "Failed to remove email account",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAccount = async (accountId: number) => {
    try {
      setLoading(true);
      await api.post(`/email/accounts/${accountId}/sync`);

      toast({
        title: "Success",
        description: "Email sync started successfully"
      });
    } catch (error) {
      console.error('Failed to sync account:', error);
      toast({
        title: "Error", 
        description: "Failed to start email sync",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      loadEmailAccounts();
    }
  };

  const handleSyncCalendar = async (accountId: number) => {
    try {
      setLoading(true);
      await api.post(`/email/accounts/${accountId}/sync-calendar`);

      toast({
        title: "Success",
        description: "Calendar sync completed successfully! Check your Calendar page for imported events."
      });
    } catch (error: any) {
      console.error('Failed to sync calendar:', error);
      const errorMessage = error.response?.data?.detail || "Failed to sync calendar";
      toast({
        title: "Error", 
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      loadEmailAccounts();
    }
  };

  const handleToggleCalendarSync = async (accountId: number, enabled: boolean) => {
    try {
      await api.post(`/email/accounts/${accountId}/calendar-settings`, {
        calendar_sync_enabled: enabled
      });

      toast({
        title: "Success",
        description: `Calendar sync ${enabled ? 'enabled' : 'disabled'} successfully`
      });
      loadEmailAccounts();
    } catch (error) {
      console.error('Failed to update calendar settings:', error);
      toast({
        title: "Error",
        description: "Failed to update calendar settings",
        variant: "destructive"
      });
    }
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'syncing':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getSyncStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'syncing':
        return 'Syncing';
      case 'error':
        return 'Error';
      case 'disabled':
        return 'Disabled';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Email Integration</h3>
          <p className="text-sm text-gray-600">
            Connect your email accounts to sync emails and calendar events. Your existing calendar events will be imported automatically.
          </p>
        </div>
        <Button 
          onClick={() => setIsAddingAccount(true)} 
          className="flex items-center space-x-2"
          disabled={loading}
        >
          <Plus className="h-4 w-4" />
          <span>Add Account</span>
        </Button>
      </div>

      {/* Connected Accounts */}
      <div className="space-y-4">
        {accounts.map((account) => (
          <Card key={account.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Mail className="h-8 w-8 text-blue-500" />
                  <div>
                    <div className="font-medium">{account.display_name}</div>
                    <div className="text-sm text-gray-500">{account.email}</div>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {account.provider_type.toUpperCase()}
                      </Badge>
                      <div className="flex items-center space-x-1">
                        {getSyncStatusIcon(account.sync_status)}
                        <span className="text-xs text-gray-500">
                          {getSyncStatusText(account.sync_status)}
                        </span>
                      </div>
                    </div>
                    {account.last_sync_at && (
                      <div className="text-xs text-gray-400 mt-1">
                        Last sync: {new Date(account.last_sync_at).toLocaleString()}
                      </div>
                    )}
                    {account.sync_error_message && (
                      <div className="text-xs text-red-500 mt-1">
                        Error: {account.sync_error_message}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSyncAccount(account.id)}
                    disabled={loading || account.sync_status === 'syncing'}
                    title="Sync Emails"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSyncCalendar(account.id)}
                    disabled={loading}
                    title="Sync Calendar Events"
                  >
                    📅
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveAccount(account.id)}
                    disabled={loading}
                    title="Remove Account"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {accounts.length === 0 && !loading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No email accounts connected</h4>
              <p className="text-gray-500 mb-4">
                Connect your email account to start syncing emails and creating calendar events automatically.
              </p>
              <Button onClick={() => setIsAddingAccount(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Email Account
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Account Modal */}
      {isAddingAccount && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add Email Account</CardTitle>
              <CardDescription>
                Connect your email account to sync emails and calendar events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <Label htmlFor="password">App Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="App-specific password"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use app-specific password for Gmail/Outlook with 2FA enabled
                </p>
              </div>

              <div>
                <Label htmlFor="display_name">Display Name (Optional)</Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="Your Name"
                />
              </div>

              <div>
                <Label htmlFor="provider">Email Provider</Label>
                <select
                  id="provider"
                  className="w-full p-2 border border-gray-300 rounded-md"
                  value={formData.provider_type}
                  onChange={(e) => setFormData({ ...formData, provider_type: e.target.value as any })}
                >
                  <option value="gmail">Gmail</option>
                  <option value="outlook">Outlook/Hotmail</option>
                  <option value="yahoo">Yahoo Mail</option>
                  <option value="custom">Custom (Other Provider)</option>
                </select>
              </div>

              {formData.provider_type === 'custom' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="imap_host">IMAP Host</Label>
                      <Input
                        id="imap_host"
                        value={formData.custom_imap_host}
                        onChange={(e) => setFormData({ ...formData, custom_imap_host: e.target.value })}
                        placeholder="imap.example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="imap_port">IMAP Port</Label>
                      <Input
                        id="imap_port"
                        type="number"
                        value={formData.custom_imap_port}
                        onChange={(e) => setFormData({ ...formData, custom_imap_port: parseInt(e.target.value) })}
                        placeholder="993"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="smtp_host">SMTP Host</Label>
                      <Input
                        id="smtp_host"
                        value={formData.custom_smtp_host}
                        onChange={(e) => setFormData({ ...formData, custom_smtp_host: e.target.value })}
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="smtp_port">SMTP Port</Label>
                      <Input
                        id="smtp_port"
                        type="number"
                        value={formData.custom_smtp_port}
                        onChange={(e) => setFormData({ ...formData, custom_smtp_port: parseInt(e.target.value) })}
                        placeholder="465"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsAddingAccount(false)}
                  className="flex-1"
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddAccount}
                  className="flex-1"
                  disabled={loading || !formData.email || !formData.password}
                >
                  {loading ? 'Connecting...' : 'Connect Account'}
                </Button>
              </div>
              <div className="pt-3">
                <Button
                  variant="outline"
                  onClick={handleConnectGmailOAuth}
                  className="w-full"
                  disabled={loading}
                >
                  Connect Gmail with Google (OAuth)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}; 