import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cpqAPI, Quote } from '@/services/api/cpq';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Plus, Edit, Send, CheckCircle, X, DollarSign,
  Clock, TrendingUp, Loader2, Eye, Download
} from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical } from 'lucide-react';

export const QuoteList: React.FC = () => {
  const { t } = useTranslation('modules');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Fetch quotes
  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes', statusFilter],
    queryFn: () => cpqAPI.getQuotes(statusFilter || undefined)
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      cpqAPI.updateQuoteStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: t('cpq.common.success'),
        description: t('cpq.quotes.statusUpdated')
      });
    }
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: any; icon: any; label: string }> = {
      draft: { variant: 'secondary', icon: Edit, label: t('cpq.quotes.draft') },
      sent: { variant: 'default', icon: Send, label: t('cpq.quotes.sent') },
      accepted: { variant: 'default', icon: CheckCircle, label: t('cpq.quotes.accepted') },
      rejected: { variant: 'destructive', icon: X, label: t('cpq.quotes.rejected') }
    };
    const style = styles[status] || styles.draft;
    const Icon = style.icon;
    return (
      <Badge variant={style.variant} className={status === 'accepted' ? 'bg-green-100 text-green-800' : ''}>
        <Icon className="h-3 w-3 mr-1" />
        {style.label}
      </Badge>
    );
  };

  // Calculate summary stats
  const stats = React.useMemo(() => {
    if (!quotes) return { total: 0, draft: 0, sent: 0, accepted: 0, totalValue: 0 };
    return {
      total: quotes.length,
      draft: quotes.filter(q => q.status === 'draft').length,
      sent: quotes.filter(q => q.status === 'sent').length,
      accepted: quotes.filter(q => q.status === 'accepted').length,
      totalValue: quotes.reduce((sum, q) => sum + q.total_amount, 0)
    };
  }, [quotes]);

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{t('cpq.quotes.title')}</h1>
            <p className="mt-1 text-sm text-gray-600 md:text-base">
              {t('cpq.quotes.subtitle')}
            </p>
          </div>
          <Button className="min-h-[44px] w-full sm:w-auto" onClick={() => navigate('/cpq/quotes/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('cpq.quotes.create')}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.quotes.total')}</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gray-100 rounded-lg">
                  <Edit className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.quotes.draft')}</p>
                  <p className="text-2xl font-bold">{stats.draft}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Send className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.quotes.sent')}</p>
                  <p className="text-2xl font-bold">{stats.sent}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.quotes.accepted')}</p>
                  <p className="text-2xl font-bold">{stats.accepted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.quotes.totalValue')}</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(stats.totalValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quotes Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>{t('cpq.quotes.all')}</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === '' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('')}
                >
                  {t('cpq.quotes.filterAll')}
                </Button>
                <Button
                  variant={statusFilter === 'draft' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('draft')}
                >
                  {t('cpq.quotes.draft')}
                </Button>
                <Button
                  variant={statusFilter === 'sent' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('sent')}
                >
                  {t('cpq.quotes.sent')}
                </Button>
                <Button
                  variant={statusFilter === 'accepted' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('accepted')}
                >
                  {t('cpq.quotes.accepted')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {quotes && quotes.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('cpq.quotes.number')}</TableHead>
                    <TableHead>{t('cpq.quotes.status')}</TableHead>
                    <TableHead>{t('cpq.quotes.amount')}</TableHead>
                    <TableHead>{t('cpq.quotes.created')}</TableHead>
                    <TableHead>{t('cpq.quotes.validUntil')}</TableHead>
                    <TableHead>{t('cpq.quotes.approval')}</TableHead>
                    <TableHead className="text-right">{t('cpq.quotes.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => (
                    <TableRow key={quote.id} className="cursor-pointer hover:bg-gray-50">
                      <TableCell
                        className="font-medium"
                        onClick={() => navigate(`/cpq/quotes/${quote.id}`)}
                      >
                        {quote.quote_number}
                      </TableCell>
                      <TableCell>{getStatusBadge(quote.status)}</TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(quote.total_amount, quote.currency)}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {formatDate(quote.created_at)}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {quote.valid_until ? formatDate(quote.valid_until) : '-'}
                      </TableCell>
                      <TableCell>
                        {quote.requires_approval ? (
                          quote.approved_by_id ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {t('cpq.quotes.approved')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3 mr-1" />
                              {t('cpq.quotes.pending')}
                            </Badge>
                          )
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/cpq/quotes/${quote.id}`)}>
                              <Eye className="h-4 w-4 mr-2" />
                              {t('cpq.quotes.viewDetails')}
                            </DropdownMenuItem>
                            {quote.status === 'draft' && (
                              <>
                                <DropdownMenuItem onClick={() => navigate(`/cpq/quotes/${quote.id}/edit`)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  {t('cpq.quotes.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => updateStatusMutation.mutate({ id: quote.id, status: 'sent' })}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  {t('cpq.quotes.sendToCustomer')}
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem>
                              <Download className="h-4 w-4 mr-2" />
                              {t('cpq.quotes.downloadPdf')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">{t('cpq.quotes.emptyTitle')}</h3>
                <p className="text-gray-600 mb-4">
                  {t('cpq.quotes.emptyBody')}
                </p>
                <Button onClick={() => navigate('/cpq/quotes/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('cpq.quotes.create')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};

export default QuoteList;
