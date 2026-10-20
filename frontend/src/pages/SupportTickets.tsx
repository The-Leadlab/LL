import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Ticket } from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

type FormState = {
  reporter_name: string
  reporter_email: string
  project_name: string
  subject: string
  description: string
  priority: string
}

export default function SupportTickets() {
  const { user } = useAuthStore()
  const [form, setForm] = React.useState<FormState>({
    reporter_name: user
      ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
      : '',
    reporter_email: user?.email || '',
    project_name: '',
    subject: '',
    description: '',
    priority: 'normal',
  })

  const mutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const res = await api.post('/support-tickets/', payload)
      return res.data
    },
    onSuccess: () => {
      toast.success('Ticket submitted — the LeadLab team was notified by email.')
      setForm((prev) => ({
        ...prev,
        project_name: '',
        subject: '',
        description: '',
        priority: 'normal',
      }))
    },
    onError: () => {
      toast.error('Could not submit the ticket. Please try again.')
    },
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.project_name.trim() || !form.subject.trim() || !form.description.trim()) {
      toast.error('Project, subject, and description are required.')
      return
    }
    mutation.mutate(form)
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-2">
        <Ticket className="w-7 h-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Report an issue</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Tell us about an error on one of your projects. Ali at LeadLab is notified by email as soon as you submit.
      </p>

      <form onSubmit={onSubmit} className="space-y-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <Input
              value={form.reporter_name}
              onChange={(e) => setForm({ ...form, reporter_name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your email</label>
            <Input
              type="email"
              value={form.reporter_email}
              onChange={(e) => setForm({ ...form, reporter_email: e.target.value })}
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
          <Input
            value={form.project_name}
            onChange={(e) => setForm({ ...form, project_name: e.target.value })}
            placeholder="e.g. DeluxePad CRM"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <Input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="Short summary of the error"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            className="w-full min-h-[140px] rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What happened, which page, and any error message you saw."
            required
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting…' : 'Submit ticket'}
          </Button>
        </div>
      </form>
    </div>
  )
}
