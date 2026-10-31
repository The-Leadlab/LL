import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataImportAPI, CSVPreview, ImportJob } from '@/services/api/data-import';
import { clientsAPI } from '@/services/api/clients';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useToast } from '@/hooks/use-toast';
import {
  Upload, FileText, Database, CheckCircle, ArrowRight, ArrowLeft,
  Loader2, AlertCircle, Download
} from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
type Step = 'upload' | 'preview' | 'mapping' | 'options' | 'importing';

export const ImportWizard: React.FC = () => {
  const { t } = useTranslation('modules');
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [entityType, setEntityType] = useState<string>('leads');
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importOptions, setImportOptions] = useState({
    hasHeader: true,
    delimiter: ',',
    encoding: 'utf-8',
    deduplicate: true,
    updateExisting: false,
    clientId: null as number | null,
  });
  const [importJob, setImportJob] = useState<ImportJob | null>(null);

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsAPI.list(false),
  });
  const activeClients = clientsData?.items ?? [];

  useEffect(() => {
    if (importOptions.clientId != null || activeClients.length === 0) return;
    const general = activeClients.find((c) => c.is_default) ?? activeClients[0];
    setImportOptions((prev) => ({ ...prev, clientId: general.id }));
  }, [activeClients, importOptions.clientId]);

  // Upload for preview mutation
  const previewMutation = useMutation({
    mutationFn: (file: File) =>
      dataImportAPI.uploadCSVForPreview(
        file,
        importOptions.hasHeader,
        importOptions.delimiter,
        importOptions.encoding
      ),
    onSuccess: (data) => {
      setPreview(data);
      setFieldMapping(data.detected_fields);
      setCurrentStep('preview');
      toast({
        title: t('dataImport.toast.previewLoaded'),
        description: t('dataImport.toast.foundRecords', { count: data.total_rows })
      });
    },
    onError: () => {
      toast({
        title: t('dataImport.toast.error'),
        description: t('dataImport.toast.previewFailed'),
        variant: 'destructive'
      });
    }
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error('No file selected');
      return dataImportAPI.importCSV(
        selectedFile,
        entityType,
        fieldMapping,
        importOptions.hasHeader,
        importOptions.delimiter,
        importOptions.encoding,
        importOptions.deduplicate,
        importOptions.updateExisting
      );
    },
    onSuccess: (job) => {
      setImportJob(job);
      setCurrentStep('importing');
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
      toast({
        title: t('dataImport.toast.importStarted'),
        description: t('dataImport.toast.importStartedBody')
      });
    },
    onError: () => {
      toast({
        title: t('dataImport.toast.error'),
        description: t('dataImport.toast.startFailed'),
        variant: 'destructive'
      });
    }
  });

  // Poll for import progress
  const { data: progress } = useQuery({
    queryKey: ['import-progress', importJob?.id],
    queryFn: () => dataImportAPI.getImportProgress(importJob!.id),
    enabled: !!importJob && currentStep === 'importing',
    refetchInterval: 2000  // Poll every 2 seconds
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({
          title: t('dataImport.toast.invalidFile'),
          description: t('dataImport.toast.selectCsv'),
          variant: 'destructive'
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handlePreview = () => {
    if (!selectedFile) return;
    previewMutation.mutate(selectedFile);
  };

  const handleStartImport = () => {
    importMutation.mutate();
  };

  const renderUploadStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {t('dataImport.uploadTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="entity-type">{t('dataImport.importTo')}</Label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="leads">{t('dataImport.entities.leads')}</SelectItem>
              <SelectItem value="contacts">{t('dataImport.entities.contacts')}</SelectItem>
              <SelectItem value="deals">{t('dataImport.entities.deals')}</SelectItem>
              <SelectItem value="accounts">{t('dataImport.entities.accounts')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="file-upload">{t('dataImport.csvFile')}</Label>
          <div className="mt-2">
            <Input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
            />
          </div>
          {selectedFile && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{selectedFile.name}</span>
              <span>({(selectedFile.size / 1024).toFixed(2)} KB)</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="has-header"
              checked={importOptions.hasHeader}
              onChange={(e) => setImportOptions({ ...importOptions, hasHeader: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="has-header" className="cursor-pointer">{t('dataImport.hasHeader')}</Label>
          </div>
          <div>
            <Label htmlFor="delimiter">{t('dataImport.delimiter')}</Label>
            <Input
              id="delimiter"
              value={importOptions.delimiter}
              onChange={(e) => setImportOptions({ ...importOptions, delimiter: e.target.value })}
              maxLength={1}
            />
          </div>
          <div>
            <Label htmlFor="encoding">{t('dataImport.encoding')}</Label>
            <Select
              value={importOptions.encoding}
              onValueChange={(value) => setImportOptions({ ...importOptions, encoding: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utf-8">UTF-8</SelectItem>
                <SelectItem value="latin1">Latin-1</SelectItem>
                <SelectItem value="windows-1252">Windows-1252</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={handlePreview}
          disabled={!selectedFile || previewMutation.isPending}
          className="w-full"
        >
          {previewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t('dataImport.previewContinue')}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );

  const renderPreviewStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('dataImport.previewTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('dataImport.totalRows')} <span className="font-semibold">{preview?.total_rows}</span>
          </span>
          <span className="text-sm text-muted-foreground">
            {t('dataImport.showingFirst')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-muted/50">
              <tr>
                {preview?.headers.map((header, idx) => (
                  <th key={idx} className="px-4 py-2 text-left text-sm font-semibold border-b">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview?.sample_rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b hover:bg-muted">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-4 py-2 text-sm">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCurrentStep('upload')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('dataImport.back')}
          </Button>
          <Button onClick={() => setCurrentStep('mapping')} className="flex-1">
            {t('dataImport.configureMapping')}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderMappingStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          {t('dataImport.mappingTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('dataImport.mappingHelp', { entity: t(`dataImport.entities.${entityType}`, { defaultValue: entityType }) })}
        </p>

        <div className="space-y-3">
          {preview?.headers.map((header) => (
            <div key={header} className="grid grid-cols-2 gap-4 items-center">
              <div>
                <Label className="text-sm font-medium">{header}</Label>
              </div>
              <div>
                <Input
                  placeholder={t('dataImport.targetPlaceholder')}
                  value={fieldMapping[header] || ''}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, [header]: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCurrentStep('preview')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('dataImport.back')}
          </Button>
          <Button onClick={() => setCurrentStep('options')} className="flex-1">
            {t('dataImport.importOptions')}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderOptionsStep = () => (
    <Card>
      <CardHeader>
        <CardTitle>{t('dataImport.importOptions')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="import-client">{t('dataImport.clientLabel')}</Label>
          <Select
            value={importOptions.clientId != null ? String(importOptions.clientId) : undefined}
            onValueChange={(v) =>
              setImportOptions({ ...importOptions, clientId: Number(v) })
            }
          >
            <SelectTrigger id="import-client">
              <SelectValue placeholder={t('dataImport.clientDefault')} />
            </SelectTrigger>
            <SelectContent>
              {activeClients.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.is_default ? t('dataImport.clientDefault') : c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('dataImport.clientHelpPre')} <code>client</code> {t('dataImport.clientHelpPost')}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deduplicate"
              checked={importOptions.deduplicate}
              onChange={(e) =>
                setImportOptions({ ...importOptions, deduplicate: e.target.checked })
              }
              className="rounded"
            />
            <Label htmlFor="deduplicate" className="cursor-pointer">
              {t('dataImport.dedupe')}
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="update-existing"
              checked={importOptions.updateExisting}
              onChange={(e) =>
                setImportOptions({ ...importOptions, updateExisting: e.target.checked })
              }
              className="rounded"
            />
            <Label htmlFor="update-existing" className="cursor-pointer">
              {t('dataImport.updateExisting')}
            </Label>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCurrentStep('mapping')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('dataImport.back')}
          </Button>
          <Button
            onClick={handleStartImport}
            disabled={importMutation.isPending}
            className="flex-1"
          >
            {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('dataImport.startImport')}
            <CheckCircle className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderImportingStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('dataImport.importing')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {progress && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('dataImport.progress')}</span>
                <span className="font-semibold">{progress.progress_percentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all"
                  style={{ width: `${progress.progress_percentage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{progress.total_records}</p>
                <p className="text-sm text-muted-foreground">{t('dataImport.total')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{progress.successful_records}</p>
                <p className="text-sm text-muted-foreground">{t('dataImport.success')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{progress.failed_records}</p>
                <p className="text-sm text-muted-foreground">{t('dataImport.failed')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{progress.skipped_records}</p>
                <p className="text-sm text-muted-foreground">{t('dataImport.skipped')}</p>
              </div>
            </div>

            {progress.status === 'completed' && (
              <div className="text-center space-y-4">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
                <h3 className="text-xl font-semibold">{t('dataImport.complete')}</h3>
                <Button onClick={() => navigate('/data-import/history')}>
                  {t('dataImport.viewHistory')}
                </Button>
              </div>
            )}

            {progress.status === 'failed' && (
              <div className="text-center space-y-4">
                <AlertCircle className="h-16 w-16 text-red-600 mx-auto" />
                <h3 className="text-xl font-semibold">{t('dataImport.importFailed')}</h3>
                <p className="text-muted-foreground">{t('dataImport.checkErrorLog')}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">{t('dataImport.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('dataImport.subtitle')}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4">
          {[
            { step: 'upload', label: t('dataImport.steps.upload'), icon: Upload },
            { step: 'preview', label: t('dataImport.steps.preview'), icon: FileText },
            { step: 'mapping', label: t('dataImport.steps.mapping'), icon: Database },
            { step: 'options', label: t('dataImport.steps.options'), icon: CheckCircle }
          ].map(({ step, label, icon: Icon }, idx) => {
            const isActive = currentStep === step;
            const isCompleted =
              (step === 'upload' && ['preview', 'mapping', 'options', 'importing'].includes(currentStep)) ||
              (step === 'preview' && ['mapping', 'options', 'importing'].includes(currentStep)) ||
              (step === 'mapping' && ['options', 'importing'].includes(currentStep)) ||
              (step === 'options' && currentStep === 'importing');

            return (
              <React.Fragment key={step}>
                <div className={`flex flex-col items-center gap-2 ${isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`p-3 rounded-full ${isActive ? 'bg-blue-100' : isCompleted ? 'bg-green-100' : 'bg-muted'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
                {idx < 3 && (
                  <ArrowRight className={`h-5 w-5 ${isCompleted ? 'text-green-600' : 'text-gray-400'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="max-w-4xl mx-auto">
          {currentStep === 'upload' && renderUploadStep()}
          {currentStep === 'preview' && renderPreviewStep()}
          {currentStep === 'mapping' && renderMappingStep()}
          {currentStep === 'options' && renderOptionsStep()}
          {currentStep === 'importing' && renderImportingStep()}
        </div>
      </div>
    </PageContainer>
  );
};

export default ImportWizard;
