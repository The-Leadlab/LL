import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowsAPI, Workflow } from '@/services/api/workflows';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useToast } from '@/hooks/use-toast';
import {
  Workflow as WorkflowIcon, Plus, Edit, Trash2, Play, Pause,
  Activity, TrendingUp, Zap, Loader2, CheckCircle, XCircle
} from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export const WorkflowList: React.FC = () => {
  const { t } = useTranslation('modules');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch workflows
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsAPI.getAll()
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      isActive ? workflowsAPI.deactivate(id) : workflowsAPI.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({
        title: t('workflows.toast.success'),
        description: t('workflows.toast.statusUpdated')
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: workflowsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({
        title: t('workflows.toast.success'),
        description: t('workflows.toast.deleted')
      });
    }
  });

  const getTriggerLabel = (trigger: string) => {
    return t(`workflows.triggers.${trigger}`, { defaultValue: trigger });
  };

  const workflowList: Workflow[] = Array.isArray(workflows)
    ? workflows
    : Array.isArray((workflows as { items?: Workflow[] } | undefined)?.items)
      ? ((workflows as { items: Workflow[] }).items)
      : [];

  const stats = React.useMemo(() => {
    if (!workflowList.length) return { total: 0, active: 0, inactive: 0 };
    return {
      total: workflowList.length,
      active: workflowList.filter(w => w.is_active).length,
      inactive: workflowList.filter(w => !w.is_active).length
    };
  }, [workflowList]);

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
            <h1 className="text-3xl font-bold">{t('workflows.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('workflows.subtitle')}
            </p>
          </div>
          <Button onClick={() => navigate('/workflows/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('workflows.createMap')}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <WorkflowIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('workflows.totalMaps')}</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Play className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('workflows.active')}</p>
                  <p className="text-2xl font-bold">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-muted rounded-lg">
                  <Pause className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('workflows.inactive')}</p>
                  <p className="text-2xl font-bold">{stats.inactive}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workflows List */}
        <div className="space-y-4">
          {workflowList.length > 0 ? (
            workflowList.map((workflow) => (
              <Card key={workflow.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <WorkflowIcon className="h-5 w-5 text-blue-600" />
                        <h3 className="text-xl font-semibold">{workflow.name}</h3>
                        {workflow.is_active ? (
                          <Badge className="bg-green-100 text-green-800">
                            <Play className="h-3 w-3 mr-1" />
                            {t('workflows.active')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Pause className="h-3 w-3 mr-1" />
                            {t('workflows.inactive')}
                          </Badge>
                        )}
                      </div>
                      {workflow.description && (
                        <p className="text-muted-foreground mb-3">{workflow.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Zap className="h-4 w-4" />
                          <span>{getTriggerLabel(workflow.trigger_type)}</span>
                        </div>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Activity className="h-4 w-4" />
                          <span>{workflow.trigger_object}</span>
                        </div>
                        <span>•</span>
                        <span>{t('workflows.steps', { count: workflow.flow_definition?.nodes?.length ?? 0 })}</span>
                        <span>•</span>
                        <span>{t('workflows.created', { date: formatDate(workflow.created_at) })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/workflows/${workflow.id}`)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        {t('workflows.edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggleActiveMutation.mutate({
                            id: workflow.id,
                            isActive: workflow.is_active
                          })
                        }
                      >
                        {workflow.is_active ? (
                          <>
                            <Pause className="h-4 w-4 mr-1" />
                            {t('workflows.pause')}
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-1" />
                            {t('workflows.activate')}
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(t('workflows.confirmDelete'))) {
                            deleteMutation.mutate(workflow.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <WorkflowIcon className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">{t('workflows.emptyTitle')}</h3>
                <p className="text-muted-foreground mb-4">
                  {t('workflows.emptyBody')}
                </p>
                <Button onClick={() => navigate('/workflows/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('workflows.createMap')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default WorkflowList;
