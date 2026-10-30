/**
 * Modern Conversation Upload Page
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ArrowLeft, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conversationsAPI } from '@/services/api/conversations';
import { leadsAPI } from '@/services/api/leads';
import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export function ModernConversationUpload() {
  const { t } = useTranslation('messages');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [file, setFile] = React.useState<File | null>(null);
  const [leadId, setLeadId] = React.useState<number | null>(null);

  const { data: leadsData } = useQuery({
    queryKey: ['conversation-upload-leads'],
    queryFn: async () => {
      const res = await leadsAPI.getAll({ limit: 100, sort_by: 'created_at', sort_desc: true });
      return Array.isArray((res as any).data) ? (res as any).data : ((res as any).data?.results || []);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !leadId || !user?.id) throw new Error(t('conv.selectLeadAndFile'));
      // Persist recording row first; URL can be replaced by backend processing later.
      return conversationsAPI.createRecording({
        user_id: user.id,
        lead_id: leadId,
        recording_url: `uploaded://${Date.now()}-${file.name}`,
        duration_seconds: 0,
        call_date: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
      toast.success(t('conv.uploaded'));
      navigate('/conversations');
    },
    onError: () => toast.error(t('conv.uploadFailed')),
  });
  
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/conversations')}
          className="mb-6 flex items-center space-x-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('conv.backToConversations')}</span>
        </button>
        
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
          {t('conv.uploadTitle')}
        </h1>
        
        <div className="bg-white dark:bg-neutral-800 rounded-xl p-8 border border-neutral-200 dark:border-neutral-700">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/20 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
              {t('conv.uploadTitle')}
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6 text-center">
              {t('conv.dragDrop')}
            </p>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              id="file-upload"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <label
              htmlFor="file-upload"
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer transition-colors"
            >
              {t('conv.chooseFile')}
            </label>
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
              {t('conv.supportedFormats')}
            </p>
            <div className="mt-6 w-full max-w-lg space-y-3">
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={leadId ?? ''}
                onChange={(e) => setLeadId(Number(e.target.value) || null)}
              >
                <option value="">{t('conv.selectLead')}</option>
                {(leadsData || []).map((lead: any) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.first_name} {lead.last_name} {lead.company ? `- ${lead.company}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => uploadMutation.mutate()}
                disabled={!file || !leadId || uploadMutation.isPending}
                className="w-full rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {uploadMutation.isPending ? (
                  <span className="inline-flex items-center"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('conv.uploading')}</span>
                ) : (
                  file ? t('conv.uploadFile', { name: file.name }) : t('conv.upload')
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
