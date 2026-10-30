import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw, Inbox, Send, FileText, AlertCircle, Trash2, Archive, Star, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Label } from '../../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/Select';
import EmailComposeModal from './EmailComposeModal';
import EmailDetailModal from './EmailDetailModal';
import { useNavigate } from 'react-router-dom';
import emailAPI, { EmailMessage } from '../../services/emailAPI';

const FOLDERS = [
  { name: 'inbox', icon: Inbox },
  { name: 'sent', icon: Send },
  { name: 'drafts', icon: FileText },
  { name: 'spam', icon: AlertCircle },
  { name: 'trash', icon: Trash2 },
];

export const EmailsPage: React.FC = () => {
  const { t } = useTranslation('emails');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<{ to: string; subject: string; messageId: string } | undefined>(undefined);
  const [composeForward, setComposeForward] = useState<{ from: string; subject: string; body: string } | undefined>(undefined);
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

  const folderLabel = (name: string) => t(`inboxPage.folders.${name}`);

  const addLabel = () => {
    const label = window.prompt(t('inboxPage.createLabelPrompt'));
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
      <div className="container mx-auto py-6 h-[calc(100vh-4rem)]">
        <div className="flex h-full flex-col gap-4 rounded-lg border border-neutral-200 bg-background p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('inboxPage.loadingAccounts', { defaultValue: 'Loading mailboxes…' })}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[16rem_1fr]">
            <div className="animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
            <div className="animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('inboxPage.addAccountTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-gray-600 dark:text-neutral-300">
              {t('inboxPage.addAccountBody')}
            </p>
            <Button type="button" variant="primary" onClick={() => navigate('/settings/integrations')}>
              {t('inboxPage.openIntegrations')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto h-[calc(100vh-4rem)] py-4 md:py-6">
      <div className="flex h-full flex-col gap-4 md:flex-row md:gap-6">
        {/* Sidebar — stacked on phone, fixed width on desktop */}
        <div className="flex w-full flex-col rounded-lg border border-neutral-200 bg-background shadow-sm dark:border-neutral-700 dark:bg-neutral-900 md:w-64 md:shrink-0">
          <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
            <Button 
              variant="primary"
              onClick={() => setIsComposeOpen(true)} 
              className="w-full justify-start font-medium"
              disabled={!selectedAccount}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('inboxPage.newEmail')}
            </Button>
          </div>

          {/* Account Selector */}
          <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
            <Label className="mb-2 block text-sm font-medium text-gray-700 dark:text-neutral-200">{t('inboxPage.account')}</Label>
            <Select
              value={selectedAccount?.toString()}
              onValueChange={(value) => setSelectedAccount(Number(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('inboxPage.selectAccount')} />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Folders — horizontal chips on phone, vertical list on desktop */}
          <div className="flex-1 p-4">
            <Label className="mb-3 hidden text-sm font-medium text-gray-700 dark:text-neutral-200 md:block">{t('inboxPage.folders.title')}</Label>
            <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:space-y-1 md:overflow-visible md:pb-0">
              {FOLDERS.map((folder) => {
                const Icon = folder.icon;
                return (
                  <button
                    key={folder.name}
                    onClick={() => setSelectedFolder(folder.name)}
                    className={`flex min-h-[44px] shrink-0 items-center space-x-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all md:w-full md:space-x-3 ${
                      selectedFolder === folder.name
                        ? 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border border-neutral-200 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 md:border-transparent'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{folderLabel(folder.name)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <Button variant="outline" size="sm" className="w-full" onClick={addLabel}>
                {t('inboxPage.createLabel')}
              </Button>
              {customLabels.length > 0 && (
                <div className="mt-2 space-y-1">
                  {customLabels.map((label) => (
                    <button
                      key={label}
                      onClick={() => setSelectedFolder(label.toLowerCase())}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                        selectedFolder === label.toLowerCase()
                          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'border-transparent text-gray-700 hover:bg-gray-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
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

        {/* Main Content */}
        <div className="flex flex-1 flex-col rounded-lg border border-neutral-200 bg-background shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-neutral-50">
                {FOLDERS.some(f => f.name === selectedFolder) ? folderLabel(selectedFolder) : selectedFolder.toUpperCase()}
              </h2>
              <div className="flex items-center gap-2">
                {selectedEmail && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => markAsUnreadMutation.mutate(selectedEmail.id)}>
                      {t('inboxPage.markUnread')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => archiveEmailMutation.mutate(selectedEmail.id)}>
                      <Archive className="h-4 w-4 mr-1" />
                      {t('inboxPage.archive')}
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={emailsLoading || isRefreshing}
                  className="text-gray-500 hover:text-gray-700 dark:text-neutral-300 dark:hover:text-neutral-100"
                >
                  <RefreshCw className={`h-4 w-4 ${(emailsLoading || isRefreshing) ? 'animate-spin' : ''}`} />
                  <span className="ml-2">{t('inboxPage.refresh')}</span>
                </Button>
              </div>
            </div>
            {isRefreshing && (
              <div className="border-b border-neutral-200 bg-blue-50/50 px-6 py-2 dark:border-neutral-700 dark:bg-blue-950/30">
                <div className="mb-1 flex items-center justify-between text-xs text-blue-700 dark:text-blue-300">
                  <span>{t('inboxPage.syncInProgress')}</span>
                  <span>{Math.min(100, syncProgress)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/50">
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
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <Inbox className="mb-4 h-12 w-12 text-gray-400 dark:text-neutral-500" />
                <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-neutral-50">{t('noEmails')}</h3>
                <p className="text-sm text-gray-600 dark:text-neutral-300">
                  {t('inboxPage.folderEmpty', { folder: (FOLDERS.some(f => f.name === selectedFolder) ? folderLabel(selectedFolder) : selectedFolder).toLowerCase() })}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-neutral-700">
                {emailsData?.emails?.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => handleEmailClick(email)}
                    className={`cursor-pointer px-6 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800 ${
                      !email.is_read ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60' : ''
                    } ${
                      selectedEmail?.id === email.id ? 'bg-blue-100 dark:bg-blue-950/70' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-800 dark:bg-neutral-700 dark:text-neutral-100">
                        {getSenderInitials(email.from_name, email.from_address)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start justify-between">
                          <p className="truncate pr-2 text-sm font-semibold text-gray-900 dark:text-neutral-50">
                            {email.from_name || email.from_address}
                          </p>
                          <div className="flex flex-shrink-0 items-center space-x-3">
                            <span className="text-xs text-gray-500 dark:text-neutral-400">
                              {formatEmailDate(email.received_date)}
                            </span>
                            {email.is_starred && (
                              <Star className="h-4 w-4 text-yellow-500 fill-current" />
                            )}
                          </div>
                        </div>
                        <p className="mb-1 truncate text-sm font-medium text-gray-900 dark:text-neutral-100">
                          {email.subject || t('inboxPage.noSubject')}
                        </p>
                        <p className="line-clamp-2 text-sm text-gray-600 dark:text-neutral-300">
                          {email.body_text?.substring(0, 150)}...
                        </p>
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