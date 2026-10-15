// Takvim sayfası
import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, addWeeks, subWeeks, isSameMonth, isToday, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { tr } from 'date-fns/locale';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { 
  Calendar, 
  Plus, 
  Globe, 
  Clock, 
  MapPin, 
  CalendarDays, 
  Calendar as CalendarIcon, 
  Clock3, 
  ChevronLeft, 
  ChevronRight,
  MoreHorizontal,
  Users,
  Video,
  Coffee,
  Briefcase,
  Bell,
  Settings,
  Grid3X3,
  List,
  Eye,
  X,
  Mail,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import eventsAPI, { Event, EventCreateInput } from '@/services/api/events';
import emailAPI from '../../services/emailAPI';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import EventDetailModal from './EventDetailModal';
import { Card } from '@/components/ui/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Label } from '@/components/ui/Label';

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  description: string | null;
  location: string | null;
  event_type: string;
  is_all_day: boolean;
  allDay: boolean;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  organization_id: number;
  user_id: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  timezone: string;
}

interface NewEventForm {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  event_type: string;
  organization_id?: number;
  user_id?: number;
  is_all_day: boolean;
  location: string;
  timezone: string;
  meeting_link: string;
}

const MEETING_LINK_PREFIX = '[meeting-link]';
const MEETING_LINK_SUFFIX = '[/meeting-link]';

function mergeMeetingLink(description: string, meetingLink?: string): string {
  const clean = description.trim();
  const link = (meetingLink || '').trim();
  if (!link) return clean;
  return `${MEETING_LINK_PREFIX}${link}${MEETING_LINK_SUFFIX}\n${clean}`.trim();
}

const eventTypes = [
  { 
    value: 'meeting', 
    label: 'Meeting', 
    icon: Users,
    color: '#6366f1', 
    bgColor: 'bg-indigo-50', 
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-200'
  },
  { 
    value: 'call', 
    label: 'Call', 
    icon: Video,
    color: '#10b981', 
    bgColor: 'bg-emerald-50', 
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200'
  },
  { 
    value: 'task', 
    label: 'Task', 
    icon: Briefcase,
    color: '#f59e0b', 
    bgColor: 'bg-amber-50', 
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200'
  },
  { 
    value: 'reminder', 
    label: 'Reminder', 
    icon: Bell,
    color: '#ef4444', 
    bgColor: 'bg-red-50', 
    textColor: 'text-red-700',
    borderColor: 'border-red-200'
  },
  { 
    value: 'break', 
    label: 'Break', 
    icon: Coffee,
    color: '#8b5cf6', 
    bgColor: 'bg-purple-50', 
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200'
  }
];

const normalizeEventTypeForApi = (eventType: string): 'meeting' | 'video_call' | 'task' | 'reminder' => {
  if (eventType === 'call') return 'video_call';
  if (eventType === 'break') return 'reminder';
  if (eventType === 'meeting' || eventType === 'video_call' || eventType === 'task' || eventType === 'reminder') {
    return eventType;
  }
  return 'meeting';
};

function timezoneLabel(zone: string, city: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value;
    return offset ? `${city} (${offset})` : city;
  } catch {
    return city;
  }
}

const TIMEZONE_OPTIONS = [
  { value: 'Europe/Istanbul', label: timezoneLabel('Europe/Istanbul', 'Istanbul') },
  { value: 'Europe/London', label: timezoneLabel('Europe/London', 'London') },
  { value: 'Europe/Paris', label: timezoneLabel('Europe/Paris', 'Paris') },
  { value: 'Europe/Berlin', label: timezoneLabel('Europe/Berlin', 'Berlin') },
  { value: 'Europe/Madrid', label: timezoneLabel('Europe/Madrid', 'Madrid') },
  { value: 'Europe/Rome', label: timezoneLabel('Europe/Rome', 'Rome') },
  { value: 'UTC', label: timezoneLabel('UTC', 'UTC') },
  { value: 'America/New_York', label: timezoneLabel('America/New_York', 'New York') },
  { value: 'Asia/Tokyo', label: timezoneLabel('Asia/Tokyo', 'Tokyo') },
];

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Max events shown per day cell in month view before "+N more". */
const MONTH_DAY_EVENT_PREVIEW = 4;
/** Default agenda list page size (load more increases this). */
const AGENDA_PAGE_SIZE = 50;
const AGENDA_RANGE_OPTIONS = [
  { value: '7', label: 'Next 7 days' },
  { value: '14', label: 'Next 14 days' },
  { value: '30', label: 'Next 30 days' },
  { value: '90', label: 'Next 90 days' },
] as const;

const getSystemTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.error('Error detecting system timezone:', error);
    return 'Europe/Istanbul';
  }
};

export const CalendarPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const detectedTimezone = useMemo(() => getSystemTimezone(), []);
  const timezoneOptions = useMemo(() => {
    if (TIMEZONE_OPTIONS.some((tz) => tz.value === detectedTimezone)) {
      return TIMEZONE_OPTIONS;
    }
    return [{ value: detectedTimezone, label: `${detectedTimezone} (Detected)` }, ...TIMEZONE_OPTIONS];
  }, [detectedTimezone]);
  
  // States
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'agenda'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'agenda' : 'month'
  );

  // Keep mobile on agenda — month chips are unreadable at ~390px (B45)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const enforce = () => {
      if (mq.matches && viewMode !== 'agenda') setViewMode('agenda');
    };
    enforce();
    mq.addEventListener('change', enforce);
    return () => mq.removeEventListener('change', enforce);
  }, [viewMode]);
  const [agendaRangeDays, setAgendaRangeDays] = useState<7 | 14 | 30 | 90>(30);
  const [agendaVisibleCount, setAgendaVisibleCount] = useState(AGENDA_PAGE_SIZE);
  const [expandedMonthDay, setExpandedMonthDay] = useState<Date | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState(detectedTimezone);
  const [isDetailModalOpen, setDetailModalOpen] = useState(false);
  const [isNewEventDialogOpen, setNewEventDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<NewEventForm>(() => ({
    title: '',
    description: '',
    start_time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    end_time: format(new Date(new Date().getTime() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm"),
    event_type: 'meeting',
    organization_id: user?.organization_id,
    user_id: user?.id,
    is_all_day: false,
    location: '',
    timezone: detectedTimezone,
    meeting_link: '',
  }));

  // Get date range based on view mode
  const getDateRange = () => {
    switch (viewMode) {
      case 'week':
        return {
          start: startOfWeek(currentDate, { weekStartsOn: 1 }),
          end: endOfWeek(currentDate, { weekStartsOn: 1 })
        };
      case 'agenda':
        return {
          start: startOfDay(addDays(currentDate, -1)),
          end: endOfDay(addDays(currentDate, agendaRangeDays)),
        };
      default: // month
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          start: startOfWeek(monthStart, { weekStartsOn: 1 }),
          end: endOfWeek(monthEnd, { weekStartsOn: 1 })
        };
    }
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', startDate.toISOString(), endDate.toISOString(), selectedTimezone, viewMode, agendaRangeDays],
    queryFn: async () => {
      const response = await eventsAPI.list({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        timezone: selectedTimezone
      });

      return response.map((event: Event): CalendarEvent => ({
        ...event,
        start: parseISO(event.start_date),
        end: parseISO(event.end_date),
        allDay: event.is_all_day
      }));
    },
    enabled: !!user
  });

  const { data: emailAccounts = [], refetch: refetchEmailAccounts } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  const emailCalendarAccounts = emailAccounts.filter(account => account.calendar_sync_enabled);

  const syncCalendarMutation = useMutation({
    mutationFn: ({ accountId }: { accountId: number }) => 
      emailAPI.syncCalendar(accountId),
    onSuccess: () => {
      refetchEmailAccounts();
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Calendar sync completed. Email calendar events have been updated.');
    },
    onError: () => {
      toast.error('Calendar sync failed. Could not sync email calendar events.');
    },
  });

  // Generate calendar days for month view
  const calendarDays = [];
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  let day = calendarStart;
  while (day <= calendarEnd) {
    calendarDays.push(day);
    day = addDays(day, 1);
  }

  // Generate week days for week view
  const weekDays = [];
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  for (let i = 0; i < 7; i++) {
    weekDays.push(addDays(weekStart, i));
  }

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(event.start, day));
  };

  const getEventTypeDetails = (typeValue: string) => {
    return eventTypes.find(type => type.value === typeValue) || eventTypes[0];
  };

  const handleDateClick = (day: Date) => {
    setSelectedDate(day);
    setNewEvent(prev => ({
      ...prev,
      start_time: format(day, "yyyy-MM-dd'T'09:00"),
      end_time: format(day, "yyyy-MM-dd'T'10:00")
    }));
    setNewEventDialogOpen(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDetailModalOpen(true);
  };

  const handleCreateEvent = async (formattedEvent: EventCreateInput) => {
    try {
      await eventsAPI.create(formattedEvent);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event created successfully!');
      return true;
    } catch (error: any) {
      console.error('Error creating event:', error);
      const errorMessage = typeof error?.response?.data?.detail === 'string'
        ? error.response.data.detail
        : error?.message || 'Failed to create event';
      toast.error(errorMessage);
      return false;
    }
  };

  const handleCreateNewEvent = async () => {
    if (!newEvent.title) {
      toast.error('Please enter an event title');
      return;
    }

    const eventData: EventCreateInput = {
      title: newEvent.title,
      description: mergeMeetingLink(newEvent.description || '', newEvent.meeting_link) || null,
      start_date: new Date(newEvent.start_time).toISOString(),
      end_date: new Date(newEvent.end_time).toISOString(),
      location: newEvent.location || null,
      event_type: normalizeEventTypeForApi(newEvent.event_type),
      is_all_day: newEvent.is_all_day,
      organization_id: user?.organization_id || 0,
      timezone: newEvent.timezone || selectedTimezone,
      status: 'scheduled',
    };

    const created = await handleCreateEvent(eventData);
    if (!created) return;
    setNewEventDialogOpen(false);
    setNewEvent({
      title: '',
      description: '',
      start_time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(new Date(new Date().getTime() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm"),
      event_type: 'meeting',
      organization_id: user?.organization_id,
      user_id: user?.id,
      is_all_day: false,
      location: '',
      timezone: detectedTimezone,
      meeting_link: '',
    });
  };

  const handleEditEvent = async (updatedEvent: CalendarEvent) => {
    try {
      await eventsAPI.update(updatedEvent.id, {
        title: updatedEvent.title,
        description: updatedEvent.description,
        start_date: updatedEvent.start.toISOString(),
        end_date: updatedEvent.end.toISOString(),
        location: updatedEvent.location,
        event_type: normalizeEventTypeForApi(updatedEvent.event_type),
        is_all_day: updatedEvent.is_all_day,
        status: updatedEvent.status,
        timezone: selectedTimezone
      });
      
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event updated successfully!');
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    try {
      await eventsAPI.remove(eventId);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event deleted successfully!');
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
    }
  };

  // Navigation handlers
  const handlePrevious = () => {
    switch (viewMode) {
      case 'week':
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case 'agenda':
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      default:
        setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    switch (viewMode) {
      case 'week':
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case 'agenda':
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      default:
        setCurrentDate(addMonths(currentDate, 1));
    }
  };

  useEffect(() => {
    setAgendaVisibleCount(AGENDA_PAGE_SIZE);
  }, [currentDate, agendaRangeDays, viewMode]);

  const goToToday = () => setCurrentDate(new Date());

  const jumpToDate = (isoDate: string) => {
    if (!isoDate) return;
    const parsed = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setCurrentDate(parsed);
  };

  const getViewTitle = () => {
    switch (viewMode) {
      case 'week':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
      case 'agenda':
        return `Agenda — ${format(currentDate, 'MMM d')} – ${format(addDays(currentDate, agendaRangeDays - 1), 'MMM d, yyyy')}`;
      default:
        return format(currentDate, 'MMMM yyyy');
    }
  };

  const renderCalendarHeader = () => (
    <div className="bg-white border-b border-gray-200 px-3 py-4 sm:px-8 sm:py-6 overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-6">
          <div className="flex items-center justify-between gap-2 sm:space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              className="min-h-[44px] min-w-[44px] p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Previous"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="flex-1 text-lg sm:text-2xl font-bold text-gray-900 sm:min-w-[250px] text-center truncate px-1">
              {getViewTitle()}
            </h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              className="min-h-[44px] min-w-[44px] p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Next"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday} className="hidden sm:inline-flex rounded-lg">
              Today
            </Button>
            <Input
              type="date"
              value={format(currentDate, 'yyyy-MM-dd')}
              onChange={(e) => jumpToDate(e.target.value)}
              className="hidden sm:block w-[150px] h-9 border-gray-200"
              aria-label="Jump to date"
            />
          </div>

          <div className="hidden sm:flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('month')}
              className={`flex items-center space-x-2 rounded-md px-4 py-2 transition-all ${
                viewMode === 'month' 
                  ? 'bg-white shadow-sm text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <Grid3X3 className="h-4 w-4" />
              <span>Month</span>
            </Button>
            <Button
              variant={viewMode === 'week' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('week')}
              className={`flex items-center space-x-2 rounded-md px-4 py-2 transition-all ${
                viewMode === 'week' 
                  ? 'bg-white shadow-sm text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <List className="h-4 w-4" />
              <span>Week</span>
            </Button>
            <Button
              variant={viewMode === 'agenda' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('agenda')}
              className={`flex items-center space-x-2 rounded-md px-4 py-2 transition-all ${
                viewMode === 'agenda' 
                  ? 'bg-white shadow-sm text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <Eye className="h-4 w-4" />
              <span>Agenda</span>
            </Button>
          </div>
          <p className="text-sm text-gray-500 sm:hidden">Agenda view</p>

          {viewMode === 'agenda' && (
            <Select
              value={String(agendaRangeDays)}
              onValueChange={(value) => setAgendaRangeDays(Number(value) as 7 | 14 | 30 | 90)}
            >
              <SelectTrigger className="w-40 bg-white border-gray-200 h-9">
                <SelectValue placeholder="Range" />
              </SelectTrigger>
              <SelectContent>
                {AGENDA_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
            <SelectTrigger className="w-48 bg-white border-gray-200">
              <div className="flex items-center space-x-2">
                <Globe className="h-4 w-4 text-gray-500" />
                <SelectValue placeholder="Select timezone" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            onClick={() => setNewEventDialogOpen(true)} 
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm px-6 py-3 rounded-lg font-medium"
          >
            <Plus className="h-4 w-4" />
            <span>New Event</span>
          </Button>
        </div>
      </div>
      
      {/* Email Calendar Sync Section */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Mail className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium">Email Calendar Sync</span>
            {emailCalendarAccounts.length > 0 && (
              <span className="text-xs text-gray-500">
                ({emailCalendarAccounts.length} account{emailCalendarAccounts.length !== 1 ? 's' : ''} connected)
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
              {emailCalendarAccounts.length > 0 && (
                <Button
                  onClick={() => {
                    emailCalendarAccounts.forEach(account => {
                      syncCalendarMutation.mutate({ accountId: account.id });
                    });
                  }}
                  variant="outline"
                  size="sm"
                  disabled={syncCalendarMutation.isPending}
                >
                  {syncCalendarMutation.isPending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Sync All
                    </>
                  )}
                </Button>
              )}
              <Button
                onClick={() => window.location.href = '/settings?tab=integrations'}
                variant="outline"
                size="sm"
              >
                Add Calendar
              </Button>
            </div>
        </div>
        
        {emailCalendarAccounts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {emailCalendarAccounts.map((account) => (
              <div
                key={account.id}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              >
                {(account.provider_type || 'custom').toUpperCase()} - {account.email}
                {account.last_calendar_sync_at && (
                  <span className="ml-1 text-blue-600">
                    (synced {new Date(account.last_calendar_sync_at).toLocaleDateString()})
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    syncCalendarMutation.mutate({ accountId: account.id });
                  }}
                  className="ml-1 text-blue-600 hover:text-blue-800 transition-colors"
                  title="Sync this account"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderMonthView = () => (
    <div className="flex-1 p-8">
      {/* Day Names Header */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {dayNames.map((day) => (
          <div key={day} className="text-center py-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 bg-gray-50 rounded-2xl p-2">
        {calendarDays.map((day, dayIdx) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isCurrentDay = isToday(day);

          return (
            <div
              key={day.toISOString()}
              onClick={() => handleDateClick(day)}
              className={`
                min-h-[140px] p-3 cursor-pointer transition-all duration-200 rounded-xl
                ${isCurrentMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 text-gray-400'}
                ${isCurrentDay ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''}
                hover:shadow-md border border-gray-100
              `}
            >
              <div className="flex justify-between items-start mb-3">
                <span className={`
                  text-sm font-semibold
                  ${isCurrentDay ? 'text-indigo-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
                `}>
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full font-medium">
                    {dayEvents.length}
                  </span>
                )}
              </div>
              
              <div className="space-y-1.5">
                {dayEvents.slice(0, MONTH_DAY_EVENT_PREVIEW).map((event: CalendarEvent) => {
                  const typeDetails = getEventTypeDetails(event.event_type);
                  return (
                    <div
                      key={event.id}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleEventClick(event);
                      }}
                      className={`
                        text-xs p-2 rounded-lg cursor-pointer transition-all
                        ${typeDetails.bgColor} ${typeDetails.textColor} ${typeDetails.borderColor}
                        border hover:shadow-sm truncate group
                      `}
                      title={event.title}
                    >
                      <div className="flex items-center space-x-1.5">
                        <typeDetails.icon className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate font-medium">{event.title}</span>
                      </div>
                      {!event.is_all_day && (
                        <div className="text-xs opacity-75 mt-1">
                          {format(event.start, 'HH:mm')}
                        </div>
                      )}
                    </div>
                  );
                })}
                {dayEvents.length > MONTH_DAY_EVENT_PREVIEW && (
                  <button
                    type="button"
                    className="text-xs text-indigo-600 pl-2 font-medium hover:underline text-left w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedMonthDay(day);
                    }}
                  >
                    +{dayEvents.length - MONTH_DAY_EVENT_PREVIEW} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderWeekView = () => (
    <div className="flex-1 p-8">
      {/* Week Header */}
      <div className="grid grid-cols-8 gap-1 mb-6">
        <div className="py-4"></div> {/* Empty space for time column */}
        {weekDays.map((day) => (
          <div key={day.toISOString()} className="text-center py-4 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
              {format(day, 'EEE')}
            </div>
            <div className={`
              text-lg font-bold mt-1 w-10 h-10 rounded-full flex items-center justify-center mx-auto
              ${isToday(day) ? 'bg-indigo-600 text-white' : 'text-gray-900'}
            `}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Week Grid */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="grid grid-cols-8 border-b border-gray-100 last:border-b-0">
            <div className="px-4 py-3 text-sm text-gray-500 border-r border-gray-100 bg-gray-50 font-medium">
              {format(new Date().setHours(hour, 0, 0, 0), 'HH:mm')}
            </div>
            {weekDays.map((day) => {
              const dayEvents = getEventsForDay(day).filter(event => 
                !event.is_all_day && event.start.getHours() === hour
              );
              
              return (
                <div 
                  key={`${day.toISOString()}-${hour}`} 
                  className="min-h-[60px] p-2 border-r border-gray-100 last:border-r-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    const clickedDateTime = new Date(day);
                    clickedDateTime.setHours(hour, 0, 0, 0);
                    setNewEvent(prev => ({
                      ...prev,
                      start_time: format(clickedDateTime, "yyyy-MM-dd'T'HH:mm"),
                      end_time: format(new Date(clickedDateTime.getTime() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm")
                    }));
                    setNewEventDialogOpen(true);
                  }}
                >
                  {dayEvents.map((event: CalendarEvent) => {
                    const typeDetails = getEventTypeDetails(event.event_type);
                    return (
                      <div
                        key={event.id}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleEventClick(event);
                        }}
                        className={`
                          text-xs p-2 rounded-lg cursor-pointer transition-all mb-1
                          ${typeDetails.bgColor} ${typeDetails.textColor} ${typeDetails.borderColor}
                          border hover:shadow-sm
                        `}
                        title={event.title}
                      >
                        <div className="flex items-center space-x-1">
                          <typeDetails.icon className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate font-medium">{event.title}</span>
                        </div>
                        <div className="text-xs opacity-75 mt-0.5">
                          {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const renderAgendaView = () => {
    const agendaEnd = endOfDay(addDays(currentDate, agendaRangeDays - 1));
    const sortedAgendaEvents = events
      .filter((event) => event.start >= startOfDay(currentDate) && event.start <= agendaEnd)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const agendaEvents = sortedAgendaEvents.slice(0, agendaVisibleCount);
    const hasMoreAgendaEvents = sortedAgendaEvents.length > agendaVisibleCount;

    return (
      <div className="flex-1 p-8">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {agendaEvents.length === 0 ? (
            <div className="text-center py-20">
              <CalendarIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No upcoming events</h3>
              <p className="text-gray-500 mb-6">Create your first event to get started</p>
              <Button 
                onClick={() => setNewEventDialogOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {agendaEvents.map((event: CalendarEvent) => {
                const typeDetails = getEventTypeDetails(event.event_type);
                const eventDate = formatInTimeZone(
                  event.start,
                  selectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                  'EEEE, MMMM d, yyyy'
                );
                const isToday = isSameDay(event.start, new Date());
                const isPast = event.start < new Date();
                
                return (
                  <div 
                    key={event.id}
                    onClick={() => handleEventClick(event)}
                    className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start space-x-4">
                      <div className={`
                        p-3 rounded-xl flex-shrink-0 ${typeDetails.bgColor} ${typeDetails.borderColor} border
                      `}>
                        <typeDetails.icon className={`h-6 w-6 ${typeDetails.textColor}`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className={`
                            text-lg font-semibold truncate
                            ${isPast ? 'text-gray-500' : 'text-gray-900'}
                          `}>
                            {event.title}
                          </h3>
                          <div className={`
                            text-sm px-3 py-1 rounded-full font-medium
                            ${isToday ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}
                          `}>
                            {isToday ? 'Today' : eventDate}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                          <div className="flex items-center space-x-1">
                            <Clock className="h-4 w-4" />
                            <span>
                              {event.is_all_day 
                                ? 'All day' 
                                : `${format(event.start, 'HH:mm')} - ${format(event.end, 'HH:mm')}`
                              }
                            </span>
                          </div>
                          {event.location && (
                            <div className="flex items-center space-x-1">
                              <MapPin className="h-4 w-4" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}
                        </div>
                        
                        {event.description && (
                          <p className={`
                            text-sm leading-relaxed line-clamp-2
                            ${isPast ? 'text-gray-400' : 'text-gray-600'}
                          `}>
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {hasMoreAgendaEvents && (
            <div className="p-4 border-t border-gray-100 text-center">
              <Button
                variant="outline"
                onClick={() => setAgendaVisibleCount((count) => count + AGENDA_PAGE_SIZE)}
              >
                Load more ({sortedAgendaEvents.length - agendaVisibleCount} remaining)
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCurrentView = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="text-gray-500">Loading calendar...</span>
          </div>
        </div>
      );
    }

    switch (viewMode) {
      case 'week':
        return renderWeekView();
      case 'agenda':
        return renderAgendaView();
      default:
        return renderMonthView();
    }
  };

  return (
    <div className="bg-gray-50">
      <div className="flex max-h-[calc(100dvh-5rem)] min-h-0 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-0 shadow-sm rounded-none bg-white">
          {renderCalendarHeader()}
          
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {renderCurrentView()}
          </div>
        </Card>

        <Dialog open={!!expandedMonthDay} onOpenChange={(open) => !open && setExpandedMonthDay(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle>
              {expandedMonthDay ? format(expandedMonthDay, 'EEEE, MMMM d, yyyy') : 'Day events'}
            </DialogTitle>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto mt-2">
              {expandedMonthDay &&
                getEventsForDay(expandedMonthDay).map((event) => {
                  const typeDetails = getEventTypeDetails(event.event_type);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`w-full text-left text-sm p-3 rounded-lg border ${typeDetails.bgColor} ${typeDetails.textColor} ${typeDetails.borderColor}`}
                      onClick={() => {
                        setExpandedMonthDay(null);
                        handleEventClick(event);
                      }}
                    >
                      <div className="font-medium">{event.title}</div>
                      {!event.is_all_day && (
                        <div className="text-xs opacity-75 mt-1">
                          {format(event.start, 'HH:mm')} – {format(event.end, 'HH:mm')}
                        </div>
                      )}
                    </button>
                  );
                })}
              {expandedMonthDay && getEventsForDay(expandedMonthDay).length === 0 && (
                <p className="text-sm text-gray-500">No events on this day.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Event Detail Modal */}
        {selectedEvent && (
          <EventDetailModal
            open={isDetailModalOpen}
            event={{
              ...selectedEvent,
              start_date: selectedEvent.start.toISOString(),
              end_date: selectedEvent.end.toISOString(),
              description: selectedEvent.description || undefined,
              location: selectedEvent.location || undefined
            }}
            onClose={() => setDetailModalOpen(false)}
            onDelete={(eventId) => handleDeleteEvent(eventId)}
          />
        )}

        {/* New Event Modal */}
        <Dialog 
          open={isNewEventDialogOpen} 
          onOpenChange={(open) => {
            setNewEventDialogOpen(open);
            if (!open) {
              setTimeout(() => {
                setNewEvent({
                  title: '',
                  description: '',
                  start_time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                  end_time: format(new Date(new Date().getTime() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm"),
                  event_type: 'meeting',
                  organization_id: user?.organization_id,
                  user_id: user?.id,
                  is_all_day: false,
                  location: '',
                  timezone: getSystemTimezone(),
                  meeting_link: '',
                });
              }, 300);
            }
          }}
        >
          <DialogContent 
            className="sm:max-w-[760px] max-h-[90vh] p-0 overflow-hidden rounded-2xl border-0 shadow-xl"
            showCloseButton={false}
          >
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-5 border-b border-gray-100 relative">
              <DialogTitle className="text-xl font-semibold text-gray-900 flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <CalendarIcon className="h-5 w-5 text-indigo-600" />
                </div>
                Create New Event
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewEventDialogOpen(false)}
                className="absolute right-4 top-4 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg p-2"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="px-6 py-6 overflow-y-auto max-h-[65vh]">
              <div className="space-y-6">
                <div>
                  <Label htmlFor="title" className="text-sm font-semibold text-gray-700 block mb-2">
                    Event Title
                  </Label>
                  <Input
                    id="title"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 h-11"
                    placeholder="Enter event title"
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="text-sm font-semibold text-gray-700 block mb-2">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 min-h-[100px] resize-none"
                    placeholder="Add event description..."
                  />
                </div>

                <div>
                  <Label htmlFor="location" className="text-sm font-semibold text-gray-700 block mb-2">
                    Location
                  </Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="location"
                      value={newEvent.location}
                      onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                      className="pl-11 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 h-11"
                      placeholder="Add location"
                    />
                  </div>
                </div>

                {(newEvent.event_type === 'meeting' || newEvent.event_type === 'call' || newEvent.event_type === 'video_call') && (
                  <div>
                    <Label htmlFor="meeting_link" className="text-sm font-semibold text-gray-700 block mb-2">
                      Meeting Link
                    </Label>
                    <Input
                      id="meeting_link"
                      type="url"
                      value={newEvent.meeting_link}
                      onChange={(e) => setNewEvent({ ...newEvent, meeting_link: e.target.value })}
                      className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 h-11"
                      placeholder="https://meet.google.com/..."
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">Event Type</Label>
                  <div className="grid grid-cols-5 gap-3">
                    {eventTypes.map(type => (
                      <div 
                        key={type.value}
                        className={`
                          relative border-2 rounded-xl p-4 cursor-pointer transition-all duration-200 flex flex-col items-center justify-center space-y-2
                          ${newEvent.event_type === type.value
                            ? `${type.bgColor} ${type.borderColor} ring-2 ring-offset-2 ring-indigo-300`
                            : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                          }
                        `}
                        onClick={() => setNewEvent({ ...newEvent, event_type: type.value })}
                      >
                        <type.icon className={`h-6 w-6 ${newEvent.event_type === type.value ? type.textColor : 'text-gray-500'}`} />
                        <span className={`text-xs font-medium text-center ${newEvent.event_type === type.value ? type.textColor : 'text-gray-700'}`}>
                          {type.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 mb-2 block">Event type</Label>
                    <Select
                      value={newEvent.event_type}
                      onValueChange={(v) => setNewEvent({ ...newEvent, event_type: v })}
                    >
                      <SelectTrigger className="h-11 border-gray-200">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {eventTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 mb-2 block">Timezone</Label>
                    <Select
                      value={newEvent.timezone}
                      onValueChange={(v) => setNewEvent({ ...newEvent, timezone: v })}
                    >
                      <SelectTrigger className="h-11 border-gray-200">
                        <SelectValue placeholder="Timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {timezoneOptions.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start_time" className="text-sm font-semibold text-gray-700 block mb-2">
                      Start Time
                    </Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <Input
                        id="start_time"
                        type="datetime-local"
                        value={newEvent.start_time}
                        onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                        className="pl-11 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 h-11"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="end_time" className="text-sm font-semibold text-gray-700 block mb-2">
                      End Time
                    </Label>
                    <div className="relative">
                      <Clock3 className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <Input
                        id="end_time"
                        type="datetime-local"
                        value={newEvent.end_time}
                        onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                        className="pl-11 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 h-11"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="duration-preset" className="text-sm font-semibold text-gray-700 block mb-2">
                    Quick duration (from start)
                  </Label>
                  <select
                    id="duration-preset"
                    defaultValue=""
                    className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900"
                    onChange={(e) => {
                      const v = e.target.value;
                      e.target.selectedIndex = 0;
                      if (!v) return;
                      const minutes = Number(v);
                      const start = new Date(newEvent.start_time);
                      if (Number.isNaN(start.getTime())) return;
                      const end = new Date(start.getTime() + minutes * 60 * 1000);
                      setNewEvent({
                        ...newEvent,
                        end_time: format(end, "yyyy-MM-dd'T'HH:mm"),
                      });
                    }}
                  >
                    <option value="">Choose duration…</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700">Duration mode</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className={`
                        flex items-center justify-center px-4 py-3 border-2 rounded-xl transition-all duration-200 font-medium
                        ${!newEvent.is_all_day
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-100'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 bg-white'
                        }
                      `}
                      onClick={() => setNewEvent({ ...newEvent, is_all_day: false })}
                    >
                      <Clock className="h-5 w-5 mr-2" />
                      Time Specific
                    </button>
                    <button
                      type="button"
                      className={`
                        flex items-center justify-center px-4 py-3 border-2 rounded-xl transition-all duration-200 font-medium
                        ${newEvent.is_all_day
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-100'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 bg-white'
                        }
                      `}
                      onClick={() => setNewEvent({ ...newEvent, is_all_day: true })}
                    >
                      <CalendarDays className="h-5 w-5 mr-2" />
                      All Day
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => setNewEventDialogOpen(false)}
                className="border-gray-300 hover:bg-gray-100 px-6"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateNewEvent}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 shadow-sm"
                disabled={!newEvent.title}
              >
                Create Event
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
