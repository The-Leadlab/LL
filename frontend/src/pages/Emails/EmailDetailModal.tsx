import React from 'react';
import { X, Reply, ReplyAll, Forward, Trash2, Archive, Star, Paperclip, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface EmailMessage {
  id: number;
  subject: string;
  from_address: string;
  from_name: string;
  to_address: string;
  body_text: string;
  body_html: string;
  received_date: string;
  sent_date: string;
  is_read: boolean;
  is_important: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  folder_name: string;
  email_account_id: number;
  organization_id: number;
}

interface EmailDetailModalProps {
  email: EmailMessage;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (emailId: number) => void;
  onArchive?: (emailId: number) => void;
  onMarkUnread?: (emailId: number) => void;
  onReply: (email: EmailMessage, action: 'reply' | 'reply-all' | 'forward') => void;
}

const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  isOpen,
  onClose,
  onDelete,
  onArchive,
  onMarkUnread,
  onReply
}) => {
  const { t } = useTranslation('emails');
  const formatEmailDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'EEEE, dd MMMM yyyy HH:mm');
  };

  const handleReply = () => {
    onReply(email, 'reply');
    onClose();
  };

  const handleReplyAll = () => {
    onReply(email, 'reply-all');
    onClose();
  };

  const handleForward = () => {
    onReply(email, 'forward');
    onClose();
  };

  const handleMarkUnread = () => {
    onMarkUnread?.(email.id);
    onClose();
  };

  const handleArchive = () => {
    onArchive?.(email.id);
    onClose();
  };

  const handleDelete = () => {
    onDelete(email.id);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('detail.title')}</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-4 top-4"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          <div className="space-y-4">
            {/* Email Header */}
            <div className="border-b pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold mb-2">{email.subject || t('inboxPage.noSubject')}</h2>
                  <div className="flex items-center space-x-2">
                    <Badge variant={email.is_important ? "destructive" : "outline"}>
                      {email.is_important ? t('detail.important') : t('detail.standard')}
                    </Badge>
                    {email.is_starred && (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        {t('detail.starred')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions (Gmail-style top action row) */}
            <div className="border-b pb-4 flex flex-wrap items-center gap-2">
              <Button onClick={handleReply} size="sm">
                <Reply className="h-4 w-4 mr-2" />
                {t('reply')}
              </Button>
              <Button onClick={handleReplyAll} size="sm" variant="outline">
                <ReplyAll className="h-4 w-4 mr-2" />
                {t('detail.replyAll')}
              </Button>
              <Button onClick={handleForward} size="sm" variant="outline">
                <Forward className="h-4 w-4 mr-2" />
                {t('forward')}
              </Button>
              {onMarkUnread && (
                <Button onClick={handleMarkUnread} size="sm" variant="outline">
                  {t('inboxPage.markUnread')}
                </Button>
              )}
              {onArchive && (
                <Button onClick={handleArchive} size="sm" variant="outline">
                  <Archive className="h-4 w-4 mr-2" />
                  {t('inboxPage.archive')}
                </Button>
              )}
              <Button
                onClick={handleDelete}
                size="sm"
                variant="destructive"
                className="ml-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('detail.delete')}
              </Button>
            </div>

            {/* Sender Info */}
            <div className="flex items-start space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>
                  {email.from_name?.charAt(0) || email.from_address.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="font-medium">{email.from_name || email.from_address}</div>
                <div className="text-sm text-gray-500">{email.from_address}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500 flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatEmailDate(email.received_date)}
                </div>
              </div>
            </div>

            {/* Recipient Info */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm space-y-1">
                <div><strong>{t('detail.toLabel')}</strong> {email.to_address}</div>
              </div>
            </div>

            {/* Email Body */}
            <div className="prose max-w-none">
              {email.body_html ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: email.body_html }} 
                  className="email-body"
                />
              ) : (
                <div className="whitespace-pre-wrap">{email.body_text}</div>
              )}
            </div>

            {/* Attachments */}
            {email.has_attachments && (
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2 flex items-center">
                  <Paperclip className="h-4 w-4 mr-2" />
                  {t('composePage.attachments')}
                </h4>
                <div className="space-y-2">
                  {/* This would show actual attachments if we had the data */}
                  <div className="p-3 bg-gray-50 rounded text-sm text-gray-600">
                    {t('detail.attachmentsPlaceholder')}
                  </div>
                </div>
              </div>
            )}

          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmailDetailModal;