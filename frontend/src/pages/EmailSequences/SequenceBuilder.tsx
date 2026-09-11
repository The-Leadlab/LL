import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { emailSequencesAPI, type SequenceStep } from '@/services/api/email-sequences';
import emailAPI from '@/services/emailAPI';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Loader2, Plus, Trash2 } from 'lucide-react';

const emptyStep = (step = 1): SequenceStep => ({ step, delay_days: 0, subject: '', body: '' });

export function SequenceBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editingId = id ? Number(id) : null;
  const isEdit = Number.isFinite(editingId) && (editingId as number) > 0;

  const { data, isLoading } = useQuery({
    queryKey: ['email-sequence', editingId],
    queryFn: () => emailSequencesAPI.getById(editingId as number),
    enabled: isEdit,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [steps, setSteps] = useState<SequenceStep[]>([emptyStep(1)]);

  useEffect(() => {
    if (!data) return;
    setName(data.name || '');
    setDescription(data.description || '');
    setIsActive(Boolean(data.is_active));
    setAccountId(data.email_account_id ? String(data.email_account_id) : '');
    setSteps(data.steps?.length ? data.steps : [emptyStep(1)]);
  }, [data]);

  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId(String(accounts[0].id));
    }
  }, [accounts, accountId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        is_active: isActive,
        email_account_id: accountId ? Number(accountId) : null,
        steps: steps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
      return isEdit ? emailSequencesAPI.update(editingId as number, payload) : emailSequencesAPI.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-sequences'] });
      navigate('/email-sequences');
    },
  });

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">{isEdit ? 'Edit Campaign' : 'Campaign'}</h1>
      <Card><CardContent className="p-4 space-y-4">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sequence name" />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        </div>
        <div>
          <Label>Send from mailbox</Label>
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
          <p className="mt-1 text-xs text-gray-500">Required for the outreach worker to send sequence steps.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </CardContent></Card>

      <div className="space-y-3">
        {steps.map((s, i) => (
          <Card key={i}><CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Step {i + 1}</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
            <div>
              <Label>Delay (days after previous step)</Label>
              <Input type="number" value={s.delay_days} onChange={(e) => setSteps(steps.map((x, idx) => idx === i ? { ...x, delay_days: Number(e.target.value) || 0 } : x))} />
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={s.subject} onChange={(e) => setSteps(steps.map((x, idx) => idx === i ? { ...x, subject: e.target.value } : x))} />
            </div>
            <div>
              <Label>Body</Label>
              <textarea className="w-full min-h-[120px] rounded-md border p-2" value={s.body} onChange={(e) => setSteps(steps.map((x, idx) => idx === i ? { ...x, body: e.target.value } : x))} />
            </div>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setSteps([...steps, emptyStep(steps.length + 1)])}>
          <Plus className="h-4 w-4 mr-2" /> Add step
        </Button>
        <Button type="button" onClick={() => saveMutation.mutate()} disabled={!name.trim() || !accountId || saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save sequence
        </Button>
      </div>
    </div>
  );
}
