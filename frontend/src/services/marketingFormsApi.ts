import { getApiOrigin } from '@/lib/apiOrigin'

export type MarketingFormType =
  | 'business_diagnostic'
  | 'data_request'
  | 'pitch_your_idea'

export interface MarketingFormPayload {
  form_type: MarketingFormType
  full_name: string
  email: string
  company?: string
  phone?: string
  subject?: string
  payload: Record<string, unknown>
  to_email?: string
}

export async function submitMarketingForm(body: MarketingFormPayload): Promise<{ msg: string; id?: number }> {
  const apiBase = getApiOrigin()
  const res = await fetch(`${apiBase}/api/v1/lead-forms/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...body,
      to_email: body.to_email || 'info@the-leadlab.com',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (data as { detail?: string }).detail || res.statusText
    throw new Error(typeof detail === 'string' ? detail : 'Submission failed')
  }
  return data as { msg: string; id?: number }
}
