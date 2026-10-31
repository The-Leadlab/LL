import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Ticket } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth'

type AttachmentItem = {
  id: number
  filename: string
  stored_name: string
  content_type?: string | null
  size_bytes: number
}

type TicketItem = {
  id: number
  reporter_name: string
  reporter_email: string
  project_name: string
  subject: string
  description: string
  status: string
  priority: string
  created_at: string | null
  attachments?: AttachmentItem[]
}

const statusOptions = ['open', 'in_progress', 'resolved', 'closed'] as const

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function SupportTicketsAdmin() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = React.useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['support-tickets', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' })
      if (statusFilter) params.set('status', statusFilter)
      const res = await api.get<{ items: TicketItem[]; total: number }>(
        `/report-tickets/?${params.toString()}`
      )
      return res.data
    },
    enabled: !!user?.is_admin,
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await api.patch(`/report-tickets/${id}`, { status })
      return res.data
    },
    onSuccess: () => {
      toast.success('Status updated — the reporter was emailed and can reply to you')
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
    },
    onError: () => toast.error('Could not update report'),
  })

  const downloadAttachment = async (ticketId: number, att: AttachmentItem) => {
    try {
      const res = await api.get(
        `/report-tickets/${ticketId}/attachments/${encodeURIComponent(att.stored_name)}`,
        { responseType: 'blob' }
      )
      const url = window.URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = att.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download attachment')
    }
  }

  if (!user?.is_admin) {
    return <p className="text-muted-foreground p-4">Admin access required.</p>
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-foreground">
          <Ticket className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Issue reports</h2>
        </div>
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {data != null && (
          <span className="text-sm text-muted-foreground">
            Showing {items.length} of {data.total}
          </span>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-red-600 text-sm">Failed to load reports.</p>
      )}
      {!isLoading && items.length === 0 && (
        <p className="text-muted-foreground text-sm">No reports yet.</p>
      )}

      <div className="space-y-3">
        {items.map((ticket) => (
          <div
            key={ticket.id}
            className="border border-border rounded-lg p-4 bg-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">
                  #{ticket.id} · {ticket.project_name}
                </p>
                <p className="text-sm text-foreground mt-0.5">{ticket.subject}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ticket.reporter_name} &lt;{ticket.reporter_email}&gt; ·{' '}
                  {ticket.priority} ·{' '}
                  {ticket.created_at
                    ? new Date(ticket.created_at).toLocaleString()
                    : '—'}
                </p>
              </div>
              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={ticket.status}
                onChange={(e) =>
                  updateMutation.mutate({ id: ticket.id, status: e.target.value })
                }
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-foreground mt-3 whitespace-pre-wrap">
              {ticket.description}
            </p>
            {(ticket.attachments?.length ?? 0) > 0 && (
              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
                {ticket.attachments!.map((att) => (
                  <li key={att.id}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                      onClick={() => downloadAttachment(ticket.id, att)}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {att.filename}{' '}
                      <span className="text-muted-foreground">({formatBytes(att.size_bytes)})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
