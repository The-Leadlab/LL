import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailSequencesAPI, EmailSequence, SequenceStats } from '@/services/api/email-sequences';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/hooks/use-toast';
import { Mail, Plus, Edit, Trash2, Play, Pause, TrendingUp, Users, CheckCircle, Reply, Loader2 } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/utils';

export const SequenceList: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch sequences
  const { data: sequences, isLoading } = useQuery({
    queryKey: ['email-sequences'],
    queryFn: () => emailSequencesAPI.getAll()
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['email-sequences', 'stats'],
    queryFn: emailSequencesAPI.getStats
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: emailSequencesAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-sequences'] });
      toast({
        title: 'Success',
        description: 'Sequence deleted successfully'
      });
    }
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      emailSequencesAPI.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-sequences'] });
      toast({
        title: 'Success',
        description: 'Sequence status updated'
      });
    }
  });

  const getSequenceStats = (sequenceId: number): SequenceStats | undefined => {
    return stats?.find(s => s.id === sequenceId);
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Campaigns</h1>
            <p className="text-gray-600 mt-1">
              Campaigns are created when you launch Cold Outreach. Open a campaign here to review activity.
            </p>
          </div>
          <Button onClick={() => navigate('/emails/outreach')}>
            <Plus className="h-4 w-4 mr-2" />
            Launch in Cold Outreach
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Campaigns</p>
                  <p className="text-2xl font-bold">{sequences?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Enrolled</p>
                  <p className="text-2xl font-bold">
                    {sequences?.reduce((sum, s) => sum + s.total_enrolled, 0) || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-2xl font-bold">
                    {sequences?.reduce((sum, s) => sum + s.total_completed, 0) || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Reply className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Replies</p>
                  <p className="text-2xl font-bold">
                    {sequences?.reduce((sum, s) => sum + s.total_replied, 0) || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sequences List */}
        <div className="space-y-4">
          {sequences && sequences.length > 0 ? (
            sequences.map((sequence) => {
              const sequenceStats = getSequenceStats(sequence.id);
              return (
                <Card key={sequence.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold">{sequence.name}</h3>
                          {sequence.is_active ? (
                            <Badge className="bg-green-100 text-green-800">
                              <Play className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Pause className="h-3 w-3 mr-1" />
                              Paused
                            </Badge>
                          )}
                        </div>
                        {sequence.description && (
                          <p className="text-gray-600 mb-4">{sequence.description}</p>
                        )}

                        {/* Steps Info */}
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                          <span>{sequence.steps.length} steps</span>
                          <span>•</span>
                          <span>{sequence.total_enrolled} enrolled</span>
                          <span>•</span>
                          <span>Created {formatDate(sequence.created_at)}</span>
                        </div>

                        {/* Performance Metrics */}
                        {sequenceStats && (
                          <div className="flex items-center gap-6 text-sm">
                            <div>
                              <span className="text-gray-600">Reply Rate:</span>
                              <span className="ml-2 font-semibold text-green-600">
                                {sequenceStats.reply_rate.toFixed(1)}%
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Completion Rate:</span>
                              <span className="ml-2 font-semibold text-blue-600">
                                {sequenceStats.completion_rate.toFixed(1)}%
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Active:</span>
                              <span className="ml-2 font-semibold">
                                {sequenceStats.active_enrollments}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/email-sequences/${sequence.id}`)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              id: sequence.id,
                              is_active: !sequence.is_active
                            })
                          }
                        >
                          {sequence.is_active ? (
                            <>
                              <Pause className="h-4 w-4 mr-1" />
                              Pause
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              Activate
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this sequence?')) {
                              deleteMutation.mutate(sequence.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Mail className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No email sequences yet</h3>
                <p className="text-gray-600 mb-4">
                  Create your first email sequence to automate your outreach
                </p>
                <Button onClick={() => navigate('/email-sequences/create')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Sequence
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default SequenceList;
