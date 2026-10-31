import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsAPI } from '@/services/api/conversations';
import { leadsAPI } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PageContainer } from '@/components/ui/PageContainer';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export const RecordingDetail: React.FC = () => {
  const { t } = useTranslation('messages');
  const { id } = useParams<{ id: string }>();
  const recordingId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recording, isLoading } = useQuery({
    queryKey: ['call-recording', recordingId],
    queryFn: () => conversationsAPI.getRecording(recordingId),
    enabled: Number.isFinite(recordingId) && recordingId > 0,
  });

  const { data: leadsResponse } = useQuery({
    queryKey: ['leads-for-recordings-detail'],
    queryFn: () => leadsAPI.getAll({ limit: 500 }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => conversationsAPI.deleteRecording(recordingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
      toast.success(t('conv.deleted'));
      navigate('/conversations');
    },
    onError: () => {
      toast.error(t('conv.deleteFailed'));
    },
  });

  if (!Number.isFinite(recordingId) || recordingId <= 0) {
    navigate('/conversations', { replace: true });
    return null;
  }

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </PageContainer>
    );
  }

  if (!recording) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Button variant="outline" onClick={() => navigate('/conversations')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('conv.back')}
          </Button>
          <p className="text-red-600">{t('conv.notFound')}</p>
        </div>
      </PageContainer>
    );
  }

  const lead = (leadsResponse?.data?.results || []).find((item) => item.id === recording.lead_id);
  const leadName =
    recording.lead_name ||
    (lead ? `${lead.first_name} ${lead.last_name}`.trim() : t('conv.leadN', { id: recording.lead_id }));

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/conversations')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('conv.back')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm(t('conv.confirmDelete'))) {
                deleteMutation.mutate();
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('conv.delete')}
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <h1 className="text-2xl font-bold">{t('conv.callRecordingN', { id: recording.id })}</h1>
            <p className="text-sm text-muted-foreground">{t('conv.leadLabel', { name: leadName })}</p>
            <p className="text-sm text-muted-foreground">{t('conv.callDate', { date: formatDate(recording.call_date) })}</p>
            <p className="text-sm text-muted-foreground">{t('conv.duration', { minutes: Math.floor(recording.duration_seconds / 60), seconds: recording.duration_seconds % 60 })}</p>

            <audio controls className="w-full">
              <source src={recording.recording_url} />
              {t('conv.noAudio')}
            </audio>

            {recording.transcript && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <h2 className="font-semibold mb-2">{t('conv.transcript')}</h2>
                <p className="text-sm whitespace-pre-wrap">{recording.transcript}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};

export default RecordingDetail;
