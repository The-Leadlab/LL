import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataImportAPI, ImportJob } from '@/services/api/data-import';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import {
  FileText, CheckCircle, XCircle, Loader2, Clock,
  TrendingUp, Download, Plus, Database
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const ImportHistory: React.FC = () => {
  const { t } = useTranslation('modules');
  const navigate = useNavigate();

  // Fetch import jobs
  const { data: importJobs, isLoading } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: () => dataImportAPI.getImportJobs()
  });

  // Fetch statistics
  const { data: stats } = useQuery({
    queryKey: ['import-statistics'],
    queryFn: () => dataImportAPI.getStatistics()
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: any; icon: any; label: string; color: string }> = {
      pending: { variant: 'secondary', icon: Clock, label: 'Pending', color: 'bg-gray-100 text-gray-800' },
      processing: { variant: 'default', icon: Loader2, label: 'Processing', color: 'bg-blue-100 text-blue-800' },
      completed: { variant: 'default', icon: CheckCircle, label: 'Completed', color: 'bg-green-100 text-green-800' },
      failed: { variant: 'destructive', icon: XCircle, label: 'Failed', color: 'bg-red-100 text-red-800' },
      cancelled: { variant: 'secondary', icon: XCircle, label: 'Cancelled', color: 'bg-gray-100 text-gray-800' }
    };
    const style = styles[status] || styles.pending;
    const Icon = style.icon;
    return (
      <Badge className={style.color}>
        <Icon className={`h-3 w-3 mr-1 ${status === 'processing' ? 'animate-spin' : ''}`} />
        {t(`dataImport.history.status.${status in styles ? status : 'pending'}`, { defaultValue: style.label })}
      </Badge>
    );
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'csv': return <FileText className="h-5 w-5 text-blue-600" />;
      case 'salesforce': return <Database className="h-5 w-5 text-blue-500" />;
      case 'hubspot': return <Database className="h-5 w-5 text-orange-500" />;
      case 'pipedrive': return <Database className="h-5 w-5 text-green-500" />;
      default: return <FileText className="h-5 w-5 text-gray-600" />;
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('dataImport.history.title')}</h1>
            <p className="text-gray-600 mt-1">
              {t('dataImport.history.subtitle')}
            </p>
          </div>
          <Button onClick={() => navigate('/data-import/wizard')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('dataImport.history.newImport')}
          </Button>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('dataImport.history.totalImports')}</p>
                    <p className="text-2xl font-bold">{stats.total_jobs}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('dataImport.history.completed')}</p>
                    <p className="text-2xl font-bold">{stats.completed_jobs}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('dataImport.history.recordsImported')}</p>
                    <p className="text-2xl font-bold">{stats.total_records_imported}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Import Jobs List */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dataImport.history.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {importJobs && importJobs.length > 0 ? (
              <div className="space-y-4">
                {importJobs.map((job) => (
                  <Card key={job.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-gray-50 rounded-lg">
                          {getSourceIcon(job.source_type)}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">
                              {job.source_name || `${job.source_type} Import`}
                            </h3>
                            {getStatusBadge(job.status)}
                            <Badge variant="outline">
                              {job.entity_type}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-gray-600 mb-3">
                            <div>
                              <span className="font-medium">{t('dataImport.history.totalColon')}</span> {job.total_records}
                            </div>
                            <div className="text-green-600">
                              <span className="font-medium">{t('dataImport.history.successColon')}</span> {job.successful_records}
                            </div>
                            <div className="text-red-600">
                              <span className="font-medium">{t('dataImport.history.failedColon')}</span> {job.failed_records}
                            </div>
                            <div className="text-gray-500">
                              <span className="font-medium">{t('dataImport.history.skippedColon')}</span> {job.skipped_records}
                            </div>
                            <div>
                              <Clock className="h-4 w-4 inline mr-1" />
                              {formatDate(job.created_at)}
                            </div>
                          </div>

                          {job.status === 'processing' && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-gray-600">
                                <span>{t('dataImport.progress')}</span>
                                <span>
                                  {job.processed_records} / {job.total_records}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all"
                                  style={{
                                    width: `${(job.processed_records / job.total_records) * 100}%`
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {job.status === 'completed' && job.import_summary && (
                            <div className="text-sm text-gray-600">
                              {t('dataImport.history.completedOk')}
                            </div>
                          )}

                          {job.status === 'failed' && job.error_log && job.error_log.length > 0 && (
                            <div className="text-sm text-red-600">
                              ✗ {job.error_log[0].message || t('dataImport.history.importFailed')}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/data-import/jobs/${job.id}`)}
                          >
                            {t('dataImport.history.viewDetails')}
                          </Button>
                          {job.status === 'completed' && (
                            <Button variant="outline" size="sm">
                              <Download className="h-4 w-4 mr-1" />
                              {t('dataImport.history.exportReport')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">{t('dataImport.history.emptyTitle')}</h3>
                <p className="text-gray-600 mb-4">
                  {t('dataImport.history.emptyBody')}
                </p>
                <Button onClick={() => navigate('/data-import/wizard')}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('dataImport.history.startFirst')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};

export default ImportHistory;
