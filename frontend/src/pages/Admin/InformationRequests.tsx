import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { informationRequestsAPI } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Textarea';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../store/auth';

type Status = 'pending' | 'in_progress' | 'completed' | 'rejected';

interface InformationRequest {
  id: number;
  lead_id: number;
  requested_by: number;
  field_name: string;
  status: Status;
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  requester_name: string;
  lead_name: string;
}

export function InformationRequests() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = React.useState<Status | 'all'>('all');
  const [noteText, setNoteText] = React.useState('');
  const [editingRequestId, setEditingRequestId] = React.useState<number | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['information-requests'],
    queryFn: async () => {
      try {
        if (!user?.is_admin) {
          console.error('User is not admin:', user);
          return [];
        }

        const response = await informationRequestsAPI.getAllRequests();
        return Array.isArray(response.data) ? response.data : [];
      } catch (error) {
        console.error('API Error:', error);
        return [];
      }
    },
    enabled: !!user?.is_admin
  });


  const updateRequestMutation = useMutation({
    mutationFn: ({ requestId, status, notes }: { requestId: number; status: Status; notes?: string }) =>
      informationRequestsAPI.updateStatus(requestId, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['information-requests'] });
      setEditingRequestId(null);
      setNoteText('');
      toast.success('Request updated successfully');
    },
    onError: () => {
      toast.error('Failed to update request');
    },
  });

  const filteredRequests = React.useMemo(() => {
    if (!Array.isArray(requests)) return [];
    if (selectedStatus === 'all') return requests;
    return requests.filter((request: InformationRequest) => request.status === selectedStatus);
  }, [requests, selectedStatus]);


  const handleStatusChange = async (requestId: number, newStatus: Status) => {
    await updateRequestMutation.mutateAsync({
      requestId,
      status: newStatus,
      notes: noteText || undefined,
    });
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Information Requests</h2>
        <div className="flex space-x-2">
          {(['all', 'pending', 'in_progress', 'completed', 'rejected'] as const).map((status) => (
            <Button
              key={status}
              variant={selectedStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedStatus(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center text-muted-foreground">No requests found</div>
      ) : (
        <div className="grid gap-4">
          {filteredRequests.map((request: InformationRequest) => (
            <div
              key={request.id}
              className="bg-card p-4 rounded-lg shadow-sm"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-medium">Lead: {request.lead_name}</h3>
                  <p className="text-sm text-muted-foreground">Field: {request.field_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Requested by: {request.requester_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Requested: {new Date(request.created_at).toLocaleString()}
                  </p>
                  {request.notes && (
                    <p className="text-sm text-muted-foreground mt-2">Notes: {request.notes}</p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded text-xs ${statusColors[request.status as Status]}`}>
                  {request.status.replace('_', ' ')}
                </span>
              </div>

              {editingRequestId === request.id ? (
                <div className="space-y-4">
                  <Textarea
                    placeholder="Add notes..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="w-full"
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(request.id, request.status)}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingRequestId(null);
                        setNoteText('');
                      }}
                    >
                      Cancel
                    </Button>
                    {request.status === 'pending' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleStatusChange(request.id, 'in_progress')}
                      >
                        Mark as In Progress
                      </Button>
                    )}
                    {request.status !== 'completed' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(request.id, 'completed')}
                      >
                        Mark as Completed
                      </Button>
                    )}
                    {request.status !== 'rejected' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleStatusChange(request.id, 'rejected')}
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingRequestId(request.id);
                    setNoteText(request.notes || '');
                  }}
                >
                  Update Status
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
