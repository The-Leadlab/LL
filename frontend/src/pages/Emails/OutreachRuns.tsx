import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/use-toast';
import { outreachAPI, type OutreachRun, type OutreachRunStep, type ProcessNowResult } from '@/services/api/outreach';
import emailAPI from '@/services/emailAPI';

type JobRow = {
  id: number;
  batch_id?: string | null;
  lead_id: number;
  status: string;
  scheduled_at?: string | null;
  sent_at?: string | null;
  last_error?: string | null;
  subject?: string | null;
  campaign_id?: number | null;
  campaign_name?: string | null;
};

function RunRow({ run }: { run: OutreachRun }) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['outreach-run', run.id],
    queryFn: () => outreachAPI.getRun(run.id),
    enabled: expanded,
  });

  const steps: OutreachRunStep[] = detail?.steps ?? [];

  return (
    <>
      <tr
        className="cursor-pointer border-b hover:bg-gray-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-4 py-3 font-mono text-sm">#{run.id}</td>
        <td className="px-4 py-3">
          <Badge variant={run.status === 'completed' ? 'default' : 'secondary'}>{run.status}</Badge>
        </td>
        <td className="px-4 py-3 text-sm">
          {run.scenario?.name ?? `Scenario #${run.scenario_id}`}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-slate-50">
          <td colSpan={6} className="px-4 py-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading steps…
              </div>
            ) : steps.length === 0 ? (
              <p className="text-sm text-gray-500">No steps recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {steps.map((step) => (
                  <li
                    key={step.id}
                    className="flex flex-wrap items-center gap-2 rounded border bg-white px-3 py-2 text-sm"
                  >
                    <Badge variant="outline">{step.status}</Badge>
                    <span className="font-mono text-xs">{step.node_id}</span>
                    {step.lead_id != null && <span>Lead #{step.lead_id}</span>}
                    <span className="text-gray-500">
                      scheduled {new Date(step.scheduled_at).toLocaleString()}
                    </span>
                    {step.executed_at && (
                      <span className="text-gray-500">
                        · executed {new Date(step.executed_at).toLocaleString()}
                      </span>
                    )}
                    {step.error && <span className="text-red-600">{step.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function OutreachRunsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['outreach-runs'],
    queryFn: () => outreachAPI.listRuns({ limit: 100 }),
  });

  const { data: jobsPayload, isLoading: jobsLoading } = useQuery({
    queryKey: ['outreach-jobs'],
    queryFn: () => emailAPI.listOutreachJobs({ limit: 200 }),
  });

  const jobBatches = useMemo(() => {
    const items = ((jobsPayload as { items?: JobRow[] } | undefined)?.items || []) as JobRow[];
    const byBatch = new Map<string, JobRow[]>();
    for (const job of items) {
      const key = job.batch_id || `job-${job.id}`;
      const list = byBatch.get(key) || [];
      list.push(job);
      byBatch.set(key, list);
    }
    return Array.from(byBatch.entries()).map(([batchId, jobs]) => {
      const sent = jobs.filter((j) => j.status === 'sent').length;
      const failed = jobs.filter((j) => j.status === 'failed').length;
      const pending = jobs.filter((j) => ['pending', 'deferred', 'processing'].includes(j.status)).length;
      const skipped = jobs.filter((j) => j.status === 'skipped').length;
      const campaignName =
        jobs.find((j) => j.campaign_name)?.campaign_name ||
        (jobs.find((j) => j.campaign_id) ? `Campaign #${jobs.find((j) => j.campaign_id)?.campaign_id}` : 'Cold outreach');
      const latest = jobs
        .map((j) => j.sent_at || j.scheduled_at || '')
        .filter(Boolean)
        .sort()
        .reverse()[0];
      return { batchId, jobs, sent, failed, pending, skipped, campaignName, latest };
    });
  }, [jobsPayload]);

  const totalPending = useMemo(
    () => jobBatches.reduce((sum, b) => sum + b.pending, 0),
    [jobBatches],
  );

  const processMutation = useMutation({
    mutationFn: () => outreachAPI.processNow(50),
    onSuccess: (data: ProcessNowResult) => {
      queryClient.invalidateQueries({ queryKey: ['outreach-runs'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-jobs'] });

      const sent = data.sent_total ?? 0;
      const jobsFailed = data.outreach_jobs?.failed ?? 0;
      const jobsDeferred = data.outreach_jobs?.deferred ?? 0;
      const hasFails = jobsFailed > 0 || (data.failed_reasons?.length ?? 0) > 0;

      const parts: string[] = [];
      if (sent > 0) parts.push(`${sent} sent`);
      if (jobsFailed > 0) parts.push(`${jobsFailed} failed`);
      if (jobsDeferred > 0) parts.push(`${jobsDeferred} deferred`);
      if (data.budget_exhausted) parts.push('time budget reached — run again for remaining');

      const description = parts.length > 0
        ? parts.join(', ') + '.'
        : 'No due jobs found.';

      const failSnippet = data.failed_reasons?.length
        ? `\n${data.failed_reasons.slice(0, 3).join('\n')}${data.failed_reasons.length > 3 ? `\n…and ${data.failed_reasons.length - 3} more` : ''}`
        : '';

      toast({
        title: hasFails ? 'Queue processed with errors' : 'Queue processed',
        description: description + failSnippet,
        variant: hasFails ? 'destructive' : 'default',
      });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail =
        axiosErr?.response?.data?.detail
        || axiosErr?.message
        || 'Unknown error';
      toast({
        title: 'Could not process queue',
        description: detail,
        variant: 'destructive',
      });
    },
  });

  const stopAllMutation = useMutation({
    mutationFn: () => outreachAPI.cancelAllPending(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outreach-jobs'] });
      toast({
        title: 'Sending stopped',
        description: `${data.cancelled} pending job${data.cancelled === 1 ? '' : 's'} cancelled.`,
      });
    },
    onError: () => {
      toast({ title: 'Could not stop sending', variant: 'destructive' });
    },
  });

  const stopBatchMutation = useMutation({
    mutationFn: (batchId: string) => outreachAPI.cancelBatch(batchId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outreach-jobs'] });
      toast({
        title: 'Batch stopped',
        description: `${data.cancelled} pending job${data.cancelled === 1 ? '' : 's'} cancelled.`,
      });
    },
    onError: () => {
      toast({ title: 'Could not stop batch', variant: 'destructive' });
    },
  });

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Runs</h1>
          <p className="mt-1 text-sm text-gray-600">
            History of every cold outreach campaign launch. Emails are spaced 5 min apart — only due jobs are sent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/emails/outreach')}>
            Cold Outreach
          </Button>
          <Button
            type="button"
            onClick={() => processMutation.mutate()}
            disabled={processMutation.isPending}
          >
            {processMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Process due emails
          </Button>
          {totalPending > 0 && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => stopAllMutation.mutate()}
              disabled={stopAllMutation.isPending}
            >
              {stopAllMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-2 h-4 w-4" />
              )}
              Stop all ({totalPending})
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Campaign batches</h2>
            <p className="text-xs text-gray-500">Each Cold Outreach launch creates a batch here.</p>
          </div>
          {jobsLoading ? (
            <div className="flex items-center justify-center p-8 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading batches…
            </div>
          ) : jobBatches.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              No campaign sends yet. Launch one from Cold Outreach.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Pending</th>
                    <th className="px-4 py-3">Failed</th>
                    <th className="px-4 py-3">Skipped</th>
                    <th className="px-4 py-3">Latest</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {jobBatches.map((batch) => (
                    <tr key={batch.batchId} className="border-b">
                      <td className="px-4 py-3 font-medium">{batch.campaignName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{batch.batchId}</td>
                      <td className="px-4 py-3">{batch.sent}</td>
                      <td className="px-4 py-3">{batch.pending}</td>
                      <td className="px-4 py-3">{batch.failed}</td>
                      <td className="px-4 py-3">{batch.skipped}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {batch.latest ? new Date(batch.latest).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {batch.pending > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => stopBatchMutation.mutate(batch.batchId)}
                            disabled={stopBatchMutation.isPending}
                          >
                            {stopBatchMutation.isPending ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Square className="mr-1 h-3 w-3" />
                            )}
                            Stop
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {runs.length > 0 && (
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Other runs</h2>
            <p className="text-xs text-gray-500">Older automation history, if any.</p>
          </div>
          {runsLoading ? (
            <div className="flex items-center justify-center p-8 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading runs…
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3" />
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

export default OutreachRunsPage;
