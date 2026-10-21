import { format, parseISO } from 'date-fns';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { fr as frLocale, enUS } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { Event, EventCreateInput } from '../../services/api/events';
import eventsAPI from '../../services/api/events';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useAuthStore } from '@/store/auth';
import { getSystemTimezone, COMMON_TIMEZONES } from '@/utils/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { Textarea } from '@/components/ui/Textarea';
import { 
  Calendar, 
  Clock, 
  Globe, 
  MapPin, 
  CalendarDays, 
  Clock3, 
  AlarmCheck, 
  AlertCircle, 
  Trash2, 
  Edit2,
  Users,
  Video,
  Coffee,
  Briefcase,
  Bell,
  X,
  Check,
  Play,
  Pause,
  XCircle
} from 'lucide-react';

interface EventDetailModalProps {
  event?: Event;
  onClose: () => void;
  onDelete?: (id: number) => void;
  open: boolean;
}

const formatDate = (date: string | Date | null | undefined, timezone: string = 'Europe/Istanbul'): string => {
  if (!date) return '';
  
  try {
    let dateObj: Date;
    
    if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      return '';
    }
    
    if (isNaN(dateObj.getTime())) {
      console.error('Invalid date:', date);
      return '';
    }
    
    const formatted = formatInTimeZone(dateObj, timezone, "yyyy-MM-dd'T'HH:mm");
    return formatted;
  } catch (error) {
    console.error('Date formatting error:', error, { input: date });
    return '';
  }
};

const formatDisplayDate = (date: string | Date | null | undefined, timezone: string = 'Europe/Istanbul', locale?: Locale): string => {
  if (!date) return '';
  
  try {
    let dateObj: Date;
    
    if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      return '';
    }
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    return formatInTimeZone(dateObj, timezone, "dd MMM yyyy, HH:mm", { locale });
  } catch (error) {
    return '';
  }
};

const defaultEventData: EventCreateInput = {
  title: '',
  description: '',
  start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
  end_date: format(new Date(Date.now() + 30 * 60000), "yyyy-MM-dd'T'HH:mm:ss"),
  location: '',
  event_type: 'meeting',
  is_all_day: false,
  status: 'scheduled',
  organization_id: 0,
  user_id: 0,
  timezone: getSystemTimezone()
};

const MEETING_LINK_PREFIX = '[meeting-link]';
const MEETING_LINK_SUFFIX = '[/meeting-link]';

function extractMeetingLink(description?: string | null): { meetingLink: string; cleanDescription: string } {
  if (!description) return { meetingLink: '', cleanDescription: '' };
  const match = description.match(/\[meeting-link\](.*?)\[\/meeting-link\]/i);
  const meetingLink = match?.[1]?.trim() || '';
  const cleanDescription = description.replace(/\[meeting-link\].*?\[\/meeting-link\]\s*/gi, '').trim();
  return { meetingLink, cleanDescription };
}

function mergeMeetingLink(description: string, meetingLink?: string): string {
  const clean = description.trim();
  const link = (meetingLink || '').trim();
  if (!link) return clean;
  return `${MEETING_LINK_PREFIX} ${link} ${MEETING_LINK_SUFFIX}\n${clean}`.trim();
}

const eventTypes = [
  { 
    value: 'meeting', 
    icon: Users,
    color: '#6366f1', 
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/30', 
    textColor: 'text-indigo-700 dark:text-indigo-300',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
    gradient: 'from-indigo-500 to-indigo-600'
  },
  { 
    value: 'call', 
    icon: Video,
    color: '#10b981', 
    bgColor: 'bg-emerald-50', 
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    gradient: 'from-emerald-500 to-emerald-600'
  },
  { 
    value: 'task', 
    icon: Briefcase,
    color: '#f59e0b', 
    bgColor: 'bg-amber-50', 
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    gradient: 'from-amber-500 to-amber-600'
  },
  { 
    value: 'reminder', 
    icon: Bell,
    color: '#ef4444', 
    bgColor: 'bg-red-50 dark:bg-red-900/30', 
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    gradient: 'from-red-500 to-red-600'
  },
  { 
    value: 'break', 
    icon: Coffee,
    color: '#8b5cf6', 
    bgColor: 'bg-purple-50 dark:bg-purple-900/40', 
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-200 dark:border-purple-800',
    gradient: 'from-purple-500 to-purple-600'
  }
];

const eventStatusOptions = [
  { 
    value: 'scheduled', 
    icon: Clock,
    color: '#6366f1', 
    bgColor: 'bg-blue-50 dark:bg-blue-900/30', 
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  { 
    value: 'in_progress', 
    icon: Play,
    color: '#8b5cf6', 
    bgColor: 'bg-purple-50 dark:bg-purple-900/40', 
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-200 dark:border-purple-800'
  },
  { 
    value: 'completed', 
    icon: Check,
    color: '#10b981', 
    bgColor: 'bg-emerald-50', 
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200'
  },
  { 
    value: 'cancelled', 
    icon: XCircle,
    color: '#ef4444', 
    bgColor: 'bg-red-50 dark:bg-red-900/30', 
    textColor: 'text-red-700',
    borderColor: 'border-red-200'
  }
];

export default function EventDetailModal({ event, onClose, onDelete, open }: EventDetailModalProps) {
  const { t, i18n } = useTranslation('calendar');
  const dfLocale = i18n.language?.startsWith('fr') ? frLocale : enUS;
  const [editedEvent, setEditedEvent] = useState<EventCreateInput>(defaultEventData);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState(getSystemTimezone());
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [meetingLink, setMeetingLink] = useState('');

  useEffect(() => {
    if (open && event) {
      try {
        const parsed = extractMeetingLink(event.description);
        const eventTimezone = event.timezone || getSystemTimezone();
        setSelectedTimezone(eventTimezone);
        
        const startDateValue = event.start_date || event.start;
        const endDateValue = event.end_date || event.end;
        
        if (!startDateValue || !endDateValue) {
          const now = new Date();
          const thirtyMinutesLater = new Date(now.getTime() + 30 * 60000);
          
          setEditedEvent({
            title: event.title || '',
            description: parsed.cleanDescription || '',
            start_date: formatInTimeZone(now, eventTimezone, "yyyy-MM-dd'T'HH:mm"),
            end_date: formatInTimeZone(thirtyMinutesLater, eventTimezone, "yyyy-MM-dd'T'HH:mm"),
            location: event.location || '',
            event_type: event.event_type || 'meeting',
            is_all_day: event.is_all_day || event.allDay || false,
            status: event.status || 'scheduled',
            organization_id: user?.organization_id || 0,
            user_id: user?.id || 0,
            timezone: eventTimezone
          });
          
          toast.error(t('detail.datesMissing'));
          return;
        }

        let startDate: Date;
        let endDate: Date;
        try {
          startDate = typeof startDateValue === 'string' 
            ? parseISO(startDateValue)
            : new Date(startDateValue);
            
          endDate = typeof endDateValue === 'string'
            ? parseISO(endDateValue)
            : new Date(endDateValue);
          
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error('Invalid date values');
          }
        } catch (error) {
          console.error('Date parsing error:', error);
          throw new Error('Failed to parse event dates');
        }
        
        const formattedStartDate = formatInTimeZone(startDate, eventTimezone, "yyyy-MM-dd'T'HH:mm");
        const formattedEndDate = formatInTimeZone(endDate, eventTimezone, "yyyy-MM-dd'T'HH:mm");
        
        setEditedEvent({
          title: event.title || '',
          description: parsed.cleanDescription || '',
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          location: event.location || '',
          event_type: event.event_type || 'meeting',
          is_all_day: event.is_all_day || event.allDay || false,
          status: event.status || 'scheduled',
          organization_id: user?.organization_id || 0,
          user_id: user?.id || 0,
          timezone: eventTimezone
        });
        setMeetingLink(parsed.meetingLink);
      } catch (error) {
        console.error('Error processing event dates:', error);
        toast.error(t('detail.loadError'));
        
        const now = new Date();
        const thirtyMinutesLater = new Date(now.getTime() + 30 * 60000);
        const systemTimezone = getSystemTimezone();
        
        setEditedEvent({
          ...defaultEventData,
          title: event.title || '',
          description: extractMeetingLink(event.description).cleanDescription || '',
          start_date: formatInTimeZone(now, systemTimezone, "yyyy-MM-dd'T'HH:mm"),
          end_date: formatInTimeZone(thirtyMinutesLater, systemTimezone, "yyyy-MM-dd'T'HH:mm"),
          organization_id: user?.organization_id || 0,
          user_id: user?.id || 0,
          timezone: systemTimezone
        });
        setMeetingLink('');
      }
    } else if (open) {
      const systemTimezone = getSystemTimezone();
      setSelectedTimezone(systemTimezone);
      
      const now = new Date();
      const thirtyMinutesLater = new Date(now.getTime() + 30 * 60000);
      
      const formattedStartDate = formatInTimeZone(now, systemTimezone, "yyyy-MM-dd'T'HH:mm");
      const formattedEndDate = formatInTimeZone(thirtyMinutesLater, systemTimezone, "yyyy-MM-dd'T'HH:mm");
      
      setEditedEvent({
        ...defaultEventData,
        start_date: formattedStartDate,
        end_date: formattedEndDate,
        organization_id: user?.organization_id || 0,
        user_id: user?.id || 0,
        timezone: systemTimezone
      });
      setMeetingLink('');
    }
  }, [event, open, user, onClose]);

  const handleSave = async () => {
    if (!event?.id) return;
    
    try {
      setIsSaving(true);
      
      const timezone = editedEvent.timezone || getSystemTimezone();
      
      const startDate = parseISO(editedEvent.start_date);
      const endDate = parseISO(editedEvent.end_date);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date values');
      }
      
      const updateData = {
        title: editedEvent.title,
        description: mergeMeetingLink(editedEvent.description || '', meetingLink) || null,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        location: editedEvent.location || null,
        event_type: editedEvent.event_type,
        is_all_day: editedEvent.is_all_day,
        status: editedEvent.status,
        timezone: timezone
      };

      await eventsAPI.update(event.id, updateData);
      
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success(t('page.updatedOk'));
      setIsEditing(false);
      onClose();
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error(t('page.updateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event?.id || !onDelete) return;
    
    try {
      setIsDeleting(true);
      await eventsAPI.remove(event.id);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success(t('page.deletedOk'));
      onDelete(event.id);
      onClose();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error(t('page.deleteFailed'));
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  const handleClose = () => {
    setIsEditing(false);
    setIsConfirmingDelete(false);
    onClose();
  };

  const getEventTypeDetails = (typeValue: string) => {
    return eventTypes.find(type => type.value === typeValue) || eventTypes[0];
  };

  const getStatusDetails = (statusValue: string) => {
    return eventStatusOptions.find(status => status.value === statusValue) || eventStatusOptions[0];
  };

  if (!event) return null;

  const typeDetails = getEventTypeDetails(event.event_type);
  const statusDetails = getStatusDetails(event.status);
  const TypeIcon = typeDetails.icon;
  const StatusIcon = statusDetails.icon;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="sm:max-w-[700px] max-h-[88vh] p-0 overflow-hidden rounded-2xl border-0 shadow-2xl"
        showCloseButton={false}
      >
        {isConfirmingDelete ? (
          <div className="p-8">
            <div className="mb-8 text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center mb-6 shadow-lg">
                <AlertCircle className="h-8 w-8 text-white" />
              </div>
              <DialogTitle className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">{t('deleteEvent')}</DialogTitle>
              <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
                {t('detail.confirmDelete')}
              </p>
            </div>
            
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-8 bg-gradient-to-r from-gray-50 to-gray-100">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${typeDetails.gradient} shadow-lg`}>
                  <TypeIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-lg mb-1">{event.title}</h4>
                  <p className="text-gray-600 dark:text-gray-400">{formatDisplayDate(event.start_date, undefined, dfLocale)}</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-4 justify-end">
              <Button
                variant="outline"
                onClick={() => setIsConfirmingDelete(false)}
                className="px-6 py-3 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded-lg font-medium"
              >
                {t('page.cancel')}
              </Button>
              <Button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-medium shadow-lg"
              >
                {isDeleting ? t('detail.deleting') : t('deleteEvent')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Modern Gradient Header */}
            <div className={`bg-gradient-to-r ${typeDetails.gradient} px-8 py-6 text-white relative overflow-hidden`}>
              <div className="absolute inset-0 bg-black/10"></div>
              <div className="relative flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                    <TypeIcon className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-bold mb-1">
                      {isEditing ? t('editEvent') : t('detail.eventDetails')}
                    </DialogTitle>
                    <div className="flex items-center gap-2 text-white/90">
                      <StatusIcon className="h-4 w-4" />
                      <span className="font-medium">{t(`page.status.${statusDetails.value}`)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-2"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[60vh] overflow-y-auto px-8 py-6">
              {isEditing ? (
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="title" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">{t('page.eventTitle')}</Label>
                    <Input
                      id="title"
                      value={editedEvent.title}
                      onChange={(e) => setEditedEvent({ ...editedEvent, title: e.target.value })}
                      className="border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg text-base"
                      placeholder={t('page.eventTitlePlaceholder')}
                    />
                  </div>

                  <div>
                    <Label htmlFor="description" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">{t('page.description')}</Label>
                    <Textarea
                      id="description"
                      value={editedEvent.description || ''}
                      onChange={(e) => setEditedEvent({ ...editedEvent, description: e.target.value })}
                      className="border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-500 min-h-[120px] rounded-lg text-base"
                      placeholder={t('page.descriptionPlaceholder')}
                    />
                  </div>

                  {(editedEvent.event_type === 'meeting' || editedEvent.event_type === 'call' || editedEvent.event_type === 'video_call') && (
                    <div>
                      <Label htmlFor="meeting-link" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">{t('page.meetingLink')}</Label>
                      <Input
                        id="meeting-link"
                        type="url"
                        value={meetingLink}
                        onChange={(e) => setMeetingLink(e.target.value)}
                        className="border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg text-base"
                        placeholder="https://meet.google.com/..."
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="start_date" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">{t('detail.startDateTime')}</Label>
                      <div className="relative">
                        <Clock className="absolute left-4 top-3.5 h-5 w-5 text-gray-400 dark:text-gray-500" />
                        <Input
                          id="start_date"
                          type="datetime-local"
                          value={formatDate(editedEvent.start_date)}
                          onChange={(e) => setEditedEvent({ ...editedEvent, start_date: e.target.value })}
                          className="pl-12 border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg text-base"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="end_date" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">{t('detail.endDateTime')}</Label>
                      <div className="relative">
                        <Clock3 className="absolute left-4 top-3.5 h-5 w-5 text-gray-400 dark:text-gray-500" />
                        <Input
                          id="end_date"
                          type="datetime-local"
                          value={formatDate(editedEvent.end_date)}
                          onChange={(e) => setEditedEvent({ ...editedEvent, end_date: e.target.value })}
                          className="pl-12 border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg text-base"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Event Type Selection Grid */}
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-3">{t('page.eventType')}</Label>
                    <div className="grid grid-cols-5 gap-3">
                      {eventTypes.map((type) => {
                        const Icon = type.icon;
                        const isSelected = editedEvent.event_type === type.value;
                        return (
                          <button
                            key={type.value}
                            onClick={() => setEditedEvent({ ...editedEvent, event_type: type.value })}
                            className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                              isSelected
                                ? `bg-gradient-to-br ${type.gradient} border-transparent text-white shadow-lg scale-105`
                                : `${type.bgColor} ${type.borderColor} ${type.textColor} hover:scale-105 hover:shadow-md`
                            }`}
                          >
                            <Icon className="h-6 w-6 mx-auto mb-2" />
                            <span className="text-xs font-medium">{t(`page.types.${type.value}`)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="status" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">{t('detail.status')}</Label>
                      <Select
                        value={editedEvent.status}
                        onValueChange={(value) => setEditedEvent({ ...editedEvent, status: value as any })}
                      >
                        <SelectTrigger className="border-gray-300 dark:border-gray-600 focus:border-indigo-500 rounded-lg">
                          <SelectValue placeholder={t('detail.selectStatus')} />
                        </SelectTrigger>
                        <SelectContent>
                          {eventStatusOptions.map((status) => {
                            const Icon = status.icon;
                            return (
                              <SelectItem key={status.value} value={status.value}>
                                <div className="flex items-center gap-3">
                                  <div className={`p-1.5 rounded-lg ${status.bgColor}`}>
                                    <Icon className={`h-4 w-4 ${status.textColor}`} />
                                  </div>
                                  <span>{t(`page.status.${status.value}`)}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="location" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">{t('location')}</Label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-3.5 h-5 w-5 text-gray-400 dark:text-gray-500" />
                        <Input
                          id="location"
                          value={editedEvent.location || ''}
                          onChange={(e) => setEditedEvent({ ...editedEvent, location: e.target.value })}
                          className="pl-12 border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg text-base"
                          placeholder={t('detail.locationPlaceholder')}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Event Title Card */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-4">
                      <div className={`p-4 rounded-xl bg-gradient-to-br ${typeDetails.gradient} shadow-lg`}>
                        <Calendar className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('page.eventTitle')}</span>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{event.title}</h3>
                      </div>
                    </div>
                  </div>

                  {/* Date and Time Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                          <Clock className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('page.startTime')}</span>
                          <p className="font-semibold text-gray-900 dark:text-white mt-1">{formatDisplayDate(event.start_date, undefined, dfLocale)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg">
                          <Clock3 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('page.endTime')}</span>
                          <p className="font-semibold text-gray-900 dark:text-white mt-1">{formatDisplayDate(event.end_date, undefined, dfLocale)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {event.description && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg">
                          <AlarmCheck className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('page.description')}</span>
                          <p className="text-gray-900 dark:text-white mt-2 leading-relaxed whitespace-pre-wrap">{extractMeetingLink(event.description).cleanDescription}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {extractMeetingLink(event.description).meetingLink && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('page.meetingLink')}</span>
                      <a
                        href={extractMeetingLink(event.description).meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block font-medium text-indigo-600 hover:underline break-all"
                      >
                        {extractMeetingLink(event.description).meetingLink}
                      </a>
                    </div>
                  )}

                  {/* Type and Status Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${typeDetails.gradient} shadow-lg`}>
                          <TypeIcon className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('page.eventType')}</span>
                          <p className="font-semibold text-gray-900 dark:text-white mt-1">{t(`page.types.${typeDetails.value}`)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${statusDetails.bgColor} border ${statusDetails.borderColor}`}>
                          <StatusIcon className={`h-5 w-5 ${statusDetails.textColor}`} />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('detail.status')}</span>
                          <p className={`font-semibold mt-1 ${statusDetails.textColor}`}>{t(`page.status.${statusDetails.value}`)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  {event.location && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg">
                          <MapPin className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('location')}</span>
                          <p className="font-semibold text-gray-900 dark:text-white mt-1">{event.location}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modern Footer */}
            <div className="px-8 py-6 border-t bg-gradient-to-r from-gray-50 to-gray-100 flex justify-end gap-3">
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-3 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-white rounded-lg font-medium"
                  >
                    {t('page.cancel')}
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-lg font-medium shadow-lg"
                  >
                    {isSaving ? t('detail.saving') : t('detail.saveChanges')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsConfirmingDelete(true)}
                    className="px-6 py-3 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 rounded-lg font-medium flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('detail.delete')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-3 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-white rounded-lg font-medium flex items-center gap-2"
                  >
                    <Edit2 className="h-4 w-4" />
                    {t('detail.edit')}
                  </Button>
                  <Button
                    onClick={onClose}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-lg font-medium shadow-lg"
                  >
                    {t('detail.close')}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
