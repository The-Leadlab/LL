import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useToast } from '@/hooks/use-toast';
import emailAPI from '@/services/emailAPI';
import {
  outreachAPI,
  type ConnectionType,
  type OutreachConnection,
} from '@/services/api/outreach';

function webhookUrl(publicToken: string): string {
  return `/api/v1/outreach/webhooks/${publicToken}`;
}

export function OutreachConnectionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<ConnectionType>('google_sheets');
  const [displayName, setDisplayName] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [importRange, setImportRange] = useState('Sheet1!A:Z');
  const [importConnectionId, setImportConnectionId] = useState<number | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['outreach-connections'],
    queryFn: outreachAPI.listConnections,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

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
        access_token: type === 'google_sheets' && accessToken ? accessToken.trim() : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-connections'] });
      setShowForm(false);
      setDisplayName('');
      setSpreadsheetId('');
      setAccessToken('');
      toast({ title: 'Connection created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create connection', description: error.message, variant: 'destructive' });
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
    mutationFn: (connectionId: number) =>
      outreachAPI.importSheets(connectionId, {
        spreadsheet_id: spreadsheetId.trim(),
        range: importRange.trim() || undefined,
      }),
    onSuccess: (data) => {
      toast({
        title: 'Import preview',
        description: typeof data === 'object' ? JSON.stringify(data).slice(0, 200) : 'Import started',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
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
          <h1 className="text-2xl font-semibold">Outreach Connections</h1>
          <p className="mt-1 text-sm text-gray-600">
            Connect Google Sheets, webhooks, Gmail mailboxes, or AI providers for scenario triggers.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          Add connection
        </Button>
      </div>

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
                  <Label>Spreadsheet ID</Label>
                  <Input
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                  />
                </div>
                <div>
                  <Label>Access token (dev only)</Label>
                  <Input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Paste service account or OAuth token for testing"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    OAuth coming — paste a service token for test imports until OAuth is wired.
                  </p>
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
              No connections yet. Add one to sync leads or receive webhook enrollments.
            </CardContent>
          </Card>
        ) : (
          connections.map((conn: OutreachConnection) => (
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
                      <code className="rounded bg-slate-100 px-1 text-xs">{webhookUrl(conn.public_token)}</code>
                    </div>
                  )}
                  {conn.type === 'google_sheets' && conn.config?.spreadsheet_id && (
                    <p className="text-xs text-gray-500">Sheet: {String(conn.config.spreadsheet_id)}</p>
                  )}
                  {conn.last_error && (
                    <p className="text-xs text-red-600">{conn.last_error}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {conn.type === 'google_sheets' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={importMutation.isPending && importConnectionId === conn.id}
                      onClick={() => {
                        setImportConnectionId(conn.id);
                        const sheetId = String(conn.config?.spreadsheet_id || spreadsheetId || '');
                        if (!sheetId) {
                          toast({
                            title: 'Missing spreadsheet ID',
                            description: 'Set spreadsheet_id on the connection or in the form.',
                            variant: 'destructive',
                          });
                          return;
                        }
                        setSpreadsheetId(sheetId);
                        importMutation.mutate(conn.id);
                      }}
                    >
                      <Upload className="mr-1 h-3 w-3" />
                      Import leads preview
                    </Button>
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
          ))
        )}
      </div>
    </div>
  );
}

export default OutreachConnectionsPage;
