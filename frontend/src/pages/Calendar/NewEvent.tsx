import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { Calendar, ClockIcon, Globe, MapPin, Info, ChevronLeft, CalendarDays, CheckCircle, Clock } from 'lucide-react';
import eventsAPI from '../../services/api/events';
import { getSystemTimezone, COMMON_TIMEZONES } from '@/utils/timezone';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent } from '@/components/ui/Card';
import { PageContainer } from '@/components/ui/PageContainer';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { useAuthStore } from '@/store/auth';

interface EventFormData {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  location?: string;
  timezone: string;
  event_type: string;
  is_all_day: boolean;
  organization_id: number;
  user_id: number;
}

const eventTypes = [
  { value: 'meeting', label: 'Meeting', color: '#3b82f6', bg: 'bg-blue-50 dark:bg-blue-900/30', textColor: 'text-blue-600' },
  { value: 'task', label: 'Task', color: '#10b981', bg: 'bg-emerald-50', textColor: 'text-emerald-600' },
  { value: 'reminder', label: 'Reminder', color: '#f59e0b', bg: 'bg-amber-50', textColor: 'text-amber-600' }
];

const formatDate = (date: Date | string, timezone: string): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return formatInTimeZone(dateObj, timezone, "yyyy-MM-dd'T'HH:mm");
  } catch (error) {
    console.error('Date formatting error:', error);
    return '';
  }
};

export function NewEventPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuthStore();
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<EventFormData>({
    defaultValues: {
      timezone: getSystemTimezone(),
      event_type: 'meeting',
      is_all_day: false,
      organization_id: user?.organization_id || 0,
      user_id: user?.id || 0
    }
  });

  const eventType = watch('event_type');
  const isAllDay = watch('is_all_day');

  const createEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      // Sadece ihtiyaç duyulan alanları içeren bir nesne oluştur
      const eventData = {
        title: data.title,
        description: data.description,
        start_date: new Date(data.start_date).toISOString(),
        end_date: new Date(data.end_date).toISOString(),
        location: data.location || '',
        event_type: data.event_type,
        is_all_day: data.is_all_day,
        status: 'scheduled' as const,
        organization_id: user?.organization_id || 0,
        user_id: user?.id || 0,
        timezone: data.timezone
      };
      
      // Gereksiz alanları temizle (bunları hiç eklemememize rağmen, ekstra önlem)
      const cleanData = { ...eventData };
      delete (cleanData as any).attendee_ids;
      delete (cleanData as any).attendees;
      delete (cleanData as any).created_by;
      
      // Debug için veriyi kaydet
      setDebugInfo({
        formData: data,
        cleanedEventData: cleanData
      });
      
      // API çağrısını yap
      return eventsAPI.create(cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast({
        title: 'Success',
        description: 'Event created successfully',
      });
      navigate('/calendar');
    },
    onError: (error: any) => {
      console.error('Error creating event:', error);
      // API yanıtını detaylı olarak yazdır
      console.error('Response details:', error?.response?.data);
      setDebugInfo((prev: any) => ({ 
        ...prev, 
        error: error?.response?.data || error.message,
        requestPayload: prev?.cleanedEventData
      }));
      
      // Kullanıcıya hata mesajını göster
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'An error occurred while creating the event',
        variant: 'destructive'
      });
      setIsSubmitting(false);
    },
  });

  const onSubmit = async (data: EventFormData) => {
    setIsSubmitting(true);
    // Kullanıcı ve organizasyon kimliklerini doldur
    data.organization_id = user?.organization_id || 0;
    data.user_id = user?.id || 0;
    createEventMutation.mutate(data);
  };

  // Get the event type details for styling
  const getEventTypeDetails = (typeValue: string) => {
    return eventTypes.find(type => type.value === typeValue) || eventTypes[0];
  };

  const typeDetails = getEventTypeDetails(eventType);

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto py-6">
        <div className="flex items-center gap-4 mb-6 px-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/calendar')} 
            className="p-2"
          >
            <ChevronLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Create New Event</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Schedule a new event in your calendar</p>
          </div>
        </div>

        {/* Debug bilgilerini göster */}
        {debugInfo && (
          <div className="mb-4 mx-4 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-xs font-mono overflow-auto max-h-60">
            <p className="font-bold mb-2">Debug Info:</p>
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        )}

        <Card className="border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl overflow-hidden mx-4">
          <div className={`${typeDetails.bg} px-6 py-4 border-b ${typeDetails.bg.replace('bg', 'border')}`}>
            <div className="flex items-center gap-2">
              <Calendar className={`h-5 w-5 ${typeDetails.textColor}`} />
              <h2 className={`text-lg font-semibold ${typeDetails.textColor}`}>Event Details</h2>
            </div>
          </div>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Event Type Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Event Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  {eventTypes.map(type => (
                    <div
                      key={type.value}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors flex flex-col items-center justify-center ${
                        eventType === type.value
                          ? `${type.bg} border-${type.textColor.replace('text-', '')} ring-1 ring-${type.textColor.replace('text-', '')}`
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50 bg-white'
                      }`}
                      onClick={() => setValue('event_type', type.value)}
                    >
                      <div className={`w-full text-center ${eventType === type.value ? type.textColor : 'text-gray-600 dark:text-gray-400'}`}>
                        {type.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <Label htmlFor="title" className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Title
                </Label>
                <Input
                  id="title"
                  {...register('title', { required: 'Title is required' })}
                  className="border-gray-200 dark:border-gray-700 focus:border-primary"
                  placeholder="Enter event title"
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description" className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Description
                </Label>
                <Textarea
                  id="description"
                  {...register('description', { required: 'Description is required' })}
                  className="border-gray-200 dark:border-gray-700 focus:border-primary min-h-[100px]"
                  placeholder="Enter event description"
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
                )}
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start_date" className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Start Date/Time
                  </Label>
                  <div className="relative">
                    <ClockIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      id="start_date"
                      type="datetime-local"
                      {...register('start_date', { required: 'Start date is required' })}
                      className="pl-9 border-gray-200 dark:border-gray-700 focus:border-primary"
                    />
                  </div>
                  {errors.start_date && (
                    <p className="mt-1 text-sm text-red-600">{errors.start_date.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="end_date" className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    End Date/Time
                  </Label>
                  <div className="relative">
                    <ClockIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      id="end_date"
                      type="datetime-local"
                      {...register('end_date', { required: 'End date is required' })}
                      className="pl-9 border-gray-200 dark:border-gray-700 focus:border-primary"
                    />
                  </div>
                  {errors.end_date && (
                    <p className="mt-1 text-sm text-red-600">{errors.end_date.message}</p>
                  )}
                </div>
              </div>

              {/* All-day Toggle - Improved version with lighter non-selected background */}
              <div className="mt-2">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Event Duration</Label>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`flex items-center justify-center px-4 py-2 border rounded-lg transition-colors ${
 !isAllDay
 ? 'bg-blue-50 border-blue-200 text-blue-600 font-medium'
 : 'border-gray-200 text-gray-600 hover:bg-gray-50 bg-white'
 }`}
                    onClick={() => setValue('is_all_day', false)}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Time Specific
                  </button>
                  <button
                    type="button"
                    className={`flex items-center justify-center px-4 py-2 border rounded-lg transition-colors ${
 isAllDay
 ? 'bg-blue-50 border-blue-200 text-blue-600 font-medium'
 : 'border-gray-200 text-gray-600 hover:bg-gray-50 bg-white'
 }`}
                    onClick={() => setValue('is_all_day', true)}
                  >
                    <CalendarDays className="h-4 w-4 mr-2" />
                    All Day
                  </button>
                </div>
              </div>

              {/* Location */}
              <div>
                <Label htmlFor="location" className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Location
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <Input
                    id="location"
                    {...register('location')}
                    className="pl-9 border-gray-200 dark:border-gray-700 focus:border-primary"
                    placeholder="Enter location (optional)"
                  />
                </div>
              </div>

              {/* Timezone */}
              <div>
                <Label htmlFor="timezone" className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Timezone
                </Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <Select
                    value={watch('timezone')}
                    onValueChange={(value) => setValue('timezone', value)}
                  >
                    <SelectTrigger className="w-full pl-9 border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/calendar')}
                  className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white dark:border-gray-800 border-t-transparent rounded-full" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CalendarDays className="h-4 w-4" />
                      Create Event
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
