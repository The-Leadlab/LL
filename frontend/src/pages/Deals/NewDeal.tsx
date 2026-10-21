import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ArrowLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { dealsAPI } from '@/services/api';
import leadsAPI, { Lead, User } from '@/services/api/leads';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { PageContainer } from '@/components/ui/PageContainer';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { useAuthStore } from '@/store/auth';
import usersAPI from '@/services/api/users';
import { extractUserList, normalizeAssigneeUsers } from '@/utils/assigneeUsers';
import { getCurrencies, type Currency as CurrencyRow } from '@/services/currencies';

interface NewDealForm {
  lead_id: number;
  name: string;
  description: string;
  amount: string;
  status: string;
  valid_until: string;
  probability: number;
  organization_id: number;
  assigned_to_id: number;
  currency_id: number;
}

const DEAL_STAGES = [
  { value: 'Lead', label: 'Lead' },
  { value: 'Qualified', label: 'Qualified' },
  { value: 'Proposal', label: 'Proposal' },
  { value: 'Negotiation', label: 'Negotiation' },
  { value: 'Closed_Won', label: 'Closed Won' },
  { value: 'Closed_Lost', label: 'Closed Lost' },
];

export const NewDealPage = () => {
  const { t } = useTranslation('modules');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedLeadSearch = useDebounce(searchTerm, 300);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserSearchOpen, setIsUserSearchOpen] = useState(false);
  
  const form = useForm<NewDealForm>({
    defaultValues: {
      name: '',
      description: '',
      amount: '0.00',
      status: 'Lead',
      valid_until: '',
      probability: 0,
      organization_id: 0,
      assigned_to_id: 0,
      currency_id: 0,
      lead_id: 0
    }
  });

  const {
    data: currencies = [] as CurrencyRow[],
    isLoading: isLoadingCurrencies,
    isError: isCurrenciesError,
  } = useQuery({
    queryKey: ['currencies'],
    queryFn: getCurrencies,
  });

  const currencyPlaceholder = isLoadingCurrencies
    ? 'Loading…'
    : isCurrenciesError
      ? 'Could not load currencies'
      : currencies.length
        ? 'Select currency'
        : 'No currencies — contact admin';

  useEffect(() => {
    if (!currencies.length) return;
    const current = form.getValues('currency_id');
    if (current && currencies.some((c) => c.id === current)) return;
    const usd = currencies.find((c) => c.code === 'USD');
    form.setValue('currency_id', (usd ?? currencies[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when currency list loads
  }, [currencies]);

  // Fetch leads based on search term
  const { data: leadsResponse, isLoading: isLoadingLeads } = useQuery({
    queryKey: ['leads-search', debouncedLeadSearch],
    queryFn: async () => {
      try {
        const response = await leadsAPI.getLeads({
          search: debouncedLeadSearch || undefined,
          limit: 20,
          skip: 0,
          sort_by: 'created_at',
          sort_desc: true
        });
        return response;
      } catch (error) {
        console.error('Error fetching leads:', error);
        throw error;
      }
    },
    enabled: isSearchOpen,
    staleTime: 15_000,
  });

  // Debug console logs
  useEffect(() => {
  }, [leadsResponse, isLoadingLeads]);

  // Fetch users from the same organization
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['organization-users'],
    queryFn: async () => {
      try {
        const response = await usersAPI.getAll(
          currentUser?.organization_id ? { organization_id: Number(currentUser.organization_id) } : undefined
        );
        const allUsers = extractUserList(response);
        return normalizeAssigneeUsers(allUsers, currentUser ? {
          id: Number(currentUser.id),
          email: currentUser.email,
          first_name: currentUser.first_name,
          last_name: currentUser.last_name,
        } : null);
      } catch (error) {
        console.error('Error fetching organization users:', error);
        return [];
      }
    },
    enabled: !!currentUser?.organization_id
  });

  // Debug için
  useEffect(() => {
  }, [currentUser, users]);

  const handleLeadSelect = (lead: Lead) => {
    setSelectedLead(lead);
    form.setValue('lead_id', lead.id);
    setSearchTerm('');
    setIsSearchOpen(false);
  };

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    form.setValue('assigned_to_id', user.id);
    setUserSearchTerm('');
    setIsUserSearchOpen(false);
  };

  const onSubmit = async (data: NewDealForm) => {
    setIsSubmitting(true);
    try {
      // Backend'in beklediği formata göre veri hazırlayalım
      if (!data.currency_id) {
        toast({
          title: 'Currency required',
          description: 'Loading currencies… try again in a moment.',
          variant: 'destructive',
        });
        return;
      }

      const formattedData = {
        ...data,
        organization_id: currentUser?.organization_id || 0,
        currency_id: data.currency_id,
        // Status değeri için DealStatus enum formatında düzenleyelim
        status: data.status === 'Closed_Won' ? 'Closed Won' : 
                data.status === 'Closed_Lost' ? 'Closed Lost' : 
                data.status,
        // Amount değerini sayısal değere çevirelim
        amount: parseFloat(data.amount) || 0,
        assigned_to_id: data.assigned_to_id || (currentUser?.id ? Number(currentUser.id) : undefined),
        valid_until: data.valid_until?.trim() ? data.valid_until : null,
      };

      
      await dealsAPI.create(formattedData);
      await queryClient.invalidateQueries({ queryKey: ['deals'] });

      toast({
        title: 'Success',
        description: 'Deal created successfully',
      });
      navigate('/deals');
    } catch (error: any) {
      console.error('Deal creation error:', error);
      
      // Network/CORS hataları için kontrol
      if (!error.response) {
        console.error('Network error (possibly CORS):', error.message);
        toast({
          title: 'Connection Error',
          description: 'Could not connect to the server. Please try again.',
          variant: 'destructive',
        });
      } else {
        // API hatası detayları
        console.error('API error details:', {
          status: error.response?.status,
          data: error.response?.data,
        });
        
        // Eksik alanları kontrol etme
        if (error.response?.status === 422 && error.response?.data?.detail) {
          // Validation hatası mesajlarını göster
          const errorMessage = Array.isArray(error.response.data.detail) 
            ? error.response.data.detail.map((err: any) => `${err.loc[1]}: ${err.msg}`).join('\n')
            : error.response.data.detail;
            
          toast({
            title: 'Form Validation Error',
            description: errorMessage,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Error',
            description: error.response?.data?.detail || 'Failed to create deal',
            variant: 'destructive',
          });
        }
      }
      
      // Hata durumunda navigate yapmayalım, kullanıcı sayfada kalsın
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto py-4 lg:py-8 px-3 lg:px-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 lg:mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/deals')}
              className="flex items-center gap-2 rounded-full h-10"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('newDeal.back')}
            </Button>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-800">{t('newDeal.title')}</h1>
          </div>
          <div className="bg-blue-50 px-3 lg:px-4 py-2 rounded-lg border border-blue-100">
            <p className="text-xs lg:text-sm text-blue-700 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              {t('newDeal.hint')}
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 lg:space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:gap-6 bg-white rounded-xl shadow-sm border p-4 lg:p-6">
              <div className="col-span-1 border-b pb-3 lg:pb-4 mb-2">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-800">{t('newDeal.dealInfo')}</h2>
                <p className="text-xs lg:text-sm text-gray-500 mt-1">Enter the basic information about this deal</p>
              </div>

              {/* Lead Search - Enhanced UI */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <FormField
                  control={form.control}
                  name="lead_id"
                  render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel className="text-sm font-medium">Lead Contact</FormLabel>
                      <FormControl>
                        <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                          <PopoverTrigger asChild>
                            <div className="w-full">
                              <div className="flex items-center w-full rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-10 px-3 py-2 relative">
                                {selectedLead ? (
                                  <div className="flex items-center gap-2 w-full">
                                    <div className="bg-primary/10 text-primary rounded-full h-7 w-7 flex items-center justify-center">
                                      {(selectedLead.first_name?.[0] || '?')}{(selectedLead.last_name?.[0] || '')}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-medium">{selectedLead.first_name} {selectedLead.last_name}</span>
                                      {selectedLead.company && (
                                        <span className="text-xs text-gray-500">{selectedLead.company}</span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center text-gray-500 gap-2">
                                    <Search className="h-4 w-4" />
                                    <span>Search and select lead...</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <div className="p-3 border-b">
                              <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                  placeholder="Search leads by name, company..."
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  className="pl-9 bg-gray-50"
                                />
                              </div>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                              {isLoadingLeads ? (
                                <div className="p-4 text-center">
                                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                                  <p className="text-sm text-gray-500">Searching leads...</p>
                                </div>
                              ) : (() => {
                                // Get leads array from response, with type safety
                                let leads: Lead[] = [];
                                
                                // Try different response structures
                                if (leadsResponse?.items && Array.isArray(leadsResponse.items)) {
                                  leads = leadsResponse.items;
                                } else if (leadsResponse?.results && Array.isArray(leadsResponse.results)) {
                                  leads = leadsResponse.results;
                                } else if (Array.isArray(leadsResponse)) {
                                  leads = leadsResponse;
                                }
                                
                                
                                if (leads.length === 0) {
                                  return (
                                    <div className="p-6 text-center">
                                      <div className="rounded-full h-10 w-10 bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                        <Search className="h-5 w-5 text-gray-500" />
                                      </div>
                                      <p className="text-gray-500 mb-1">No leads found</p>
                                      <p className="text-xs text-gray-400">Try a different search term</p>
                                    </div>
                                  );
                                }
                                
                                // Apply filtering logic
                                return (
                                  <div className="py-1">
                                    {leads.map((lead) => (
                                      <div
                                        key={lead.id}
                                        className="px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-3"
                                        onClick={() => handleLeadSelect(lead)}
                                      >
                                        <div className="bg-primary/10 text-primary rounded-full h-8 w-8 flex items-center justify-center shrink-0">
                                          {(lead.first_name?.[0] || '?')}{(lead.last_name?.[0] || '')}
                                        </div>
                                        <div>
                                          <div className="font-medium">{lead.first_name || 'Unknown'} {lead.last_name || ''}</div>
                                          {lead.email && <div className="text-xs text-gray-500">{lead.email}</div>}
                                          {lead.company && <div className="text-xs text-gray-500">{lead.company}</div>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Title */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel className="text-sm font-medium">Deal Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter deal title" className="h-10" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Description</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Describe the deal details and opportunity..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                {/* Amount */}
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Amount</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                          <Input {...field} className="pl-8 h-10" placeholder="0.00" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Stage */}
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Stage</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEAL_STAGES.map((stage) => (
                            <SelectItem key={stage.value} value={stage.value}>
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="currency_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Currency</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value ? String(field.value) : undefined}
                      disabled={isLoadingCurrencies || !currencies.length}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder={currencyPlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencies.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.code} — {c.name} ({c.symbol})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs text-gray-500">
                      Amount is stored in the selected currency.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:gap-6 bg-white rounded-xl shadow-sm border p-4 lg:p-6">
              <div className="col-span-1 border-b pb-3 lg:pb-4 mb-2">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-800">{t('newDeal.additional')}</h2>
                <p className="text-xs lg:text-sm text-gray-500 mt-1">Set additional properties for this deal</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                {/* Probability */}
                <FormField
                  control={form.control}
                  name="probability"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between">
                        <FormLabel className="text-sm font-medium">Probability</FormLabel>
                        <span className="text-sm font-medium text-primary">{field.value}%</span>
                      </div>
                      <FormControl>
                        <Input
                          type="range"
                          min="0"
                          max="100"
                          {...field}
                          className="w-full accent-primary h-6 mt-2"
                        />
                      </FormControl>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Valid Until */}
                <FormField
                  control={form.control}
                  name="valid_until"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Valid Until</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className="h-10" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        The date until this deal offer is valid
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Assigned To */}
              <FormField
                control={form.control}
                name="assigned_to_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Assign To</FormLabel>
                    <FormControl>
                      <Popover open={isUserSearchOpen} onOpenChange={setIsUserSearchOpen}>
                        <PopoverTrigger asChild>
                          <div className="w-full">
                            <div className="flex items-center w-full rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-10 px-3 py-2 relative">
                              {selectedUser ? (
                                <div className="flex items-center gap-2 w-full">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                                    {(selectedUser.first_name?.[0] || '?')}{(selectedUser.last_name?.[0] || '')}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {selectedUser.first_name} {selectedUser.last_name}
                                    </span>
                                    {selectedUser.job_title && (
                                      <span className="text-xs text-gray-500">
                                        {selectedUser.job_title}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center text-gray-500 gap-2">
                                  <Search className="h-4 w-4" />
                                  <span>Search and select team member...</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <div className="p-3 border-b">
                            <div className="relative">
                              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                              <Input
                                placeholder="Search team members..."
                                value={userSearchTerm}
                                onChange={(e) => setUserSearchTerm(e.target.value)}
                                className="pl-9 bg-gray-50"
                              />
                            </div>
                          </div>
                          <div className="max-h-[300px] overflow-y-auto">
                            {isLoadingUsers ? (
                              <div className="p-4 text-center">
                                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                                <p className="text-sm text-gray-500">Loading team members...</p>
                              </div>
                            ) : users.length === 0 ? (
                              <div className="p-6 text-center">
                                <div className="rounded-full h-10 w-10 bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                </div>
                                <p className="text-gray-500 mb-1">No team members found</p>
                              </div>
                            ) : (
                              <div className="py-1">
                                {users
                                  .filter(user => 
                                    userSearchTerm === '' || 
                                    `${user.first_name} ${user.last_name}`.toLowerCase().includes(userSearchTerm.toLowerCase())
                                  )
                                  .map((user) => (
                                    <div
                                      key={user.id}
                                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-3"
                                      onClick={() => handleUserSelect(user)}
                                    >
                                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary shrink-0">
                                        {(user.first_name?.[0] || '?')}{(user.last_name?.[0] || '')}
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="font-medium">
                                          {user.first_name} {user.last_name}
                                        </span>
                                        {user.job_title && (
                                          <span className="text-xs text-gray-500">
                                            {user.job_title}
                                          </span>
                                        )}
                                      </div>
                                      {user.is_admin && (
                                        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                          Admin
                                        </span>
                                      )}
                                    </div>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                    <FormDescription className="text-xs">
                      Select the team member who will be responsible for this deal
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 lg:gap-4 bg-white rounded-xl shadow-sm border p-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/deals')}
                className="px-6 order-2 sm:order-1"
              >
                {t('common:cancel')}
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-primary hover:bg-primary/90 text-white px-6 order-1 sm:order-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-white"></span>
                    {t('newDeal.creating')}
                  </>
                ) : (
                  t('newDeal.create')
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </PageContainer>
  );
};

export default NewDealPage;


