import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, RefreshCw, Mail, Inbox, Send, FileText, AlertCircle, Trash2, Archive, Star, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Label } from '../../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/Select';
import EmailComposeModal from './EmailComposeModal';
import EmailDetailModal from './EmailDetailModal';
import { useNavigate } from 'react-router-dom';
import emailAPI, { EmailMessage, EmailAccount } from '../../services/emailAPI';

const FOLDERS = [
  { name: 'inbox', label: 'Inbox', icon: Inbox },
  { name: 'sent', label: 'Sent', icon: Send },
  { name: 'drafts', label: 'Drafts', icon: FileText },
  { name: 'spam', label: 'Spam', icon: AlertCircle },
  { name: 'trash', label: 'Trash', icon: Trash2 },
];

export const EmailsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<{ to: string; subject: string; messageId: string } | undefined>(undefined);
  const [composeForward, setComposeForward] = useState<{ from: string; subject: string; body: string } | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch email accounts
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  // Fetch emails for selected account and folder
  const { data: emailsData, isLoading: emailsLoading, refetch: refetchEmails } = useQuery({
    queryKey: ['emails', selectedAccount, selectedFolder],
    queryFn: () => selectedAccount ? emailAPI.getEmails(selectedAccount, selectedFolder) : Promise.resolve({ emails: [], total: 0, page: 1, total_pages: 1 }),
    enabled: !!selectedAccount,
  });

  // Mutations
  const markAsReadMutation = useMutation({
    mutationFn: ({ emailId }: { accountId: number; emailId: number }) =>
      emailAPI.markAsRead(emailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccount, selectedFolder] });
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: ({ emailId }: { accountId: number; emailId: number }) =>
      emailAPI.deleteEmail(emailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccount, selectedFolder] });
      setSelectedEmail(null);
    },
  });

  const markAsUnreadMutation = useMutation({
    mutationFn: (emailId: number) => emailAPI.markAsUnread(emailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccount, selectedFolder] });
    },
  });

  const archiveEmailMutation = useMutation({
    mutationFn: (emailId: number) => emailAPI.archiveEmail(emailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccount, selectedFolder] });
      setSelectedEmail(null);
    },
  });

  const toggleStarMutation = useMutation({
    mutationFn: ({ emailId }: { accountId: number; emailId: number }) =>
      emailAPI.toggleStar(emailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccount, selectedFolder] });
    },
  });

  const syncCalendarMutation = useMutation({
    mutationFn: (accountId: number) => emailAPI.syncCalendar(accountId),
    onSuccess: () => {
      // Show success message
    },
  });

  const syncAccountMutation = useMutation({
    mutationFn: (accountId: number) => emailAPI.syncAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccount, selectedFolder] });
      refetchEmails();
      setSyncProgress(100);
      window.setTimeout(() => {
        setIsRefreshing(false);
        setSyncProgress(0);
      }, 500);
    },
    onError: () => {
      setIsRefreshing(false);
      setSyncProgress(0);
    },
  });

  // Set first account as selected when accounts load
  useEffect(() => {
    if (accounts && accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0].id);
    }
  }, [accounts, selectedAccount]);

  useEffect(() => {
    const raw = localStorage.getItem('email-custom-labels');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setCustomLabels(parsed.filter((x) => typeof x === 'string'));
    } catch {
      // ignore
    }
  }, []);

  const addLabel = () => {
    const label = window.prompt('Create new label');
    if (!label) return;
    const normalized = label.trim().toUpperCase();
    if (!normalized) return;
    if (FOLDERS.some((f) => f.name.toUpperCase() === normalized) || customLabels.includes(normalized)) return;
    const next = [...customLabels, normalized];
    setCustomLabels(next);
    localStorage.setItem('email-custom-labels', JSON.stringify(next));
  };

  const handleEmailClick = (email: EmailMessage) => {
    setSelectedEmail(email);
    if (!email.is_read && selectedAccount) {
      markAsReadMutation.mutate({ accountId: selectedAccount, emailId: email.id });
    }
  };

  const handleRefresh = () => {
    if (!selectedAccount || isRefreshing) return;
    setIsRefreshing(true);
    setSyncProgress(8);
    const step = window.setInterval(() => {
      setSyncProgress((prev) => (prev >= 92 ? prev : prev + 8));
    }, 450);
    syncAccountMutation.mutate(selectedAccount, {
      onSettled: () => window.clearInterval(step),
    });
  };

  const parseRecipients = (value?: string): string[] =>
    (value || '')
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean);

  const openComposeForAction = (email: EmailMessage, action: 'reply' | 'reply-all' | 'forward') => {
    setComposeForward(undefined);
    setComposeReplyTo(undefined);
    if (action === 'forward') {
      setComposeForward({
        from: email.from_name || email.from_address,
        subject: email.subject || '',
        body: email.body_text || '',
      });
    } else {
      if (action === 'reply') {
        setComposeReplyTo({
          to: email.from_address,
          subject: email.subject || '',
          messageId: String(email.id),
        });
      } else {
        const currentAccountEmail = (accounts || []).find((a) => a.id === selectedAccount)?.email?.toLowerCase();
        const recipients = Array.from(
          new Set([email.from_address, ...parseRecipients(email.to_address)])
        ).filter((addr) => addr.toLowerCase() !== currentAccountEmail);
        setComposeReplyTo({
          to: recipients.join(', '),
          subject: email.subject || '',
          messageId: String(email.id),
        });
      }
    }
    setIsComposeOpen(true);
  };

  useEffect(() => {
    if (!selectedAccount) return;
    syncAccountMutation.mutate(selectedAccount);
    const interval = window.setInterval(() => {
      syncAccountMutation.mutate(selectedAccount);
    }, 60000);
    return () => window.clearInterval(interval);
  }, [selectedAccount]);

  const formatEmailDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'dd MMM yyyy, HH:mm');
  };

  const getSenderInitials = (name: string, email: string) => {
    const displayName = name || email;
    return displayName.charAt(0).toUpperCase();
  };

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Add Email Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              Connect your mailbox under Settings → Integrations (SMTP / Gmail app password). Stay there until the
              connection succeeds—then return here for Inbox and Sent.
            </p>
            <Button type="button" onClick={() => navigate('/settings/integrations')}>
              Open Integrations
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 h-[calc(100vh-4rem)]">
      <div className="flex h-full gap-6">
        {/* Sidebar */}
        <div className="w-64 bg-white rounded-lg shadow-sm border flex flex-col">
          <div className="p-4 border-b">
            <Button 
              onClick={() => setIsComposeOpen(true)} 
              className="w-full justify-start font-medium"
              disabled={!selectedAccount}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Email
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full justify-start font-medium"
              onClick={() => navigate('/emails/outreach')}
            >
              <Send className="h-4 w-4 mr-2" />
              Cold Outreach
            </Button>
          </div>

          {/* Account Selector */}
          <div className="p-4 border-b">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Account</Label>
            <Select
              value={selectedAccount?.toString()}
              onValueChange={(value) => setSelectedAccount(Number(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Folders */}
          <div className="p-4 flex-1">
            <Label className="text-sm font-medium text-gray-700 mb-3 block">Folders</Label>
            <div className="space-y-1">
              {FOLDERS.map((folder) => {
                const Icon = folder.icon;
                return (
                  <button
                    key={folder.name}
                    onClick={() => setSelectedFolder(folder.name)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      selectedFolder === folder.name
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'hover:bg-gray-100 text-gray-700 border border-transparent'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{folder.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border flex flex-col">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {FOLDERS.find(f => f.name === selectedFolder)?.label}
              </h2>
              <div className="flex items-center gap-2">
                {selectedEmail && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => markAsUnreadMutation.mutate(selectedEmail.id)}>
                      Mark unread
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => archiveEmailMutation.mutate(selectedEmail.id)}>
                      <Archive className="h-4 w-4 mr-1" />
                      Archive
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={emailsLoading || isRefreshing}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <RefreshCw className={`h-4 w-4 ${(emailsLoading || isRefreshing) ? 'animate-spin' : ''}`} />
                  <span className="ml-2">Actualiser</span>
                </Button>
              </div>
            </div>
            {isRefreshing && (
              <div className="px-6 py-2 border-b bg-blue-50/50">
                <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
                  <span>Sync in progress</span>
                  <span>{Math.min(100, syncProgress)}%</span>
                </div>
                <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${Math.min(100, syncProgress)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
            {emailsLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : emailsData?.emails?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Inbox className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No emails</h3>
                <p className="text-sm text-gray-600">
                  Your {FOLDERS.find(f => f.name === selectedFolder)?.label.toLowerCase()} folder is empty.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {emailsData?.emails?.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => handleEmailClick(email)}
                    className={`px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !email.is_read ? 'bg-blue-50 hover:bg-blue-100' : ''
                    } ${
                      selectedEmail?.id === email.id ? 'bg-blue-100' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-4">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {getSenderInitials(email.from_name, email.from_address)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-semibold text-gray-900 truncate pr-2">
                            {email.from_name || email.from_address}
                          </p>
                          <div className="flex items-center space-x-3 flex-shrink-0">
                            <span className="text-xs text-gray-500">
                              {formatEmailDate(email.received_date)}
                            </span>
                            {email.is_starred && (
                              <Star className="h-4 w-4 text-yellow-500 fill-current" />
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate mb-1">
                          {email.subject || '(No Subject)'}
                        </p>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {email.body_text?.substring(0, 150)}...
                        </p>
            </div>
            <div className="mt-4">
              <Button variant="outline" size="sm" className="w-full" onClick={addLabel}>
                Create label
              </Button>
              {customLabels.length > 0 && (
                <div className="mt-2 space-y-1">
                  {customLabels.map((label) => (
                    <button
                      key={label}
                      onClick={() => setSelectedFolder(label.toLowerCase())}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                        selectedFolder === label.toLowerCase() ? 'bg-blue-50 text-blue-700 border-blue-200' : 'hover:bg-gray-100 border-transparent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isComposeOpen && selectedAccount && (
        <EmailComposeModal
          isOpen={isComposeOpen}
          onClose={() => setIsComposeOpen(false)}
          accountId={selectedAccount.toString()}
          replyTo={composeReplyTo}
          forward={composeForward}
          onEmailSent={() => {
            refetchEmails();
            setIsComposeOpen(false);
            setComposeReplyTo(undefined);
            setComposeForward(undefined);
          }}
        />
      )}

      {selectedEmail && selectedAccount && (
        <EmailDetailModal
          email={selectedEmail}
          isOpen={!!selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onArchive={(emailId) => archiveEmailMutation.mutate(emailId)}
          onMarkUnread={(emailId) => markAsUnreadMutation.mutate(emailId)}
          onDelete={(emailId) => {
            deleteEmailMutation.mutate({ accountId: selectedAccount, emailId });
          }}
          onReply={(email, action) => openComposeForAction(email, action)}
        />
      )}
    </div>
  );
};