import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient, InvalidateQueryFilters } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import api from '@/services/axios';
import { Separator } from '@/components/ui/Separator';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { PageContainer } from '@/components/ui/PageContainer';
import { useAuth } from '@/hooks/useAuth';
import { clientsAPI } from '@/services/api/clients';
interface LeadEditFormProps {
  lead: {
    id: number;
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
    notes: string;
    client_comments: string;
    source: string;
  };
  onClose: () => void;
}

const countryCodes = [
  { value: '+93', label: 'Afghanistan (+93)', format: '## ### ####' },
  { value: '+355', label: 'Albania (+355)', format: '## ### ####' },
  { value: '+213', label: 'Algeria (+213)', format: '### ## ## ##' },
  { value: '+376', label: 'Andorra (+376)', format: '### ###' },
  { value: '+244', label: 'Angola (+244)', format: '### ### ###' },
  { value: '+1264', label: 'Anguilla (+1264)', format: '### ####' },
  { value: '+1268', label: 'Antigua & Barbuda (+1268)', format: '### ####' },
  { value: '+54', label: 'Argentina (+54)', format: '## #### ####' },
  { value: '+374', label: 'Armenia (+374)', format: '## ### ###' },
  { value: '+297', label: 'Aruba (+297)', format: '### ####' },
  { value: '+61', label: 'Australia (+61)', format: '### ### ###' },
  { value: '+43', label: 'Austria (+43)', format: '### ######' },
  { value: '+994', label: 'Azerbaijan (+994)', format: '## ### ## ##' },
  { value: '+1242', label: 'Bahamas (+1242)', format: '### ####' },
  { value: '+973', label: 'Bahrain (+973)', format: '#### ####' },
  { value: '+880', label: 'Bangladesh (+880)', format: '#### ######' },
  { value: '+1246', label: 'Barbados (+1246)', format: '### ####' },
  { value: '+375', label: 'Belarus (+375)', format: '## ### ## ##' },
  { value: '+32', label: 'Belgium (+32)', format: '### ### ###' },
  { value: '+501', label: 'Belize (+501)', format: '### ####' },
  { value: '+229', label: 'Benin (+229)', format: '## ### ###' },
  { value: '+1441', label: 'Bermuda (+1441)', format: '### ####' },
  { value: '+975', label: 'Bhutan (+975)', format: '## ### ###' },
  { value: '+591', label: 'Bolivia (+591)', format: '# ### ####' },
  { value: '+387', label: 'Bosnia Herzegovina (+387)', format: '## ### ###' },
  { value: '+267', label: 'Botswana (+267)', format: '## ### ###' },
  { value: '+55', label: 'Brazil (+55)', format: '## #### ####' },
  { value: '+673', label: 'Brunei (+673)', format: '### ####' },
  { value: '+359', label: 'Bulgaria (+359)', format: '### ### ###' },
  { value: '+226', label: 'Burkina Faso (+226)', format: '## ## ####' },
  { value: '+257', label: 'Burundi (+257)', format: '## ## ####' },
  { value: '+855', label: 'Cambodia (+855)', format: '## ### ###' },
  { value: '+237', label: 'Cameroon (+237)', format: '#### ####' },
  { value: '+1', label: 'Canada (+1)', format: '(###) ###-####' },
  { value: '+238', label: 'Cape Verde Islands (+238)', format: '### ####' },
  { value: '+1345', label: 'Cayman Islands (+1345)', format: '### ####' },
  { value: '+236', label: 'Central African Republic (+236)', format: '## ## ####' },
  { value: '+235', label: 'Chad (+235)', format: '## ## ## ##' },
  { value: '+56', label: 'Chile (+56)', format: '# #### ####' },
  { value: '+86', label: 'China (+86)', format: '### #### ####' },
  { value: '+57', label: 'Colombia (+57)', format: '### ### ####' },
  { value: '+269', label: 'Comoros (+269)', format: '### ####' },
  { value: '+242', label: 'Congo (+242)', format: '## ### ####' },
  { value: '+682', label: 'Cook Islands (+682)', format: '## ###' },
  { value: '+506', label: 'Costa Rica (+506)', format: '#### ####' },
  { value: '+385', label: 'Croatia (+385)', format: '## ### ####' },
  { value: '+53', label: 'Cuba (+53)', format: '# ### ####' },
  { value: '+90392', label: 'Cyprus North (+90392)', format: '### ####' },
  { value: '+357', label: 'Cyprus South (+357)', format: '## ### ###' },
  { value: '+420', label: 'Czech Republic (+420)', format: '### ### ###' },
  { value: '+45', label: 'Denmark (+45)', format: '#### ####' },
  { value: '+253', label: 'Djibouti (+253)', format: '## ## ## ##' },
  { value: '+1809', label: 'Dominican Republic (+1809)', format: '### ####' },
  { value: '+593', label: 'Ecuador (+593)', format: '## ### ####' },
  { value: '+20', label: 'Egypt (+20)', format: '### ### ####' },
  { value: '+503', label: 'El Salvador (+503)', format: '#### ####' },
  { value: '+240', label: 'Equatorial Guinea (+240)', format: '## ### ####' },
  { value: '+291', label: 'Eritrea (+291)', format: '# ### ###' },
  { value: '+372', label: 'Estonia (+372)', format: '### ####' },
  { value: '+251', label: 'Ethiopia (+251)', format: '## ### ####' },
  { value: '+500', label: 'Falkland Islands (+500)', format: '#####' },
  { value: '+298', label: 'Faroe Islands (+298)', format: '### ###' },
  { value: '+679', label: 'Fiji (+679)', format: '## #####' },
  { value: '+358', label: 'Finland (+358)', format: '## ### ####' },
  { value: '+33', label: 'France (+33)', format: '# ## ## ## ##' },
  { value: '+594', label: 'French Guiana (+594)', format: '##### ####' },
  { value: '+689', label: 'French Polynesia (+689)', format: '## ## ##' },
  { value: '+241', label: 'Gabon (+241)', format: '# ## ## ##' },
  { value: '+220', label: 'Gambia (+220)', format: '### ####' },
  { value: '+7880', label: 'Georgia (+7880)', format: '### ## ## ##' },
  { value: '+49', label: 'Germany (+49)', format: '### #######' },
  { value: '+233', label: 'Ghana (+233)', format: '## ### ####' },
  { value: '+350', label: 'Gibraltar (+350)', format: '### #####' },
  { value: '+30', label: 'Greece (+30)', format: '### ######' },
  { value: '+299', label: 'Greenland (+299)', format: '## ## ##' },
  { value: '+1473', label: 'Grenada (+1473)', format: '### ####' },
  { value: '+590', label: 'Guadeloupe (+590)', format: '### ## ## ##' },
  { value: '+671', label: 'Guam (+671)', format: '### ####' },
  { value: '+502', label: 'Guatemala (+502)', format: '#### ####' },
  { value: '+224', label: 'Guinea (+224)', format: '## ### ###' },
  { value: '+245', label: 'Guinea - Bissau (+245)', format: '# ######' },
  { value: '+592', label: 'Guyana (+592)', format: '### ####' },
  { value: '+509', label: 'Haiti (+509)', format: '## ## ####' },
  { value: '+504', label: 'Honduras (+504)', format: '#### ####' },
  { value: '+852', label: 'Hong Kong (+852)', format: '#### ####' },
  { value: '+36', label: 'Hungary (+36)', format: '## ### ####' },
  { value: '+354', label: 'Iceland (+354)', format: '### ####' },
  { value: '+91', label: 'India (+91)', format: '#### ######' },
  { value: '+62', label: 'Indonesia (+62)', format: '## ### ####' },
  { value: '+98', label: 'Iran (+98)', format: '### ### ####' },
  { value: '+964', label: 'Iraq (+964)', format: '### ### ####' },
  { value: '+353', label: 'Ireland (+353)', format: '## #######' },
  { value: '+972', label: 'Israel (+972)', format: '## ### ####' },
  { value: '+39', label: 'Italy (+39)', format: '### ######' },
  { value: '+1876', label: 'Jamaica (+1876)', format: '### ####' },
  { value: '+81', label: 'Japan (+81)', format: '## #### ####' },
  { value: '+962', label: 'Jordan (+962)', format: '# #### ####' },
  { value: '+7', label: 'Kazakhstan (+7)', format: '### ### ####' },
  { value: '+254', label: 'Kenya (+254)', format: '### ######' },
  { value: '+686', label: 'Kiribati (+686)', format: '## ###' },
  { value: '+850', label: 'Korea North (+850)', format: '### ### ###' },
  { value: '+82', label: 'Korea South (+82)', format: '## #### ####' },
  { value: '+965', label: 'Kuwait (+965)', format: '#### ####' },
  { value: '+996', label: 'Kyrgyzstan (+996)', format: '### ### ###' },
  { value: '+856', label: 'Laos (+856)', format: '## ### ###' },
  { value: '+371', label: 'Latvia (+371)', format: '## ### ###' },
  { value: '+961', label: 'Lebanon (+961)', format: '## ### ###' },
  { value: '+266', label: 'Lesotho (+266)', format: '# ### ####' },
  { value: '+231', label: 'Liberia (+231)', format: '## ### ###' },
  { value: '+218', label: 'Libya (+218)', format: '## ### ####' },
  { value: '+417', label: 'Liechtenstein (+417)', format: '### ####' },
  { value: '+370', label: 'Lithuania (+370)', format: '### #####' },
  { value: '+352', label: 'Luxembourg (+352)', format: '### ###' },
  { value: '+853', label: 'Macao (+853)', format: '#### ####' },
  { value: '+389', label: 'Macedonia (+389)', format: '## ### ###' },
  { value: '+261', label: 'Madagascar (+261)', format: '## ## #####' },
  { value: '+265', label: 'Malawi (+265)', format: '# ### ####' },
  { value: '+60', label: 'Malaysia (+60)', format: '## ### ####' },
  { value: '+960', label: 'Maldives (+960)', format: '### ####' },
  { value: '+223', label: 'Mali (+223)', format: '## ## ####' },
  { value: '+356', label: 'Malta (+356)', format: '#### ####' },
  { value: '+692', label: 'Marshall Islands (+692)', format: '### ####' },
  { value: '+596', label: 'Martinique (+596)', format: '### ## ## ##' },
  { value: '+222', label: 'Mauritania (+222)', format: '## ## ####' },
  { value: '+269', label: 'Mayotte (+269)', format: '### ####' },
  { value: '+52', label: 'Mexico (+52)', format: '## #### ####' },
  { value: '+691', label: 'Micronesia (+691)', format: '### ####' },
  { value: '+373', label: 'Moldova (+373)', format: '#### ####' },
  { value: '+377', label: 'Monaco (+377)', format: '## ### ###' },
  { value: '+976', label: 'Mongolia (+976)', format: '## ## ####' },
  { value: '+1664', label: 'Montserrat (+1664)', format: '### ####' },
  { value: '+212', label: 'Morocco (+212)', format: '## ### ####' },
  { value: '+258', label: 'Mozambique (+258)', format: '## ### ####' },
  { value: '+95', label: 'Myanmar (+95)', format: '# ### ####' },
  { value: '+264', label: 'Namibia (+264)', format: '## ### ####' },
  { value: '+674', label: 'Nauru (+674)', format: '### ####' },
  { value: '+977', label: 'Nepal (+977)', format: '## ### ###' },
  { value: '+31', label: 'Netherlands (+31)', format: '## ########' },
  { value: '+687', label: 'New Caledonia (+687)', format: '## ####' },
  { value: '+64', label: 'New Zealand (+64)', format: '## ### ####' },
  { value: '+505', label: 'Nicaragua (+505)', format: '#### ####' },
  { value: '+227', label: 'Niger (+227)', format: '## ## ####' },
  { value: '+234', label: 'Nigeria (+234)', format: '## ### ####' },
  { value: '+683', label: 'Niue (+683)', format: '####' },
  { value: '+672', label: 'Norfolk Islands (+672)', format: '### ###' },
  { value: '+670', label: 'Northern Marianas (+670)', format: '### ####' },
  { value: '+47', label: 'Norway (+47)', format: '### ## ###' },
  { value: '+968', label: 'Oman (+968)', format: '## ### ###' },
  { value: '+92', label: 'Pakistan (+92)', format: '### ### ####' },
  { value: '+680', label: 'Palau (+680)', format: '### ####' },
  { value: '+507', label: 'Panama (+507)', format: '### ####' },
  { value: '+675', label: 'Papua New Guinea (+675)', format: '### ####' },
  { value: '+595', label: 'Paraguay (+595)', format: '### ######' },
  { value: '+51', label: 'Peru (+51)', format: '### ### ###' },
  { value: '+63', label: 'Philippines (+63)', format: '### ### ####' },
  { value: '+48', label: 'Poland (+48)', format: '### ### ###' },
  { value: '+351', label: 'Portugal (+351)', format: '### ### ###' },
  { value: '+1787', label: 'Puerto Rico (+1787)', format: '### ####' },
  { value: '+974', label: 'Qatar (+974)', format: '#### ####' },
  { value: '+262', label: 'Reunion (+262)', format: '### ## ## ##' },
  { value: '+40', label: 'Romania (+40)', format: '## ### ####' },
  { value: '+7', label: 'Russia (+7)', format: '### ### ####' },
  { value: '+250', label: 'Rwanda (+250)', format: '### ### ###' },
  { value: '+378', label: 'San Marino (+378)', format: '#### ######' },
  { value: '+239', label: 'Sao Tome & Principe (+239)', format: '## #####' },
  { value: '+966', label: 'Saudi Arabia (+966)', format: '## ### ####' },
  { value: '+221', label: 'Senegal (+221)', format: '## ### ####' },
  { value: '+381', label: 'Serbia (+381)', format: '## ### ####' },
  { value: '+248', label: 'Seychelles (+248)', format: '# ### ###' },
  { value: '+232', label: 'Sierra Leone (+232)', format: '## ### ###' },
  { value: '+65', label: 'Singapore (+65)', format: '#### ####' },
  { value: '+421', label: 'Slovak Republic (+421)', format: '### ### ###' },
  { value: '+386', label: 'Slovenia (+386)', format: '## ### ###' },
  { value: '+677', label: 'Solomon Islands (+677)', format: '### ####' },
  { value: '+252', label: 'Somalia (+252)', format: '## ### ###' },
  { value: '+27', label: 'South Africa (+27)', format: '## ### ####' },
  { value: '+34', label: 'Spain (+34)', format: '### ### ###' },
  { value: '+94', label: 'Sri Lanka (+94)', format: '## ### ####' },
  { value: '+290', label: 'St. Helena (+290)', format: '####' },
  { value: '+1869', label: 'St. Kitts (+1869)', format: '### ####' },
  { value: '+1758', label: 'St. Lucia (+1758)', format: '### ####' },
  { value: '+249', label: 'Sudan (+249)', format: '## ### ####' },
  { value: '+597', label: 'Suriname (+597)', format: '### ###' },
  { value: '+268', label: 'Swaziland (+268)', format: '## ## ####' },
  { value: '+46', label: 'Sweden (+46)', format: '## ### ####' },
  { value: '+41', label: 'Switzerland (+41)', format: '## ### ####' },
  { value: '+963', label: 'Syria (+963)', format: '## ### ####' },
  { value: '+886', label: 'Taiwan (+886)', format: '### ### ###' },
  { value: '+7', label: 'Tajikstan (+7)', format: '### ### ####' },
  { value: '+66', label: 'Thailand (+66)', format: '## ### ####' },
  { value: '+228', label: 'Togo (+228)', format: '## ### ###' },
  { value: '+676', label: 'Tonga (+676)', format: '### ##' },
  { value: '+1868', label: 'Trinidad & Tobago (+1868)', format: '### ####' },
  { value: '+216', label: 'Tunisia (+216)', format: '## ### ###' },
  { value: '+90', label: 'Turkey (+90)', format: '### ### ## ##' },
  { value: '+7', label: 'Turkmenistan (+7)', format: '### ### ####' },
  { value: '+993', label: 'Turkmenistan (+993)', format: '## ### ###' },
  { value: '+1649', label: 'Turks & Caicos Islands (+1649)', format: '### ####' },
  { value: '+688', label: 'Tuvalu (+688)', format: '## ###' },
  { value: '+256', label: 'Uganda (+256)', format: '### ### ###' },
  { value: '+380', label: 'Ukraine (+380)', format: '## ### ####' },
  { value: '+971', label: 'United Arab Emirates (+971)', format: '## ### ####' },
  { value: '+44', label: 'United Kingdom (+44)', format: '#### ######' },
  { value: '+1', label: 'United States (+1)', format: '(###) ###-####' },
  { value: '+598', label: 'Uruguay (+598)', format: '#### ####' },
  { value: '+7', label: 'Uzbekistan (+7)', format: '### ### ####' },
  { value: '+678', label: 'Vanuatu (+678)', format: '## #####' },
  { value: '+379', label: 'Vatican City (+379)', format: '## ### ####' },
  { value: '+58', label: 'Venezuela (+58)', format: '### ### ####' },
  { value: '+84', label: 'Vietnam (+84)', format: '## #### ####' },
  { value: '+1284', label: 'Virgin Islands - British (+1284)', format: '### ####' },
  { value: '+1340', label: 'Virgin Islands - US (+1340)', format: '### ####' },
  { value: '+681', label: 'Wallis & Futuna (+681)', format: '## ####' },
  { value: '+969', label: 'Yemen (North)(+969)', format: '### ### ###' },
  { value: '+967', label: 'Yemen (South)(+967)', format: '### ### ###' },
  { value: '+260', label: 'Zambia (+260)', format: '## ### ####' },
  { value: '+263', label: 'Zimbabwe (+263)', format: '## ### ####' }
].sort((a, b) => a.label.localeCompare(b.label));

const sectors = [
  'Technology',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Education',
  'Real Estate',
  'Energy',
  'Transportation',
  'Media',
  'Other'
] as const;

const formSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  company: z.string().optional(),
  job_title: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  telephone: z.string().optional(),
  mobile: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  sector: z.enum(sectors).optional(),
  notes: z.string().optional(),
  client_comments: z.string().optional(),
  source: z.string().optional(),
  client_id: z.number().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface LeadFormData {
  first_name: string;
  last_name: string;
  company: string;
  job_title: string;
  email: string;
  telephone?: string;
  mobile?: string;
  location?: string;
  country?: string;
  linkedin?: string;
  website?: string;
  sector?: string;
  notes?: string;
  client_comments?: string;
  source?: string;
}

const formatPhoneNumber = (value: string, format: string = '### ### ####') => {
  // Remove all non-digit characters
  const cleaned = value.replace(/\D/g, '');
  
  let result = format;
  let index = 0;

  // Replace each # in the format with a digit
  while (result.includes('#') && index < cleaned.length) {
    result = result.replace('#', cleaned[index]);
    index++;
  }

  // Remove any remaining # placeholders
  result = result.replace(/#/g, '');
  
  return result.trim();
};

export function LeadForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsAPI.list(false),
  });
  const activeClients = clientsData?.items ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      company: '',
      job_title: '',
      email: '',
      telephone: '',
      mobile: '',
      location: '',
      country: '',
      linkedin: '',
      website: '',
      sector: undefined,
      notes: '',
      client_comments: '',
      source: '',
      client_id: null,
    },
  });

  useEffect(() => {
    if (form.getValues('client_id') != null || activeClients.length === 0) return;
    const general = activeClients.find((c) => c.is_default) ?? activeClients[0];
    form.setValue('client_id', general.id);
  }, [activeClients, form]);

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: FormValues) => {
    try {
      if (!user) {
        toast.error('User session not found');
        return;
      }

      const general = activeClients.find((c) => c.is_default);
      const leadData = {
        ...data,
        client_id: data.client_id ?? general?.id ?? undefined,
        organization_id: Number(user.organization_id),
        user_id: Number(user.id),
        created_by: Number(user.id),
        is_deleted: false,
        visible: true,
        created_at: new Date().toISOString(),
        tags: [] as number[],
      };

      const response = await api.post('/leads', leadData);
      
      if (response.data.success) {
        toast.success('Lead created successfully');
        await queryClient.invalidateQueries({ queryKey: ['leads'] });
        navigate('/leads');
      } else {
        console.error('Lead creation failed:', response.data);
        toast.error(response.data.message || 'Failed to create lead');
      }
    } catch (error: any) {
      console.error('Error creating lead:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error stack:', error.stack);
      
      // Show more detailed error message to the user
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.message || 
                          error.message || 
                          'Failed to create lead';
      
      toast.error(`Error: ${errorMessage}`);
    }
  };

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto py-4 lg:py-8 px-3 lg:px-0">
                  <div className="flex items-center justify-between mb-6 lg:mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/leads')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Leads
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div>
              <h1 className="text-2xl font-semibold">New Lead</h1>
              <p className="text-sm text-gray-500">Create a new lead in your pipeline</p>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 lg:space-y-8">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-700 flex items-center gap-1">
                <span className="text-red-500 font-bold">*</span>
                Fields marked with an asterisk are required
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Enter the lead's basic contact information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client</FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : undefined}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full bg-white border-2 border-gray-200">
                            <SelectValue placeholder="General (skip / default)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeClients.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.is_default ? 'General (skip / default)' : c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-gray-500">
                        Defaults to General if you skip selection
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          First Name
                          <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          Required field
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          Last Name
                          <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          Required field
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          Company
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Inc." {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          Optional - Company name
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="job_title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          Job Title
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Sales Manager" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500">
                          Optional - Job title or position
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john.doe@example.com" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500">
                        Optional - Valid email address
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contact Details</CardTitle>
                <CardDescription>Additional contact information and social profiles.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="telephone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Select 
                              defaultValue="+90"
                              onValueChange={(value) => {
                                // Store the country code in a data attribute
                                const input = document.getElementById('telephone-input');
                                if (input) {
                                  input.dataset.countryCode = value;
                                }
                              }}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Code" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px] overflow-y-auto">
                                {countryCodes.map((cc) => (
                                  <SelectItem key={cc.value} value={cc.value}>
                                    {cc.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              id="telephone-input"
                              type="tel"
                              className="flex-1"
                              placeholder="Enter number"
                              {...field}
                              onChange={(e) => {
                                const countryCode = e.currentTarget.dataset.countryCode || '+90';
                                const format = countryCodes.find(cc => cc.value === countryCode)?.format || '### ### ####';
                                const formatted = formatPhoneNumber(e.target.value, format);
                                field.onChange(formatted);
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          Select country code first, then enter the number
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mobile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobile</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Select 
                              defaultValue="+90"
                              onValueChange={(value) => {
                                // Store the country code in a data attribute
                                const input = document.getElementById('mobile-input');
                                if (input) {
                                  input.dataset.countryCode = value;
                                }
                              }}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Code" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px] overflow-y-auto">
                                {countryCodes.map((cc) => (
                                  <SelectItem key={cc.value} value={cc.value}>
                                    {cc.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              id="mobile-input"
                              type="tel"
                              className="flex-1"
                              placeholder="Enter number"
                              {...field}
                              onChange={(e) => {
                                const countryCode = e.currentTarget.dataset.countryCode || '+90';
                                const format = countryCodes.find(cc => cc.value === countryCode)?.format || '### ### ####';
                                const formatted = formatPhoneNumber(e.target.value, format);
                                field.onChange(formatted);
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          Select country code first, then enter the number
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input placeholder="City, State" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input placeholder="Country" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="linkedin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LinkedIn Profile</FormLabel>
                        <FormControl>
                          <Input placeholder="https://linkedin.com/in/username" {...field} />
                        </FormControl>
                        <FormDescription>
                          Full LinkedIn profile URL
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" {...field} />
                        </FormControl>
                        <FormDescription>
                          Company or personal website
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
                <CardDescription>Other relevant details about the lead.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="sector"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel className="text-base font-semibold">Sector</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full bg-white border-2 border-gray-200 hover:border-gray-300 transition-colors">
                            <SelectValue placeholder="Select a sector" className="text-gray-500" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[300px]">
                          {sectors.map((sector) => (
                            <SelectItem 
                              key={sector} 
                              value={sector}
                              className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 py-2 px-4"
                            >
                              {sector}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-sm text-gray-500 mt-1.5">
                        The industry sector of the lead's company
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any additional notes about the lead..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="client_comments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Comments</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any client comments about the lead..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source</FormLabel>
                      <FormControl>
                        <Input placeholder="How did you find this lead?" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => navigate('/leads')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Lead...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Create Lead
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>
      </div>
    </PageContainer>
  );
}

export const LeadEditForm: React.FC<LeadEditFormProps> = ({ lead, onClose }) => {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<LeadFormData>({
    defaultValues: {
      first_name: lead.first_name,
      last_name: lead.last_name,
      company: lead.company,
      job_title: lead.job_title,
      location: lead.location,
      country: lead.country,
      email: lead.email,
      telephone: lead.telephone,
      mobile: lead.mobile,
      linkedin: lead.linkedin,
      website: lead.website,
      sector: lead.sector,
      notes: lead.notes,
      client_comments: lead.client_comments,
      source: lead.source,
    }
  });

  const [phoneCountryCode, setPhoneCountryCode] = useState('+90');
  const [mobileCountryCode, setMobileCountryCode] = useState('+90');

  const onSubmit = async (data: LeadFormData) => {
    try {
      // Combine country codes with phone numbers
      const formData = {
        ...data,
        telephone: data.telephone ? `${phoneCountryCode}${data.telephone}` : '',
        mobile: data.mobile ? `${mobileCountryCode}${data.mobile}` : ''
      };
      
      await api.put(`/leads/${lead.id}`, formData);
      toast.success('Lead updated successfully');
      // Invalidate and refetch leads query
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      onClose();
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Failed to update lead');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">First Name</label>
          <Input {...register('first_name', { required: 'First name is required' })} />
          {errors.first_name && <p className="text-red-500 text-sm">{errors.first_name.message}</p>}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Last Name</label>
          <Input {...register('last_name', { required: 'Last name is required' })} />
          {errors.last_name && <p className="text-red-500 text-sm">{errors.last_name.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Company</label>
        <Input {...register('company', { required: 'Company is required' })} />
        {errors.company && <p className="text-red-500 text-sm">{errors.company.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Job Title</label>
        <Input {...register('job_title', { required: 'Job title is required' })} />
        {errors.job_title && <p className="text-red-500 text-sm">{errors.job_title.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Location</label>
          <Input {...register('location')} />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Country</label>
          <Input {...register('country')} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <Input {...register('email', { 
          pattern: {
            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
            message: "Invalid email address"
          }
        })} />
        {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <div className="flex gap-2">
            <Select value={phoneCountryCode} onValueChange={setPhoneCountryCode}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Code" />
              </SelectTrigger>
              <SelectContent>
                {countryCodes.map((cc) => (
                  <SelectItem key={cc.value} value={cc.value}>
                    {cc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input 
              {...register('telephone')} 
              className="flex-1"
              onChange={(e) => {
                const formatted = formatPhoneNumber(e.target.value);
                register('telephone').onChange({
                  target: { value: formatted, name: 'telephone' }
                });
              }}
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Mobile</label>
          <div className="flex gap-2">
            <Select value={mobileCountryCode} onValueChange={setMobileCountryCode}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Code" />
              </SelectTrigger>
              <SelectContent>
                {countryCodes.map((cc) => (
                  <SelectItem key={cc.value} value={cc.value}>
                    {cc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input 
              {...register('mobile')} 
              className="flex-1"
              onChange={(e) => {
                const formatted = formatPhoneNumber(e.target.value);
                register('mobile').onChange({
                  target: { value: formatted, name: 'mobile' }
                });
              }}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">LinkedIn</label>
        <Input {...register('linkedin')} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Website</label>
        <Input {...register('website')} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Sector</label>
        <Input {...register('sector')} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          {...register('notes')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Client Comments</label>
        <textarea
          {...register('client_comments')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Source</label>
        <Input {...register('source')} />
      </div>

      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">
          Save Changes
        </Button>
      </div>
    </form>
  );
};
