import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { outreachAPI, type OutreachRun, type OutreachRunStep } from '@/services/api/outreach';

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
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['outreach-runs'],
    queryFn: () => outreachAPI.listRuns({ limit: 100 }),
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
      <div>
        <h1 className="text-2xl font-semibold">Outreach Runs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Scenario execution history. Click a row to expand step details.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="w-8 px-4 py-2" />
                    <th className="px-4 py-2">Run</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Scenario</th>
                    <th className="px-4 py-2">Started</th>
                    <th className="px-4 py-2">Finished</th>
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
    </div>
  );
}

export default OutreachRunsPage;
