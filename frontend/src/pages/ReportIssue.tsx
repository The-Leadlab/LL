import React from 'react'
import { toast } from 'react-hot-toast'
import { Paperclip, Ticket, X } from 'lucide-react'
import { getApiOrigin } from '@/lib/apiOrigin'
import { useAuthStore } from '@/store/auth'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { publicAuthCtaClassName } from '@/components/layout/PublicAuthShell'
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

const MAX_FILES = 5
const MAX_BYTES = 50 * 1024 * 1024

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Standalone public report page — no login required. */
export default function ReportIssue({ embedded = false }: { embedded?: boolean }) {
  const { user, token } = useAuthStore()
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
  const [files, setFiles] = React.useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!user) return
    setForm((prev) => ({
      ...prev,
      reporter_name:
        prev.reporter_name ||
        `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      reporter_email: prev.reporter_email || user.email || '',
    }))
  }, [user])

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return
    const next = [...files]
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        toast.error(`You can attach at most ${MAX_FILES} files`)
        break
      }
      if (file.size > MAX_BYTES) {
        toast.error(`"${file.name}" is over 50 MB`)
        continue
      }
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue
      next.push(file)
    }
    setFiles(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.reporter_name.trim() || !form.reporter_email.trim()) {
      toast.error('Name and email are required.')
      return
    }
    if (!form.project_name.trim() || !form.subject.trim() || !form.description.trim()) {
      toast.error('Project, subject, and description are required.')
      return
    }

    setIsSubmitting(true)
    try {
      const body = new FormData()
      body.append('reporter_name', form.reporter_name.trim())
      body.append('reporter_email', form.reporter_email.trim())
      body.append('project_name', form.project_name.trim())
      body.append('subject', form.subject.trim())
      body.append('description', form.description.trim())
      body.append('priority', form.priority)
      for (const file of files) {
        body.append('files', file)
      }

      const origin = import.meta.env.DEV ? '' : getApiOrigin()
      const url = `${origin}/api/v1/report-tickets/`
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body,
      })

      if (!response.ok) {
        let detail = 'Could not submit the report.'
        try {
          const data = await response.json()
          if (typeof data?.detail === 'string') detail = data.detail
          else if (Array.isArray(data?.detail)) {
            detail = data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(', ') || detail
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail)
      }

      toast.success('Report submitted — the LeadLab team was notified by email.')
      setForm((prev) => ({
        ...prev,
        project_name: '',
        subject: '',
        description: '',
        priority: 'normal',
      }))
      setFiles([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit the report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formCard = (
    <div className={embedded ? 'max-w-2xl mx-auto p-4 sm:p-6' : 'max-w-2xl mx-auto'}>
      <div className="flex items-center gap-3 mb-2">
        <Ticket className="w-7 h-7 text-blue-600" />
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Report an issue</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Anyone with this link can send a report — no login required. Attach screenshots, images, or
        short videos. Ali at LeadLab is notified by email as soon as you submit.
      </p>

      <form onSubmit={onSubmit} className="space-y-4 bg-white rounded-2xl border border-blue-100 p-6 shadow-xl">
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Attachments
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Screenshots, images, or videos — up to {MAX_FILES} files, 50 MB each.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,video/*,.pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.webm,.heic"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES || isSubmitting}
          >
            <Paperclip className="w-4 h-4 mr-2" />
            Add files
          </Button>
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="truncate text-gray-800">
                    {file.name}{' '}
                    <span className="text-gray-500">({formatBytes(file.size)})</span>
                  </span>
                  <button
                    type="button"
                    className="text-gray-500 hover:text-red-600 shrink-0"
                    onClick={() => removeFile(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={isSubmitting} className={`${publicAuthCtaClassName} w-auto min-w-[160px]`}>
            {isSubmitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </form>
    </div>
  )

  if (embedded) return formCard

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <MarketingNav />
      <main className="flex-1 pt-24 pb-16 px-4">{formCard}</main>
    </div>
  )
}
