import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/axios';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loader2, Mail, Phone, Globe, MapPin, Building2, Briefcase, Calendar, Clock, User, Users, FileText, BarChart, ArrowLeft, Edit, Trash2, ExternalLink, Share2, Heart, Star, BookOpen, MessageSquare, Copy, Download, PieChart, CheckCircle2, AlertCircle, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { informationRequestsAPI } from '@/services/api/information-requests';
import { TagSelector } from '@/components/Tag';
import { useState, useEffect } from 'react';
import { LeadEditForm } from '@/components/LeadEditForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { CommunicationPanel } from '@/components/CommunicationPanel';
import { linkedinAPI } from '@/services/linkedin';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { extractLinkedInProfileId } from '@/utils/linkedin';
import LeadAIInsights from '@/components/leads/LeadAIInsights';
import PsychometricInsights from '@/components/leads/PsychometricInsights';
import { LinkedInConnectionDialog } from '@/components/ui/LinkedInConnectionDialog';
import { Textarea } from '@/components/ui/Textarea';
import { useAuthStore } from '@/store/auth';

interface InfoFieldProps {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
  type?: 'text' | 'link' | 'multiline' | 'json';
  leadId: number;
  fieldName: string;
  email_guidelines?: string | null;
}

// Add URL shortener helper function
const shortenLinkedInUrl = (url: string | null | undefined): { displayUrl: string; fullUrl: string } | null => {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('linkedin.com')) return { displayUrl: url, fullUrl: url };

    // Extract username or company name from different LinkedIn URL formats
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      const identifier = pathParts[pathParts.length - 1];
      // Remove any random strings or numbers at the end (common in LinkedIn URLs)
      const cleanIdentifier = identifier.replace(/[-_]\w+$/, '');
      return {
        displayUrl: cleanIdentifier,
        fullUrl: url
      };
    }
    
    return { displayUrl: 'linkedin', fullUrl: url };
  } catch {
    return { displayUrl: url, fullUrl: url };
  }
};

const InfoField = ({ label, value, icon, type = 'text', leadId, fieldName, email_guidelines }: InfoFieldProps) => {
  const queryClient = useQueryClient();
  const queryKey = ['information-requests', leadId, fieldName];

  // Query to get existing request for this field
  const { data: existingRequest, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await informationRequestsAPI.getLeadRequests(leadId);
      return response.find((request) => request.field_name === fieldName);
    },
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  const requestInfoMutation = useMutation({
    mutationFn: async () => {
      return await informationRequestsAPI.create({
        lead_id: leadId,
        field_name: fieldName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Information request sent');
    },
    onError: (error: any) => {
      let errorMessage = 'Failed to send information request';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      toast.error(errorMessage);
    }
  });

  const getRequestButtonStyle = () => {
    if (isLoading) return 'bg-gray-400';
    
    switch (existingRequest?.status) {
      case 'pending':
        return 'bg-yellow-500 hover:bg-yellow-600';
      case 'in_progress':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'completed':
        return 'bg-green-500 hover:bg-green-600';
      case 'rejected':
        return 'bg-red-500 hover:bg-red-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const getRequestButtonText = () => {
    if (isLoading) return 'Loading...';
    if (requestInfoMutation.isPending) return 'Sending...';
    
    if (!existingRequest) return 'Request Info';
    
    const statusMap: { [key: string]: string } = {
      pending: 'Request Pending',
      in_progress: 'In Progress',
      completed: 'Information Received',
      rejected: 'Request Rejected'
    };
    return statusMap[existingRequest.status] || 'Request Info';
  };

  const getStatusIcon = () => {
    if (!existingRequest) return null;
    
    switch (existingRequest.status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const displayValue = value && value !== 'nan' && value.trim() !== '' ? value : null;
  // client_comments alanı için request info butonu göstermeyelim
  const isClientComments = fieldName === 'client_comments';

  return (
    <div className="group space-y-1.5 rounded-md p-2 transition-all hover:bg-gray-50">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="min-h-[1.5rem]">
        {displayValue ? (
          type === 'link' ? (
            <div className="flex items-center space-x-2">
              <a
                href={displayValue}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline flex items-center"
              >
                {fieldName === 'linkedin' 
                  ? shortenLinkedInUrl(displayValue)?.displayUrl || displayValue
                  : displayValue}
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(displayValue);
                  toast.success('Link copied to clipboard');
                }}
                className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : type === 'multiline' ? (
            <p className="whitespace-pre-wrap text-gray-700">{displayValue}</p>
          ) : type === 'json' ? (
            <pre className="bg-gray-50 p-3 rounded-md overflow-x-auto text-sm">
              {JSON.stringify(JSON.parse(displayValue), null, 2)}
            </pre>
          ) : (
            <p className="text-gray-700">{displayValue}</p>
          )
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">
              {isClientComments ? "Add a note for this lead" : "No data available"}
            </span>
            {!isClientComments && (
              <div className="flex items-center gap-1">
                {getStatusIcon()}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!existingRequest && !isLoading) {
                      requestInfoMutation.mutate();
                    }
                  }}
                  className={`text-xs h-7 px-2 ${getRequestButtonStyle()} text-white transition-colors duration-200`}
                  disabled={isLoading || !!existingRequest || requestInfoMutation.isPending}
                >
                  {getRequestButtonText()}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// LinkedIn actions için yeni bir component
const LinkedInActions = ({ linkedinUrl }: { linkedinUrl: string }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [message, setMessage] = useState('');

  // LinkedIn bağlantı durumunu kontrol et
  const { data: linkedinStatus } = useQuery({
    queryKey: ['linkedin-status'],
    queryFn: async () => {
      const response = await api.get('/linkedin/status');
      return response.data;
    }
  });

  // LinkedIn ile bağlan
  const handleConnect = () => {
    setIsLoading(true);
    try {
      linkedinAPI.authorize();
    } catch (error) {
      toast.error('Failed to connect to LinkedIn');
      setIsLoading(false);
    }
  };

  // LinkedIn mesajı gönder
  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      return linkedinAPI.sendMessage(linkedinUrl, messageText);
    },
    onSuccess: () => {
      toast.success('Message sent successfully');
      setIsMessageOpen(false);
      setMessage('');
    },
    onError: () => {
      toast.error('Failed to send message');
    }
  });

  // LinkedIn bağlantı isteği gönder
  const sendConnectionMutation = useMutation({
    mutationFn: async () => {
      return linkedinAPI.sendConnection(linkedinUrl);
    },
    onSuccess: () => {
      toast.success('Connection request sent');
    },
    onError: () => {
      toast.error('Failed to send connection request');
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!linkedinStatus?.connected) {
    return (
      <div className="text-center p-4">
        <p className="text-sm text-gray-500">
          Connect your LinkedIn account in Profile to use these features
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMessageOpen(true)}
          disabled={sendMessageMutation.isPending}
          className="hover:bg-blue-500 hover:text-white transition-colors duration-200"
        >
          <Mail className="w-4 h-4 mr-2" />
          Send Message
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => sendConnectionMutation.mutate()}
          disabled={sendConnectionMutation.isPending}
          className="hover:bg-blue-500 hover:text-white transition-colors duration-200"
        >
          <Users className="w-4 w-4 mr-2" />
          Connect
        </Button>
      </div>

      <Dialog open={isMessageOpen} onOpenChange={setIsMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send LinkedIn Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <textarea
              className="w-full p-2 border rounded-md"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsMessageOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => sendMessageMutation.mutate(message)}
              disabled={!message.trim() || sendMessageMutation.isPending}
              className="hover:bg-blue-600 transition-colors"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                'Send'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const leadId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [linkedinDialogOpen, setLinkedinDialogOpen] = useState(false);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [linkedinConnectionData, setLinkedinConnectionData] = useState<{
    connectionUrl: string;
    message?: string;
    leadName: string;
  } | null>(null);
  const [isLoadingLinkedin, setIsLoadingLinkedin] = useState(false);
  const { user } = useAuthStore();

  // Location state'ten gelen scroll pozisyonu ve from değerlerini al
  const fromLeadList = location.state?.from === 'leadList';
  const savedScrollPosition = location.state?.scrollPosition;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('edit') === '1') {
      setIsEditModalOpen(true);
    }
  }, [location.search]);

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    if (new URLSearchParams(location.search).get('edit') === '1' && id) {
      navigate(`/leads/${id}`, { replace: true, state: location.state });
    }
  };

  // Scroll event handler to hide/show header
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const { data: response, isLoading, error, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      if (!id) throw new Error('Lead ID is required');
      try {
        // Ensure the URL has a trailing slash to prevent redirection issues
        const response = await api.get(`/leads/${id}/`);
        return response.data;
      } catch (error: any) {
        console.error('Error fetching lead:', error);
        if (error.response?.status === 404) {
          throw new Error('Lead not found');
        } else if (error.response?.status === 401) {
          console.error('Authentication error:', error.response?.data);
          throw new Error(`Unauthorized access: ${error.response?.data?.detail || 'Authentication failed'}`);
        } else if (error.request) {
          // Request was made but no response received
          console.error('No response received:', error.request);
          throw new Error('No response from server. Check network connection.');
        }
        throw new Error(`Failed to fetch lead details: ${error.message}`);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (leadId: number) => {
      // First request without confirmation
      let response = await api.delete(`/leads/${leadId}`);
      
      // If confirmation is required, send second request with confirmation
      if (response.data.data?.requires_confirmation) {
        response = await api.delete(`/leads/${leadId}?confirm=true`);
      }
      
      return response.data;
    },
    onSuccess: () => {
      toast.success('Lead deleted successfully');
      // Invalidate and refetch leads list
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      navigate('/leads');
    },
    onError: (error: any) => {
      console.error('Error deleting lead:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete lead');
    }
  });

  const { data: notesResponse } = useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: async () => {
      const res = await api.get('/notes', {
        params: {
          organization_id: response?.data?.organization_id,
          lead_id: leadId,
          limit: 20,
        },
      });
      return res.data;
    },
    enabled: Boolean(response?.data?.organization_id && leadId),
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return api.post('/notes', {
        content,
        lead_id: leadId,
        organization_id: response?.data?.organization_id,
        created_by_id: user?.id ?? 0,
      });
    },
    onSuccess: () => {
      toast.success('Note added successfully');
      setNewNote('');
      setIsAddNoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to add note');
    },
  });

  const handleLinkedInConnect = async () => {
    // Check if response and response.data exist
    if (!response?.data?.linkedin) {
      toast.error("No LinkedIn profile found for this lead");
      return;
    }

    setIsLoadingLinkedin(true);

    try {
      const linkedinUrl = response.data.linkedin;
      const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
      
      console.log("LinkedIn URL details:", {
        isString: typeof linkedinUrl === 'string',
        length: linkedinUrl?.length,
        includesLinkedIn: linkedinUrl?.includes('linkedin.com'),
        url: linkedinUrl
      });
      
      // Get LinkedIn connection link from API
      const connectionResponse = await linkedinAPI.sendConnection(linkedinUrl);
      
      if (connectionResponse.success && connectionResponse.connection_url) {
        // Set dialog data and open dialog
        setLinkedinConnectionData({
          connectionUrl: connectionResponse.connection_url,
          message: connectionResponse.note,
          leadName: leadName || 'Lead'
        });
        setLinkedinDialogOpen(true);
      } else {
        toast.error('Failed to generate LinkedIn connection link');
      }
    } catch (error: any) {
      console.error("LinkedIn connection error:", error);
      
      // Handle specific error cases
      if (error?.response?.status === 401) {
        toast.error("LinkedIn authentication required. Please connect your LinkedIn account first.");
      } else if (error?.response?.status === 400) {
        toast.error(`Invalid request: ${error?.response?.data?.detail || "Check the LinkedIn URL"}`);
      } else if (error?.response?.status === 429) {
        toast.error("Rate limit exceeded. Please try again later.");
      } else {
        toast.error(error?.message || "Failed to generate LinkedIn connection link");
      }
    } finally {
      setIsLoadingLinkedin(false);
    }
  };

  const handleLinkedInDialogConfirm = () => {
    if (linkedinConnectionData?.connectionUrl) {
      window.open(linkedinConnectionData.connectionUrl, '_blank');
      toast.success('LinkedIn connection page opened! Send your request there.');
    }
  };

  // Leads listesine dönüş fonksiyonu
  const navigateBackToList = () => {
    // Lead ID'sini sessionStorage'a kaydet
    sessionStorage.setItem('lastViewedLeadId', id || '');
    
    // Detay sayfasından döndüğümüzü belirten bir flag ayarla
    sessionStorage.setItem('returnToLeadList', 'true');
    
    // Eğer scroll pozisyonu varsa kullan
    if (savedScrollPosition) {
      sessionStorage.setItem('leadListScrollPosition', savedScrollPosition.toString());
    }
    
    // Leads sayfasına yönlendir
    navigate('/leads');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="mt-4 text-gray-500 animate-pulse">Loading lead information...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4 bg-gray-50 p-8 rounded-lg border border-gray-200 shadow-sm mx-auto max-w-md">
        <AlertCircle className="w-16 h-16 text-red-500" />
        <div className="text-red-500 font-semibold text-lg text-center">Error: {error instanceof Error ? error.message : 'Unknown error'}</div>
        <p className="text-gray-500 text-center">We couldn't retrieve the lead information. Please try again or contact support if the problem persists.</p>
        <Button 
          variant="default" 
          onClick={navigateBackToList}
          className="mt-4 transition-all hover:scale-105"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Leads
        </Button>
      </div>
    );
  }

  if (!response?.data) return <div>Lead not found</div>;

  const lead = response.data;
  const initials = `${lead.first_name?.[0] || ''}${lead.last_name?.[0] || ''}`;

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this lead?')) {
      deleteMutation.mutate(leadId);
    }
  };

  const personalInfo = [
    { label: 'First Name', value: lead.first_name, icon: <User size={16} />, fieldName: 'first_name', type: 'text' as const },
    { label: 'Last Name', value: lead.last_name, icon: <User size={16} />, fieldName: 'last_name', type: 'text' as const },
    { label: 'Email', value: lead.email, icon: <Mail size={16} />, fieldName: 'email', type: 'text' as const, email_guidelines: lead.email_guidelines || null },
    { label: 'Telephone', value: lead.telephone, icon: <Phone size={16} />, fieldName: 'telephone', type: 'text' as const },
    { label: 'Mobile', value: lead.mobile, icon: <Phone size={16} />, fieldName: 'mobile', type: 'text' as const }
  ];

  const professionalInfo = [
    { label: 'Company', value: lead.company, icon: <Building2 size={16} />, fieldName: 'company', type: 'text' as const },
    { label: 'Job Title', value: lead.job_title, icon: <Briefcase size={16} />, fieldName: 'job_title', type: 'text' as const },
    { label: 'Time in Current Role', value: lead.time_in_current_role, icon: <Clock size={16} />, fieldName: 'time_in_current_role', type: 'text' as const },
    { label: 'Sector', value: lead.sector, icon: <Users size={16} />, fieldName: 'sector', type: 'text' as const }
  ];

  const locationInfo = [
    { label: 'Location', value: lead.location, icon: <MapPin size={16} />, fieldName: 'location', type: 'text' as const },
    { label: 'Country', value: lead.country, icon: <Globe size={16} />, fieldName: 'country', type: 'text' as const },
    { label: 'LinkedIn', value: lead.linkedin, icon: <Globe size={16} />, type: 'link' as const, fieldName: 'linkedin' },
    { label: 'Website', value: lead.website, icon: <Globe size={16} />, type: 'link' as const, fieldName: 'website' }
  ];

  const analysisInfo = [
    { label: 'Lab Comments', value: lead.lab_comments, icon: <FileText size={16} />, type: 'multiline' as const, fieldName: 'lab_comments' },
    { label: 'Note', value: lead.client_comments, icon: <FileText size={16} />, type: 'multiline' as const, fieldName: 'client_comments' },
    { label: 'WPI: Wealth Prediction Indicator', value: lead.wpi?.toString(), icon: <BarChart size={16} />, type: 'text' as const, fieldName: 'wpi' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Sticky Header */}
      <div 
        className={cn(
          "bg-white border-b border-gray-200 transition-all duration-300 sticky top-0 z-50",
          headerVisible ? "transform-none" : "-translate-y-full"
        )}
      >
        <div className="container mx-auto py-3 px-3 lg:px-4 max-w-7xl flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateBackToList}
              className="text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 bg-primary/10 text-primary shadow-sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <h3 className="text-base font-medium truncate max-w-[180px] md:max-w-xs">
                {lead.first_name} {lead.last_name}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Edit className="w-3.5 h-3.5 mr-1" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success('Link copied to clipboard');
              }}
              className="text-gray-500 hover:text-gray-800"
            >
              <Copy className="w-4 h-4 mr-1" />
              Copy link
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto py-4 lg:py-6 px-3 lg:px-4 max-w-7xl space-y-4 lg:space-y-6">
        {/* Hero Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                      <div className="bg-gradient-to-r from-primary/10 to-blue-50 p-4 md:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 bg-primary/20 text-primary shadow border-2 border-white">
                  <AvatarFallback className="text-xl font-medium">{initials}</AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                    {lead.first_name} {lead.last_name}
                    {lead.source && (
                      <Badge variant="outline" className="ml-2">
                        {lead.source}
                      </Badge>
                    )}
                  </h1>
                  <div className="flex items-center gap-2 mt-1 text-gray-500">
                    {lead.job_title && (
                      <span className="flex items-center">
                        <Briefcase className="w-4 h-4 mr-1" />
                        {lead.job_title}
                      </span>
                    )}
                    {lead.company && (
                      <span className="flex items-center">
                        <span className="mx-2">•</span>
                        <Building2 className="w-4 h-4 mr-1" />
                        {lead.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleLinkedInConnect}
                  disabled={!lead.linkedin || isLoadingLinkedin}
                  className={cn(
                    "transition-all",
                    lead.linkedin ? "hover:bg-[#0077B5] hover:text-white" : "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isLoadingLinkedin ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    "Connect on LinkedIn"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => lead.linkedin ? window.open(lead.linkedin, '_blank') : null}
                  disabled={!lead.linkedin}
                  className={cn(
                    "transition-all",
                    lead.linkedin ? "hover:bg-gray-100" : "opacity-50 cursor-not-allowed"
                  )}
                >
                  View Profile
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Lead
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {personalInfo.map((info, index) => (
                <InfoField
                  key={index}
                  label={info.label}
                  value={info.value}
                  icon={info.icon}
                  type={info.type || 'text'}
                  leadId={leadId}
                  fieldName={info.fieldName}
                  email_guidelines={info.email_guidelines}
                />
              ))}
            </CardContent>
          </Card>

          {/* Professional Information */}
          <Card>
            <CardHeader>
              <CardTitle>Professional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {professionalInfo.map((info, index) => (
                <InfoField
                  key={index}
                  label={info.label}
                  value={info.value}
                  icon={info.icon}
                  type={info.type || 'text'}
                  leadId={leadId}
                  fieldName={info.fieldName}
                />
              ))}
            </CardContent>
          </Card>

          {/* Location & Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Location & Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {locationInfo.map((info, index) => (
                <InfoField
                  key={index}
                  label={info.label}
                  value={info.value}
                  icon={info.icon}
                  type={info.type || 'text'}
                  leadId={leadId}
                  fieldName={info.fieldName}
                />
              ))}
            </CardContent>
          </Card>

          {/* AI Insights */}
          <div className="lg:col-span-1">
            <LeadAIInsights leadId={leadId} leadName={`${lead.first_name} ${lead.last_name}`} />
          </div>

          {/* Analysis Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Analysis Information</CardTitle>
                <Button size="sm" onClick={() => setIsAddNoteOpen(true)}>
                  Add a note
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-0">
              {analysisInfo.map((info, index) => (
                <InfoField
                  key={index}
                  label={info.label}
                  value={info.value}
                  icon={info.icon}
                  type={info.type || 'text'}
                  leadId={leadId}
                  fieldName={info.fieldName}
                />
              ))}
              <div className="mt-4 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Lead Notes</h4>
                <div className="space-y-2">
                  {(notesResponse?.items || []).length === 0 ? (
                    <p className="text-sm text-gray-500">No notes yet.</p>
                  ) : (
                    notesResponse.items.map((note: any) => (
                      <div key={note.id} className="rounded-md bg-gray-50 p-3 border text-sm text-gray-700">
                        {note.content}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Psychometric Insights - Full Width */}
        <div className="w-full">
          <PsychometricInsights leadId={leadId} leadName={`${lead.first_name} ${lead.last_name}`} />
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog
        open={isEditModalOpen}
        onOpenChange={(open) => {
          if (open) setIsEditModalOpen(true);
          else closeEditModal();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <LeadEditForm
            lead={lead}
            onSuccess={() => {
              closeEditModal();
              queryClient.invalidateQueries({queryKey: ['lead', id]});
            }}
            onCancel={closeEditModal}
          />
        </DialogContent>
      </Dialog>

      {/* LinkedIn Connection Dialog */}
      <LinkedInConnectionDialog
        isOpen={linkedinDialogOpen}
        onClose={() => setLinkedinDialogOpen(false)}
        onConfirm={handleLinkedInDialogConfirm}
        leadName={linkedinConnectionData?.leadName}
        connectionUrl={linkedinConnectionData?.connectionUrl}
        message={linkedinConnectionData?.message}
        isLoading={isLoadingLinkedin}
      />

      <Dialog open={isAddNoteOpen} onOpenChange={setIsAddNoteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
          </DialogHeader>
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Write your note here..."
            className="min-h-[140px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addNoteMutation.mutate(newNote.trim())}
              disabled={!newNote.trim() || addNoteMutation.isPending}
            >
              {addNoteMutation.isPending ? 'Saving...' : 'Save note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
