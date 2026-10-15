import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Search, Paperclip, Upload, Trash2 as TrashIcon } from 'lucide-react';
import { formatLocalDateTime } from '@/lib/localDateTime';
import tasksAPI, { TaskPriority, TaskStatus } from '@/services/tasks';
import type { Task } from '@/services/tasks';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/apiError';
import usersAPI, { User } from '@/services/api/users';
import { openAttachmentInNewTab, taskAttachmentUrl } from '@/lib/apiAttachmentUrls';
import { useAuthStore } from '@/store/auth';
import {
  displayAssigneeLabel,
  displayUserInitials,
  extractUserList,
  filterAssigneeUsers,
  normalizeAssigneeUsers,
} from '@/utils/assigneeUsers';

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  /** When true, render as an inline page panel instead of a Dialog (for /tasks/:id). */
  asPage?: boolean;
}

export function TaskDetailModal({ task, isOpen, onClose, asPage = false }: TaskDetailModalProps) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [openingTaskAttachmentKey, setOpeningTaskAttachmentKey] = useState<string | null>(null);

  // Helper function to capitalize first letter
  const capitalizeFirstLetter = (str: string) => {
    return str.toLowerCase().split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Fetch current task data - this will allow us to refresh it after updates
  const { data: currentTaskData, refetch: refetchTaskDetails, error: taskDetailError } = useQuery({
    queryKey: ['task-details', task?.id],
    queryFn: async () => {
      if (!task?.id) return null;
      try {
        return await tasksAPI.getTask(task.id);
      } catch (error) {
        console.error('Error fetching task details:', error);
        // Return the original task object if there's an error fetching updated details
        return task;
      }
    },
    enabled: !!task?.id && isOpen,
    staleTime: 0, // Always refetch when needed
  });

  // Use the most up-to-date task data
  const currentTask = currentTaskData || task;

  // Safe date formatting function
  const safeFormatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return formatLocalDateTime(dateString) || 'N/A';
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Invalid date';
    }
  };

  // Local datetime for datetime-local input (avoid UTC skew from toISOString)
  const safeISOFormat = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (error) {
      console.error('Error formatting ISO date:', dateString, error);
      return '';
    }
  };

  const { data: usersData, isLoading: isLoadingUsers, error: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ['assignable-users', currentUser?.organization_id],
    queryFn: async () => {
      const response = await usersAPI.getAssignable();
      return normalizeAssigneeUsers(extractUserList(response), currentUser);
    },
    enabled: isOpen && !!currentUser?.organization_id,
  });

  // Filter users based on search
  const filteredUsers = filterAssigneeUsers(usersData || [], userSearchTerm);

  useEffect(() => {
    if (currentTask && !isEditing) {
      setFormData({
        title: currentTask.title,
        description: currentTask.description,
        priority: currentTask.priority,
        status: currentTask.status,
        due_date: currentTask.due_date,
        assigned_to_id: currentTask.assigned_to?.id,
        lead_id: currentTask.lead?.id,
      });
      if (currentTask.assigned_to) {
        setSelectedUser(currentTask.assigned_to);
      }
    }
  }, [currentTask, isEditing]);

  const updateTaskMutation = useMutation({
    mutationFn: (data: Partial<Task>) => tasksAPI.updateTask(task!.id, data),
    onSuccess: async () => {
      // Invalidate both the specific task query and the general tasks list
      queryClient.invalidateQueries({ queryKey: ['task-details', task?.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      
      // Immediately refetch the task details to update the UI
      await refetchTaskDetails();
      
      setIsEditing(false);
      toast.success('Task updated successfully');
    },
    onError: () => {
      toast.error('Failed to update task');
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: () => tasksAPI.deleteTask(currentTask!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
      toast.success('Task deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete task. Please try again later');
      console.error('Error deleting task:', error);
    },
  });

  const {
    data: attachments = [],
    isLoading: isLoadingAttachments,
    isError: attachmentsError,
    refetch: refetchAttachments,
  } = useQuery({
    queryKey: ['task-attachments', currentTask?.id],
    queryFn: async () => {
      const data = await tasksAPI.listTaskAttachments(currentTask!.id);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!currentTask?.id && isOpen,
    retry: 1,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentTask?.id) return;
    setUploadingAttachment(true);
    try {
      await tasksAPI.uploadTaskAttachment(currentTask.id, file);
      await refetchAttachments();
      toast.success('Attachment uploaded');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not upload attachment'));
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (storedName: string) => {
    if (!currentTask?.id) return;
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await tasksAPI.deleteTaskAttachment(currentTask.id, storedName);
      await refetchAttachments();
      toast.success('Attachment deleted');
    } catch {
      toast.error('Could not delete attachment');
    }
  };

  const handleEdit = () => {
    setFormData(currentTask || {});
    setIsEditing(true);
  };

  const handleSave = () => {
    updateTaskMutation.mutate(formData);
  };

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    deleteTaskMutation.mutate();
    setIsDeleteDialogOpen(false);
  };

  if (!currentTask) return null;

  const detailBody = (
          <div className={asPage ? 'py-2' : 'py-4'}>
            {asPage && (
              <h2 className="mb-4 text-xl font-semibold">
                {isEditing ? 'Edit Task' : currentTask.title || 'Task Details'}
              </h2>
            )}
            {isEditing ? (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label htmlFor="title" className="text-sm font-medium">Title</label>
                    <Input
                      id="title"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="border-gray-200 focus:border-blue-500"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label htmlFor="priority" className="text-sm font-medium">Priority</label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: TaskPriority) => 
                        setFormData({ ...formData, priority: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(TaskPriority).map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {capitalizeFirstLetter(priority)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <label htmlFor="description" className="text-sm font-medium">Description</label>
                  <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="border-gray-200 focus:border-blue-500 min-h-[100px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label htmlFor="status" className="text-sm font-medium">Status</label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: TaskStatus) => 
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(TaskStatus).map((status) => (
                          <SelectItem key={status} value={status}>
                            {capitalizeFirstLetter(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <label htmlFor="due_date" className="text-sm font-medium">Due Date</label>
                    <Input
                      id="due_date"
                      type="datetime-local"
                      value={safeISOFormat(formData.due_date)}
                      onChange={(e) => {
                        try {
                          const isoDate = new Date(e.target.value).toISOString();
                          setFormData({ ...formData, due_date: isoDate });
                        } catch (error) {
                          console.error('Error converting date input:', error);
                          // Keep the previous value if there's an error
                        }
                      }}
                      className="border-gray-200 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label htmlFor="assigned_to" className="text-sm font-medium">Assigned To</label>
                    <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between bg-white hover:bg-gray-50"
                          disabled={isLoadingUsers && !selectedUser}
                        >
                          {isLoadingUsers && !selectedUser ? (
                            <div className="flex items-center">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                              Loading users...
                            </div>
                          ) : selectedUser ? (
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-2">
                                  {displayUserInitials(selectedUser)}
                                </div>
                                <div className="flex flex-col items-start min-w-0">
                                  <span className="font-medium truncate">{displayAssigneeLabel(selectedUser, currentUser)}</span>
                                  {selectedUser.job_title && (
                                    <span className="text-xs text-gray-500">{selectedUser.job_title}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center text-gray-500">
                              <span>Select user...</span>
                            </div>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <div className="px-3 py-2 border-b">
                          <div className="flex items-center space-x-2 bg-gray-50 rounded-md px-2">
                            <Search className="w-4 h-4 text-gray-500" />
                            <Input
                              placeholder="Search users..."
                              value={userSearchTerm}
                              onChange={(e) => setUserSearchTerm(e.target.value)}
                              className="h-8 border-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                            />
                          </div>
                        </div>
                        <div className="max-h-[250px] overflow-y-auto">
                          {isLoadingUsers ? (
                            <div className="p-4 text-center text-sm text-gray-500">
                              <div className="flex items-center justify-center">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                                Loading users...
                              </div>
                            </div>
                          ) : usersError ? (
                            <div className="p-4 text-center text-sm text-red-500">
                              <div className="flex flex-col items-center space-y-2">
                                <span className="font-medium">Error loading users</span>
                                <span className="text-xs">
                                  {(usersError as any)?.response?.data?.detail || usersError.message || 'Failed to load assignable users'}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => refetchUsers()}
                                >
                                  Retry
                                </Button>
                              </div>
                            </div>
                          ) : filteredUsers.length === 0 ? (
                            <div className="p-4 text-center text-sm text-gray-500">No users found</div>
                          ) : (
                            filteredUsers.map((user: User) => (
                              <div
                                key={user.id}
                                className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setFormData(prev => ({ ...prev, assigned_to_id: user.id }));
                                  setUserPopoverOpen(false);
                                }}
                              >
                                <div className="flex items-center w-full">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-2">
                                    {displayUserInitials(user)}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium truncate">{displayAssigneeLabel(user, currentUser)}</span>
                                    {user.job_title && (
                                      <span className="text-xs text-gray-500">{user.job_title}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditing(false)}
                    className="hover:bg-gray-100"
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={handleSave}
                    className="hover:bg-gray-100"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Task Header */}
                <div className="flex items-start justify-between border-b pb-4">
                  <div>
                    <h3
                      className="text-lg font-medium text-gray-900 cursor-text hover:underline"
                      onClick={handleEdit}
                      title="Click to edit"
                    >
                      {currentTask.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Created on {safeFormatDate(currentTask.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${currentTask.priority === TaskPriority.LOW ? 'bg-gray-100 text-gray-800' :
                        currentTask.priority === TaskPriority.MEDIUM ? 'bg-blue-100 text-blue-800' :
                        currentTask.priority === TaskPriority.HIGH ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'}`}>
                      {capitalizeFirstLetter(currentTask.priority)}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${currentTask.status === TaskStatus.PENDING ? 'bg-yellow-100 text-yellow-800' :
                        currentTask.status === TaskStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-800' :
                        currentTask.status === TaskStatus.COMPLETED ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'}`}>
                      {capitalizeFirstLetter(currentTask.status)}
                    </span>
                  </div>
                </div>

                {/* Task Details */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Description</h4>
                      <p
                        className="mt-1 text-sm text-gray-900 cursor-text hover:underline"
                        onClick={handleEdit}
                        title="Click to edit"
                      >
                        {currentTask.description || 'No description provided'}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Due Date</h4>
                      <p className="mt-1 text-sm text-gray-900">
                        {safeFormatDate(currentTask.due_date)}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Last Updated</h4>
                      <p className="mt-1 text-sm text-gray-900">
                        {safeFormatDate(currentTask.updated_at)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Assigned To</h4>
                      {currentTask.assigned_to ? (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            {(currentTask.assigned_to.first_name?.[0] || '')}
                            {(currentTask.assigned_to.last_name?.[0] || '')}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {currentTask.assigned_to.first_name} {currentTask.assigned_to.last_name}
                            </p>
                            {currentTask.assigned_to.job_title && (
                              <p className="text-xs text-gray-500">{currentTask.assigned_to.job_title}</p>
                            )}
                          </div>
                        </div>
                      ) : currentTask.assigned_to_id ? (
                        <p className="mt-1 text-sm text-gray-900">
                          {usersData?.find((u) => Number(u.id) === Number(currentTask.assigned_to_id))
                            ? displayUserName(
                                usersData.find((u) => Number(u.id) === Number(currentTask.assigned_to_id))!,
                              )
                            : `User #${currentTask.assigned_to_id}`}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-gray-500">Not assigned</p>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Associated Lead</h4>
                      {currentTask.lead ? (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            {currentTask.lead.first_name[0]}{currentTask.lead.last_name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {currentTask.lead.first_name} {currentTask.lead.last_name}
                            </p>
                            {currentTask.lead.company && (
                              <p className="text-xs text-gray-500">{currentTask.lead.company}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-gray-500">No lead associated</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Attachments
                    </h4>
                    <label className="inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs cursor-pointer bg-white hover:bg-gray-100">
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingAttachment ? 'Uploading...' : 'Upload file'}
                      <input type="file" className="hidden" onChange={handleAttachmentUpload} disabled={uploadingAttachment} />
                    </label>
                  </div>
                  {isLoadingAttachments ? (
                    <p className="mt-2 text-sm text-gray-500">Loading attachments...</p>
                  ) : attachmentsError ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                      <span>Could not load attachments.</span>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void refetchAttachments()}
                      >
                        Retry
                      </button>
                    </div>
                  ) : attachments.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">No attachments yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {attachments.map((attachment) => (
                        <div key={attachment.stored_name} className="flex items-center justify-between rounded border bg-white px-3 py-2">
                          <button
                            type="button"
                            disabled={openingTaskAttachmentKey === `${currentTask.id}-${attachment.stored_name}`}
                            onClick={async () => {
                              const key = `${currentTask.id}-${attachment.stored_name}`;
                              try {
                                setOpeningTaskAttachmentKey(key);
                                await openAttachmentInNewTab(
                                  taskAttachmentUrl(currentTask.id, attachment.stored_name)
                                );
                              } catch (e) {
                                console.error(e);
                                toast.error('Could not open attachment');
                              } finally {
                                setOpeningTaskAttachmentKey(null);
                              }
                            }}
                            className="text-sm text-blue-700 hover:underline text-left disabled:opacity-50"
                          >
                            {openingTaskAttachmentKey === `${currentTask.id}-${attachment.stored_name}`
                              ? 'Opening…'
                              : attachment.filename}
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{formatFileSize(attachment.size_bytes)}</span>
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteAttachment(attachment.stored_name)}
                              aria-label="Delete attachment"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-4 mt-6 border-t">
                  <Button
                    variant="outline"
                    onClick={handleEdit}
                    className="hover:bg-gray-100"
                  >
                    Edit Task
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDeleteClick}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    Delete Task
                  </Button>
                </div>
              </div>
            )}
          </div>
  );

  return (
    <>
      {asPage ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          {detailBody}
        </div>
      ) : (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-white shadow-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                <span>{isEditing ? 'Edit Task' : 'Task Details'}</span>
              </DialogTitle>
            </DialogHeader>
            {detailBody}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Delete Task
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Are you sure you want to delete this task? This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleConfirmDelete}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
