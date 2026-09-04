import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/use-toast';
import { outreachAPI, type OutreachScenario } from '@/services/api/outreach';

export function OutreachScenariosPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ['outreach-scenarios'],
    queryFn: outreachAPI.listScenarios,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => outreachAPI.deleteScenario(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-scenarios'] });
      toast({ title: 'Scenario deleted' });
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      outreachAPI.createScenario({
        name: 'New scenario',
        status: 'draft',
        flow_definition: { modules: [{ id: 'trigger-1', type: 'trigger_manual', config: {} }] },
      }),
    onSuccess: (scenario) => {
      queryClient.invalidateQueries({ queryKey: ['outreach-scenarios'] });
      navigate(`/emails/scenarios/${scenario.id}`);
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => outreachAPI.seedDemoScenario(),
    onSuccess: (scenario) => {
      queryClient.invalidateQueries({ queryKey: ['outreach-scenarios'] });
      toast({ title: 'Demo scenario ready', description: 'Open it, activate, then Run with lead IDs.' });
      navigate(`/emails/scenarios/${scenario.id}`);
    },
    onError: (error: Error) => {
      toast({ title: 'Could not seed demo', description: error.message, variant: 'destructive' });
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
          <h1 className="text-2xl font-semibold">Outreach Scenarios</h1>
          <p className="mt-1 text-sm text-gray-600">
            Build Make-style linear flows: wait, send email, route, update leads, and more.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={seedMutation.isPending}
            onClick={() => seedMutation.mutate()}
          >
            {seedMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
            Seed demo scenario
          </Button>
          <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create scenario
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {scenarios.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              No scenarios yet. Create one to open the builder.
            </CardContent>
          </Card>
        ) : (
          scenarios.map((scenario: OutreachScenario) => (
            <Card key={scenario.id} className="cursor-pointer hover:border-gray-300">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  onClick={() => navigate(`/emails/scenarios/${scenario.id}`)}
                >
                  <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
                  <div>
                    <div className="font-medium">{scenario.name}</div>
                    <div className="text-xs text-gray-500">
                      {scenario.flow_definition?.modules?.length ?? 0} modules ·{' '}
                      {new Date(scenario.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant={scenario.status === 'active' ? 'default' : 'secondary'}>
                    {scenario.status}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/emails/scenarios/${scenario.id}`)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Delete this scenario?')) deleteMutation.mutate(scenario.id);
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

export default OutreachScenariosPage;
