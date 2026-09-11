import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
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

export function OutreachConnectionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<ConnectionType>('google_sheets');
  const [displayName, setDisplayName] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [importRange, setImportRange] = useState('Sheet1!A:Z');
  const [importConnectionId, setImportConnectionId] = useState<number | null>(null);
  const [pastedCsv, setPastedCsv] = useState('');
  const [sheetChoice, setSheetChoice] = useState<Record<number, string>>({});
  const [sheetUrl, setSheetUrl] = useState<Record<number, string>>({});
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

  useEffect(() => {
    const oauth = searchParams.get('sheets_oauth') || searchParams.get('email_oauth');
    if (!oauth) return;
    if (oauth === 'success') {
      toast({ title: 'Google Sheets connected', description: 'Pick a spreadsheet and import leads.' });
      queryClient.invalidateQueries({ queryKey: ['outreach-connections'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-google-status'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-google-spreadsheets'] });
    } else {
      toast({
        title: 'Google connection failed',
        description: searchParams.get('reason') || 'Please try again.',
        variant: 'destructive',
      });
    }
    setSearchParams({}, { replace: true });
  }, [queryClient, searchParams, setSearchParams, toast]);

  const connectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const result = await emailAPI.initGoogleOAuth('/emails/connections');
      window.location.href = result.authorization_url;
    } catch (error) {
      setConnectingGoogle(false);
      toast({
        title: 'Could not start Google sign-in',
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
      toast({ title: 'Connection created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create connection', description: extractEmailErrorMessage(error).description, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => outreachAPI.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-connections'] });
      toast({ title: 'Connection deleted' });
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
        title: 'Import finished',
        description: `Imported ${data.imported}, skipped ${data.skipped}.`,
      });
      setPastedCsv('');
      queryClient.invalidateQueries({ queryKey: ['outreach-connections'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Import failed', description: extractEmailErrorMessage(error).description, variant: 'destructive' });
    },
  });

  const canCreate = Boolean(displayName.trim()) && (type !== 'gmail_link' || accountId);
  const sheetsReady = Boolean(googleStatus?.connected && googleStatus?.has_sheets_scope);
  const sheetFiles = sheetsCatalog?.files || [];

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
          <h1 className="text-2xl font-semibold">Outreach Connections</h1>
          <p className="mt-1 text-sm text-gray-600">
            Connect Google Sheets without pasting keys, then import leads into Cold Outreach.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void connectGoogle()} disabled={connectingGoogle}>
            {connectingGoogle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            {sheetsReady ? 'Reconnect Google Sheets' : 'Connect Google Sheets'}
          </Button>
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            Add connection
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 py-4 text-sm">
          {sheetsReady ? (
            <p>
              Google Sheets is connected as <span className="font-medium">{googleStatus?.email}</span>. Pick a
              spreadsheet on a connection below, or paste a Sheets URL.
            </p>
          ) : googleStatus?.connected ? (
            <p>
              You are signed in as {googleStatus.email}, but Sheets access is not granted yet. Click Connect Google
              Sheets once — existing logins need this extra permission.
            </p>
          ) : (
            <p>
              Connect Google Sheets to list your spreadsheets and import rows. You can still paste a spreadsheet URL
              after connecting.
            </p>
          )}
          {sheetsCatalog?.drive_error && (
            <p className="text-xs text-amber-700">{sheetsCatalog.drive_error}</p>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ConnectionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_sheets">Google Sheets</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="gmail_link">Gmail link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Display name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My sheet connection"
              />
            </div>

            {type === 'google_sheets' && (
              <>
                <div>
                  <Label>Spreadsheet URL or ID (optional)</Label>
                  <Input
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                  />
                </div>
                <div>
                  <Label>Import range (optional)</Label>
                  <Input value={importRange} onChange={(e) => setImportRange(e.target.value)} />
                </div>
              </>
            )}

            {type === 'gmail_link' && (
              <div>
                <Label>Email account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose mailbox" />
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
                After creation, copy the public webhook URL from the connection card.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!canCreate || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {connections.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              No connections yet. Connect Google Sheets or add a webhook.
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
                        <span className="text-gray-500">Webhook URL: </span>
                        <code className="break-all rounded bg-slate-100 px-1 text-xs">{webhookUrl(conn.public_token)}</code>
                        <button
                          type="button"
                          className="ml-2 text-xs underline"
                          onClick={() => {
                            void navigator.clipboard.writeText(webhookUrl(conn.public_token!));
                            toast({ title: 'Webhook URL copied' });
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    {conn.type === 'google_sheets' && savedSheet && (
                      <p className="text-xs text-gray-500">Sheet: {savedSheet}</p>
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
                            <Label className="text-xs">Spreadsheet</Label>
                            <Select
                              value={selected || undefined}
                              onValueChange={(value) => setSheetChoice((prev) => ({ ...prev, [conn.id]: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a spreadsheet" />
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
                          <Label className="text-xs">Or paste a Sheets URL</Label>
                          <Input
                            value={sheetUrl[conn.id] || ''}
                            onChange={(e) => setSheetUrl((prev) => ({ ...prev, [conn.id]: e.target.value }))}
                            placeholder="https://docs.google.com/spreadsheets/d/…"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Range</Label>
                          <Input value={importRange} onChange={(e) => setImportRange(e.target.value)} />
                        </div>
                        <Label className="text-xs">Or paste CSV (email, first_name, last_name, company)</Label>
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
                          Import leads
                        </Button>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('Delete this connection?')) deleteMutation.mutate(conn.id);
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
