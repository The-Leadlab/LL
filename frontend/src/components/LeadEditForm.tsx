import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import { api } from '@/lib/axios';
import { clientsAPI } from '@/services/api/clients';

interface LeadEditFormProps {
  lead: {
    id: number;
    first_name: string;
    last_name: string;
    company?: string | null;
    job_title?: string | null;
    location?: string | null;
    country?: string | null;
    email?: string | null;
    telephone?: string | null;
    phone?: string | null;
    mobile?: string | null;
    linkedin?: string | null;
    website?: string | null;
    sector?: string | null;
    client_comments?: string | null;
    client_id?: number | null;
    client_name?: string | null;
  };
  onSuccess: () => void;
  onCancel: () => void;
}

type FormValues = {
  first_name: string;
  last_name: string;
  company: string;
  job_title: string;
  location: string;
  country: string;
  email: string;
  telephone: string;
  mobile: string;
  linkedin: string;
  website: string;
  sector: string;
  client_comments: string;
  client_id: string;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</label>
      {children}
    </div>
  );
}

export const LeadEditForm: React.FC<LeadEditFormProps> = ({ lead, onSuccess, onCancel }) => {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const initials = `${lead.first_name?.[0] || ''}${lead.last_name?.[0] || ''}`;

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsAPI.list(false),
  });
  const clients = clientsData?.items ?? [];

  const { register, handleSubmit, control, watch } = useForm<FormValues>({
    defaultValues: {
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      company: lead.company || '',
      job_title: lead.job_title || '',
      location: lead.location || '',
      country: lead.country || '',
      email: lead.email || '',
      telephone: lead.telephone || lead.phone || '',
      mobile: lead.mobile || '',
      linkedin: lead.linkedin || '',
      website: lead.website || '',
      sector: lead.sector || '',
      client_comments: lead.client_comments || '',
      client_id: lead.client_id != null ? String(lead.client_id) : '',
    },
  });

  const selectedClientId = watch('client_id');
  const originalClientId = lead.client_id != null ? String(lead.client_id) : '';
  const selectedClient = clients.find((c) => String(c.id) === selectedClientId);
  const clientChanged = Boolean(selectedClientId) && selectedClientId !== originalClientId;

  const onSubmit = async (data: FormValues) => {
    try {
      setIsSubmitting(true);
      const updateData: Record<string, unknown> = {
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        company: data.company.trim() || null,
        job_title: data.job_title.trim() || null,
        location: data.location.trim() || null,
        country: data.country.trim() || null,
        email: data.email.trim() || null,
        telephone: data.telephone.trim() || null,
        mobile: data.mobile.trim() || null,
        linkedin: data.linkedin.trim() || null,
        website: data.website.trim() || null,
        sector: data.sector.trim() || null,
        client_comments: data.client_comments.trim() || null,
      };
      if (data.client_id) {
        updateData.client_id = Number(data.client_id);
      }

      await api.put(`/leads/${lead.id}`, updateData);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      await queryClient.invalidateQueries({ queryKey: ['lead', String(lead.id)] });
      await queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      await queryClient.invalidateQueries({ queryKey: ['clients'] });

      toast({
        title: 'Lead updated',
        description: clientChanged && selectedClient
          ? `Moved to ${selectedClient.name}.`
          : 'Contact details saved.',
      });
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Could not update lead',
        description: error.response?.data?.detail || error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'h-11 bg-white';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="min-h-screen bg-neutral-50 pb-28">
      <div className="sticky top-0 z-50 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-3 lg:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="text-neutral-500">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Avatar className="h-8 w-8 bg-primary/10 text-primary">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">
                Edit {lead.first_name} {lead.last_name}
              </p>
              <p className="truncate text-xs text-neutral-500">
                {selectedClient?.name || lead.client_name || 'Choose a client'}
              </p>
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting} className="min-h-[40px]">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-4 px-3 py-6 lg:px-4">
        <section className="rounded-xl border border-primary/15 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900">Client</h2>
              <p className="text-sm text-neutral-500">
                This lead appears on that client’s tab. Changing it moves them without a separate step.
              </p>
            </div>
          </div>
          <Controller
            name="client_id"
            control={control}
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger className="h-11 max-w-md bg-white">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={String(client.id)}>
                      {client.name}
                      {client.is_default ? ' (General)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {clientChanged && selectedClient && (
            <p className="mt-2 text-sm text-primary">
              Will move from {lead.client_name || 'the current client'} to {selectedClient.name}.
            </p>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Personal</h2>
            <div className="space-y-4">
              <Field label="First name">
                <Input className={inputClass} {...register('first_name', { required: true })} />
              </Field>
              <Field label="Last name">
                <Input className={inputClass} {...register('last_name', { required: true })} />
              </Field>
              <Field label="Email">
                <Input className={inputClass} type="email" {...register('email')} />
              </Field>
              <Field label="Telephone">
                <Input className={inputClass} {...register('telephone')} />
              </Field>
              <Field label="Mobile">
                <Input className={inputClass} {...register('mobile')} />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Professional</h2>
            <div className="space-y-4">
              <Field label="Company">
                <Input className={inputClass} {...register('company')} />
              </Field>
              <Field label="Job title">
                <Input className={inputClass} {...register('job_title')} />
              </Field>
              <Field label="Sector">
                <Input className={inputClass} {...register('sector')} />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Location & contact</h2>
            <div className="space-y-4">
              <Field label="Location">
                <Input className={inputClass} {...register('location')} />
              </Field>
              <Field label="Country">
                <Input className={inputClass} {...register('country')} />
              </Field>
              <Field label="LinkedIn">
                <Input className={inputClass} {...register('linkedin')} />
              </Field>
              <Field label="Website">
                <Input className={inputClass} {...register('website')} />
              </Field>
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">Note</h2>
          <Textarea
            {...register('client_comments')}
            className="min-h-[120px] bg-white"
            placeholder="Internal note about this lead"
          />
        </section>
      </div>
    </form>
  );
};
