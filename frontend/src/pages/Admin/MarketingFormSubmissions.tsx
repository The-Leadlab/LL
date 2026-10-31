import React from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/axios'
import { useAuthStore } from '../../store/auth'
import { ClipboardList, ChevronDown, ChevronRight } from 'lucide-react'

type Item = {
  id: number
  form_type: string
  full_name: string
  email: string
  company?: string | null
  phone?: string | null
  subject?: string | null
  payload: Record<string, unknown>
  created_at: string | null
}

const formLabels: Record<string, string> = {
  business_diagnostic: 'Business diagnostic',
  data_request: 'Data request',
  pitch_your_idea: 'Pitch your idea',
}

export function MarketingFormSubmissions() {
  const { user } = useAuthStore()
  const [filter, setFilter] = React.useState<string>('')
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['marketing-form-submissions', filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' })
      if (filter) params.set('form_type', filter)
      const res = await api.get<{ items: Item[]; total: number }>(
        `/admin/marketing-form-submissions?${params.toString()}`
      )
      return res.data
    },
    enabled: !!user?.is_admin,
  })

  const items = data?.items ?? []

  if (!user?.is_admin) {
    return <p className="text-muted-foreground">Admin access required.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-foreground">
          <ClipboardList className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Marketing form submissions</h2>
        </div>
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="business_diagnostic">Business diagnostic</option>
          <option value="data_request">Data request</option>
          <option value="pitch_your_idea">Pitch your idea</option>
        </select>
        {data != null && (
          <span className="text-sm text-muted-foreground">
            Showing {items.length} of {data.total}
          </span>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-red-600 text-sm">
          Failed to load submissions. Ensure you are logged in as admin and the API is reachable.
        </p>
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-muted-foreground border rounded-lg p-8 text-center bg-muted/50">No submissions yet.</p>
      )}

      <div className="space-y-3">
        {items.map((row) => {
          const open = expanded[row.id]
          return (
            <div key={row.id} className="border rounded-xl bg-card shadow-sm overflow-hidden">
              <button
                type="button"
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted"
                onClick={() => setExpanded((e) => ({ ...e, [row.id]: !open }))}
              >
                {open ? <ChevronDown className="w-5 h-5 shrink-0 mt-0.5" /> : <ChevronRight className="w-5 h-5 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{row.full_name}</span>
                    <span className="text-sm text-muted-foreground">{row.email}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      {formLabels[row.form_type] || row.form_type}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                    {row.company ? ` · ${row.company}` : ''}
                  </div>
                  {row.subject && <div className="text-sm text-muted-foreground mt-1 truncate">{row.subject}</div>}
                </div>
              </button>
              {open && (
                <div className="px-4 pb-4 pt-0 border-t bg-muted/50/80">
                  <div className="grid sm:grid-cols-2 gap-2 text-sm mt-3">
                    {row.phone && (
                      <div>
                        <span className="text-muted-foreground">Phone:</span> {row.phone}
                      </div>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mt-4 mb-2">Form details (payload)</h4>
                  <pre className="text-xs bg-card border rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(row.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
