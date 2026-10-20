import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Link2, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useToast } from '@/hooks/use-toast';
import { getApiOrigin } from '@/lib/apiOrigin';
import { extractEmailErrorMessage } from '@/lib/emailError';
import emailAPI from '@/services/emailAPI';
import {
  outreachAPI,
  type ConnectionType,
  type OutreachConnection,
} from '@/services/api/outreach';

function webhookUrl(publicToken: string): string {
  const origin = getApiOrigin() || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/api/v1/outreach/webhooks/${publicToken}`;
}

function parseSpreadsheetId(value: string): string {
  const raw = (value || '').trim();
  const fromPath = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = raw.match(/[?&]id=([a-zA-Z0-9\-_]+)/);
  if (fromQuery) return fromQuery[1];
  return raw;
}

function quoteSheetTitle(title: string): string {
  const raw = (title || 'Sheet1').trim() || 'Sheet1';
  if (/^[A-Za-z0-9_]+$/.test(raw)) return raw;
  return `'${raw.replace(/'/g, "''")}'`;
}

export function OutreachConnectionsPage() {
  const { t } = useTranslation('emails');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<ConnectionType>('google_sheets');
  const [displayName, setDisplayName] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [importRange, setImportRange] = useState('Sheet1!A1:Z500');
  const [importConnectionId, setImportConnectionId] = useState<number | null>(null);
  const [pastedCsv, setPastedCsv] = useState('');
  const [sheetChoice, setSheetChoice] = useState<Record<number, string>>({});
  const [sheetUrl, setSheetUrl] = useState<Record<number, string>>({});
  const [sheetTab, setSheetTab] = useState<Record<number, string>>({});
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['outreach-connections'],
    queryFn: outreachAPI.listConnections,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  const { data: googleStatus } = useQuery({
    queryKey: ['outreach-google-status'],
    queryFn: outreachAPI.googleStatus,
  });

  const { data: sheetsCatalog } = useQuery({
    queryKey: ['outreach-google-spreadsheets'],
    queryFn: outreachAPI.listSpreadsheets,
    enabled: Boolean(googleStatus?.connected),
  });
  const sheetFiles = sheetsCatalog?.files || [];
  const sheetsReady = Boolean(googleStatus?.connected && googleStatus?.has_sheets_scope);
  const focusedConnection =
    connections.find((conn) => conn.id === importConnectionId && conn.type === 'google_sheets') ||
    connections.find((conn) => conn.type === 'google_sheets');
  const focusedSheetId = focusedConnection
    ? parseSpreadsheetId(
        sheetUrl[focusedConnection.id] ||
          sheetChoice[focusedConnection.id] ||
          String(focusedConnection.config?.spreadsheet_id || ''),
      )
    : '';
  const { data: sheetTabsData } = useQuery({
    queryKey: ['outreach-google-sheet-tabs', focusedSheetId],
    queryFn: () => outreachAPI.listSpreadsheetTabs(focusedSheetId),
    enabled: Boolean(sheetsReady && focusedSheetId),
  });
  const sheetTabs = sheetTabsData?.tabs || [];

  useEffect(() => {
    const oauth = searchParams.get('sheets_oauth') || searchParams.get('email_oauth');
    if (!oauth) return;
    if (oauth === 'success') {
      toast({ title: t('connectionsPage.sheetsConnected'), description: t('connectionsPage.sheetsConnectedBody') });
      queryClient.invalidateQueries({ queryKey: ['outreach-connections'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-google-status'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-google-spreadsheets'] });
    } else {
      toast({
        title: t('connectionsPage.googleFailed'),
        description: searchParams.get('reason') || t('connectionsPage.tryAgain'),
        variant: 'destructive',
      });
    }
    setSearchParams({}, { replace: true });
  }, [queryClient, searchParams, setSearchParams, toast, t]);

  const connectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const result = await emailAPI.initGoogleOAuth('/emails/connections');
      window.location.href = result.authorization_url;
    } catch (error) {
      setConnectingGoogle(false);
      toast({
        title: t('connectionsPage.googleStartFailed'),
        description: extractEmailErrorMessage(error).description,
        variant: 'destructive',
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const config: Record<string, unknown> = {};
      if (type === 'google_sheets' && spreadsheetId) {
        config.spreadsheet_id = spreadsheetId.trim();
      }
      if (type === 'gmail_link' && accountId) {
        config.account_id = Number(accountId);
      }
      return outreachAPI.createConnection({
        type,
        display_name: displayName.trim(),
        config: Object.keys(config).length ? config : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-connections'] });
      setShowForm(false);
      setDisplayName('');
      setSpreadsheetId('');
      toast({ title: t('connectionsPage.created') });
    },
    onError: (error: Error) => {
      toast({ title: t('connectionsPage.createFailed'), description: extractEmailErrorMessage(error).description, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => outreachAPI.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-connections'] });
      toast({ title: t('connectionsPage.deleted') });
    },
  });

  const importMutation = useMutation({
    mutationFn: (connection: OutreachConnection) => {
      const savedId = String(connection.config?.spreadsheet_id || '');
      const chosen =
        sheetUrl[connection.id]?.trim() ||
        sheetChoice[connection.id]?.trim() ||
        spreadsheetId.trim() ||
        savedId;
      return outreachAPI.importSheets(connection.id, {
        spreadsheet_id: chosen,
        range: importRange.trim() || undefined,
        pasted_values: importConnectionId === connection.id ? pastedCsv.trim() || undefined : undefined,
      });
    },
    onSuccess: (data) => {
      toast({
        title: t('connectionsPage.importFinished'),
        description: t('connectionsPage.importSummary', { imported: data.imported, skipped: data.skipped }),
      });
      setPastedCsv('');
      queryClient.invalidateQueries({ queryKey: ['outreach-connections'] });
    },
    onError: (error: Error) => {
      toast({ title: t('connectionsPage.importFailed'), description: extractEmailErrorMessage(error).description, variant: 'destructive' });
    },
  });

  const canCreate = Boolean(displayName.trim()) && (type !== 'gmail_link' || accountId);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('connectionsPage.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {t('connectionsPage.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void connectGoogle()} disabled={connectingGoogle}>
            {connectingGoogle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            {sheetsReady ? t('connectionsPage.reconnectSheets') : t('connectionsPage.connectSheets')}
          </Button>
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('connectionsPage.addConnection')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 py-4 text-sm">
          {sheetsReady ? (
            <p>
              {t('connectionsPage.connectedAs')} <span className="font-medium">{googleStatus?.email}</span>.{' '}
              {googleStatus?.can_write_sheets
                ? t('connectionsPage.canWrite')
                : t('connectionsPage.cannotWrite')}{' '}
              {t('connectionsPage.pasteToImport')}
            </p>
          ) : googleStatus?.connected ? (
            <p>
              {t('connectionsPage.noSheetsScope', { email: googleStatus.email })}
            </p>
          ) : (
            <p>
              {t('connectionsPage.notConnected')}
            </p>
          )}
          {sheetsCatalog?.drive_error_code === 'insufficient_scopes' && (
            <p className="text-xs text-amber-700">{sheetsCatalog.drive_error}</p>
          )}
          {sheetsReady && !sheetFiles.length && sheetsCatalog?.drive_error_code !== 'insufficient_scopes' && (
            <p className="text-xs text-gray-500">
              {t('connectionsPage.noPicker')}
            </p>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('connectionsPage.newConnection')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t('connectionsPage.type')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as ConnectionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_sheets">Google Sheets</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="gmail_link">{t('connectionsPage.typeGmailLink')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('connectionsPage.displayName')}</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('connectionsPage.displayNamePlaceholder')}
              />
            </div>

            {type === 'google_sheets' && (
              <>
                <div>
                  <Label>{t('connectionsPage.spreadsheetUrlOptional')}</Label>
                  <Input
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                  />
                </div>
                <div>
                  <Label>{t('connectionsPage.importRangeOptional')}</Label>
                  <Input value={importRange} onChange={(e) => setImportRange(e.target.value)} />
                </div>
              </>
            )}

            {type === 'gmail_link' && (
              <div>
                <Label>{t('connectionsPage.emailAccount')}</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('connectionsPage.chooseMailbox')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.display_name ? `${account.display_name} (${account.email})` : account.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {type === 'webhook' && (
              <p className="text-sm text-gray-600">
                {t('connectionsPage.webhookHint')}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!canCreate || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('connectionsPage.create')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                {t('connectionsPage.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {connections.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              {t('connectionsPage.empty')}
            </CardContent>
          </Card>
        ) : (
          connections.map((conn: OutreachConnection) => {
            const savedSheet = String(conn.config?.spreadsheet_id || '');
            const selected = sheetChoice[conn.id] || savedSheet || (sheetFiles[0]?.id ?? '');
            return (
              <Card key={conn.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">{conn.display_name}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{conn.type}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{conn.status}</span>
                    </div>
                    {conn.type === 'webhook' && conn.public_token && (
                      <div className="text-sm">
                        <span className="text-gray-500">{t('connectionsPage.webhookUrl')} </span>
                        <code className="break-all rounded bg-slate-100 px-1 text-xs">{webhookUrl(conn.public_token)}</code>
                        <button
                          type="button"
                          className="ml-2 text-xs underline"
                          onClick={() => {
                            void navigator.clipboard.writeText(webhookUrl(conn.public_token!));
                            toast({ title: t('connectionsPage.webhookCopied') });
                          }}
                        >
                          {t('connectionsPage.copy')}
                        </button>
                      </div>
                    )}
                    {conn.type === 'google_sheets' && savedSheet && (
                      <p className="text-xs text-gray-500">{t('connectionsPage.sheet', { id: savedSheet })}</p>
                    )}
                    {conn.last_error && (
                      <p className="text-xs text-red-600">{conn.last_error}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {conn.type === 'google_sheets' && (
                      <div className="w-full max-w-md space-y-2">
                        {sheetFiles.length > 0 && (
                          <div>
                            <Label className="text-xs">{t('connectionsPage.spreadsheet')}</Label>
                            <Select
                              value={selected || undefined}
                              onValueChange={(value) => setSheetChoice((prev) => ({ ...prev, [conn.id]: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('connectionsPage.chooseSpreadsheet')} />
                              </SelectTrigger>
                              <SelectContent>
                                {sheetFiles.map((file) => (
                                  <SelectItem key={file.id} value={file.id}>
                                    {file.name || file.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div>
                          <Label className="text-xs">{t('connectionsPage.orPasteUrl')}</Label>
                          <Input
                            value={sheetUrl[conn.id] || ''}
                            onChange={(e) => {
                              setImportConnectionId(conn.id);
                              setSheetUrl((prev) => ({ ...prev, [conn.id]: e.target.value }));
                            }}
                            placeholder="https://docs.google.com/spreadsheets/d/…"
                          />
                        </div>
                        {focusedConnection?.id === conn.id && sheetTabs.length > 0 && (
                          <div>
                            <Label className="text-xs">{t('connectionsPage.tab')}</Label>
                            <Select
                              value={sheetTab[conn.id] || undefined}
                              onValueChange={(value) => {
                                setSheetTab((prev) => ({ ...prev, [conn.id]: value }));
                                setImportRange(`${quoteSheetTitle(value)}!A1:Z500`);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('connectionsPage.chooseTab')} />
                              </SelectTrigger>
                              <SelectContent>
                                {sheetTabs.map((tab) => (
                                  <SelectItem key={`${tab.sheet_id || tab.title}`} value={tab.title}>
                                    {tab.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div>
                          <Label className="text-xs">{t('connectionsPage.range')}</Label>
                          <Input
                            value={importRange}
                            onChange={(e) => setImportRange(e.target.value)}
                            placeholder="Cleaned - Lucas!A1:Z500"
                          />
                        </div>
                        <Label className="text-xs">{t('connectionsPage.orPasteCsv')}</Label>
                        <textarea
                          className="min-h-[72px] w-full rounded-md border p-2 font-mono text-xs"
                          value={importConnectionId === conn.id ? pastedCsv : ''}
                          onChange={(e) => {
                            setImportConnectionId(conn.id);
                            setPastedCsv(e.target.value);
                          }}
                          placeholder={'email,first_name,last_name,company\nada@example.com,Ada,Lovelace,Analytical'}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={importMutation.isPending && importConnectionId === conn.id}
                          onClick={() => {
                            setImportConnectionId(conn.id);
                            importMutation.mutate(conn);
                          }}
                        >
                          <Upload className="mr-1 h-3 w-3" />
                          {t('connectionsPage.importLeads')}
                        </Button>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(t('connectionsPage.confirmDelete'))) deleteMutation.mutate(conn.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

export default OutreachConnectionsPage;
