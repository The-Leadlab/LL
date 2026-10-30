import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/hooks/use-toast';
import { outreachAPI, type OutreachTemplate } from '@/services/api/outreach';
import { GenerateBrandedEmailDialog } from '@/pages/Emails/GenerateBrandedEmailDialog';

const emptyForm = () => ({
  name: '',
  subject: '',
  body: '',
  format: 'text' as 'text' | 'html',
  ab_subjects: '',
});

export function OutreachTemplatesPage() {
  const { t } = useTranslation('emails');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [generateOpen, setGenerateOpen] = useState(false);

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
      toast({ title: editingId ? t('templatesPage.updated') : t('templatesPage.created') });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: t('templatesPage.saveFailed'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => outreachAPI.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-templates'] });
      toast({ title: t('templatesPage.deleted') });
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
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('templatesPage.title')}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-300">{t('templatesPage.subtitle')}</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('newTemplate')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? t('templatesPage.editTemplate') : t('newTemplate')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t('templatesPage.name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('subject')}</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('templatesPage.format')}</Label>
              <Select
                value={form.format}
                onValueChange={(v) => setForm((f) => ({ ...f, format: v as 'text' | 'html' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">{t('templatesPage.formatText')}</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('templatesPage.body')}</Label>
              <Textarea
                className="min-h-[160px] font-mono text-sm"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('templatesPage.abSubjects')}</Label>
              <Input
                value={form.ab_subjects}
                onChange={(e) => setForm((f) => ({ ...f, ab_subjects: e.target.value }))}
                placeholder={t('templatesPage.abPlaceholder')}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGenerateOpen(true)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {t('outreach.generateBranded')}
              </Button>
              <Button
                type="button"
                disabled={!form.name.trim() || !form.subject.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('templatesPage.save')}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                {t('templatesPage.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              {t('templatesPage.empty')}
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
                  <p className="mt-1 truncate text-sm text-gray-600 dark:text-neutral-300">{tpl.subject}</p>
                  {tpl.ab_subjects && tpl.ab_subjects.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {t('templatesPage.abLabel', { subjects: tpl.ab_subjects.join(' · ') })}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(tpl)}>
                    {t('templatesPage.edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(t('templatesPage.confirmDelete'))) deleteMutation.mutate(tpl.id);
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

      <GenerateBrandedEmailDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        subjectHint={form.subject}
        onApply={({ subject, html }) => {
          setForm((f) => ({
            ...f,
            subject: subject || f.subject,
            body: html,
            format: 'html',
          }));
          setShowForm(true);
        }}
      />
    </div>
  );
}

export default OutreachTemplatesPage;
