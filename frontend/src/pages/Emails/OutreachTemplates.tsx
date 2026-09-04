import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/hooks/use-toast';
import { outreachAPI, type OutreachTemplate } from '@/services/api/outreach';

const emptyForm = () => ({
  name: '',
  subject: '',
  body: '',
  format: 'text' as 'text' | 'html',
  ab_subjects: '',
});

export function OutreachTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['outreach-templates'],
    queryFn: outreachAPI.listTemplates,
  });

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (tpl: OutreachTemplate) => {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      format: (tpl.format as 'text' | 'html') || 'text',
      ab_subjects: Array.isArray(tpl.ab_subjects) ? tpl.ab_subjects.join(', ') : '',
    });
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const ab = form.ab_subjects
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        name: form.name.trim(),
        subject: form.subject.trim(),
        body: form.body,
        format: form.format,
        ab_subjects: ab.length ? ab : null,
      };
      return editingId
        ? outreachAPI.updateTemplate(editingId, payload)
        : outreachAPI.createTemplate(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-templates'] });
      toast({ title: editingId ? 'Template updated' : 'Template created' });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => outreachAPI.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-templates'] });
      toast({ title: 'Template deleted' });
    },
  });

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
          <h1 className="text-2xl font-semibold">Outreach Templates</h1>
          <p className="mt-1 text-sm text-gray-600">Reusable subject/body snippets with optional A/B subjects.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New template
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? 'Edit template' : 'New template'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div>
              <Label>Format</Label>
              <Select
                value={form.format}
                onValueChange={(v) => setForm((f) => ({ ...f, format: v as 'text' | 'html' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                className="min-h-[160px] font-mono text-sm"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
            <div>
              <Label>A/B subjects (comma-separated)</Label>
              <Input
                value={form.ab_subjects}
                onChange={(e) => setForm((f) => ({ ...f, ab_subjects: e.target.value }))}
                placeholder="Variant A, Variant B"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!form.name.trim() || !form.subject.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              No templates yet.
            </CardContent>
          </Card>
        ) : (
          templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{tpl.name}</span>
                    <span className="text-xs text-gray-500">{tpl.format}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-gray-600">{tpl.subject}</p>
                  {tpl.ab_subjects && tpl.ab_subjects.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      A/B: {tpl.ab_subjects.join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(tpl)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Delete this template?')) deleteMutation.mutate(tpl.id);
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

export default OutreachTemplatesPage;
