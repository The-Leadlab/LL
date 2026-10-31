import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Button } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';

const eventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  location: z.string().optional(),
  type: z.enum(['meeting', 'call', 'task']),
  color: z.string().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId?: number;
}

export function AddEventModal({ isOpen, onClose, leadId }: AddEventModalProps) {
  const { user } = useAuth();
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      type: 'meeting',
      color: '#3B82F6',
    },
  });

  const onSubmit = async (data: EventFormData) => {
    try {
      // API çağrısı yapılacak
      const eventData = {
        ...data,
        lead_id: leadId,
        organization_id: user?.organization_id,
        created_by: user?.id,
      };
      
      toast.success('Event created successfully');
      onClose();
    } catch (error) {
      toast.error('An error occurred while creating the event');
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-muted/500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-card px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-card text-gray-400 hover:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-foreground dark:text-white">
                      New Event
                    </Dialog.Title>

                    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                      {/* Title */}
                      <div>
                        <label htmlFor="title" className="block text-sm font-medium text-foreground dark:text-gray-200">
                          Title
                        </label>
                        <input
                          type="text"
                          id="title"
                          {...register('title')}
                          className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-muted dark:border-gray-600 dark:text-white"
                        />
                        {errors.title && (
                          <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                        )}
                      </div>

                      {/* Description */}
                      <div>
                        <label htmlFor="description" className="block text-sm font-medium text-foreground dark:text-gray-200">
                          Description
                        </label>
                        <textarea
                          id="description"
                          rows={3}
                          {...register('description')}
                          className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-muted dark:border-gray-600 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Start Date */}
                        <div>
                          <label htmlFor="start_date" className="block text-sm font-medium text-foreground dark:text-gray-200">
                            Start Date
                          </label>
                          <input
                            type="datetime-local"
                            id="start_date"
                            {...register('start_date')}
                            className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-muted dark:border-gray-600 dark:text-white"
                          />
                          {errors.start_date && (
                            <p className="mt-1 text-sm text-red-600">{errors.start_date.message}</p>
                          )}
                        </div>

                        {/* End Date */}
                        <div>
                          <label htmlFor="end_date" className="block text-sm font-medium text-foreground dark:text-gray-200">
                            End Date
                          </label>
                          <input
                            type="datetime-local"
                            id="end_date"
                            {...register('end_date')}
                            className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-muted dark:border-gray-600 dark:text-white"
                          />
                          {errors.end_date && (
                            <p className="mt-1 text-sm text-red-600">{errors.end_date.message}</p>
                          )}
                        </div>
                      </div>

                      {/* Location */}
                      <div>
                        <label htmlFor="location" className="block text-sm font-medium text-foreground dark:text-gray-200">
                          Location
                        </label>
                        <input
                          type="text"
                          id="location"
                          {...register('location')}
                          className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-muted dark:border-gray-600 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Type */}
                        <div>
                          <label htmlFor="type" className="block text-sm font-medium text-foreground dark:text-gray-200">
                            Type
                          </label>
                          <select
                            id="type"
                            {...register('type')}
                            className="mt-1 block w-full rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-muted dark:border-gray-600 dark:text-white"
                          >
                            <option value="meeting">Meeting</option>
                            <option value="call">Call</option>
                            <option value="task">Task</option>
                          </select>
                        </div>

                        {/* Color */}
                        <div>
                          <label htmlFor="color" className="block text-sm font-medium text-foreground dark:text-gray-200">
                            Color
                          </label>
                          <input
                            type="color"
                            id="color"
                            {...register('color')}
                            className="mt-1 block w-full h-9 rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                      </div>

                      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                        <Button
                          type="submit"
                          disabled={isSubmitting}
                          className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
                        >
                          {isSubmitting ? 'Creating...' : 'Create'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={onClose}
                          className="mt-3 inline-flex w-full justify-center rounded-md border border-border bg-card px-4 py-2 text-base font-medium text-foreground shadow-sm hover:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:mt-0 sm:w-auto sm:text-sm dark:bg-muted dark:border-gray-600 dark:text-white dark:hover:bg-gray-600"
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
