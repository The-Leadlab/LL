import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, Paperclip, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { extractEmailErrorMessage } from '@/lib/emailError';
import emailAPI from '../../services/emailAPI';

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  onEmailSent?: () => void;
  replyTo?: {
    to: string;
    subject: string;
    messageId: string;
  };
  forward?: {
    from: string;
    subject: string;
    body: string;
  };
}

export default function EmailComposeModal({
  isOpen,
  onClose,
  accountId,
  onEmailSent,
  replyTo,
  forward,
}: EmailComposeModalProps) {
  const [to, setTo] = useState(replyTo?.to || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` : forward ? `Fwd: ${forward.subject}` : ''
  );
  const [body, setBody] = useState(
    forward ? `\n\n---------- Forwarded message ----------\nFrom: ${forward.from}\nSubject: ${forward.subject}\n\n${forward.body}` : ''
  );
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation('emails');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!isOpen) return;
    setTo(replyTo?.to || '');
    setCc('');
    setBcc('');
    setShowCc(false);
    setShowBcc(false);
    setSubject(replyTo ? `Re: ${replyTo.subject}` : forward ? `Fwd: ${forward.subject}` : '');
    setBody(
      forward
        ? `\n\n---------- Forwarded message ----------\nFrom: ${forward.from}\nSubject: ${forward.subject}\n\n${forward.body}`
        : ''
    );
    setAttachments([]);
  }, [isOpen, replyTo, forward]);

  const sendEmailMutation = useMutation({
    mutationFn: emailAPI.sendEmail,
    onSuccess: (result) => {
      const wasPersisted = result?.persisted !== false;
      toast({
        title: wasPersisted ? t('composePage.sentSuccess') : t('composePage.sentWarning'),
        description: wasPersisted
          ? t('composePage.sentSuccessBody')
          : (result?.warning || t('composePage.sentWarningBody')),
        variant: wasPersisted ? 'default' : 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      void emailAPI.syncAccount(parseInt(accountId, 10)).catch(() => {
        // Best-effort provider sync after sending.
      });
      onEmailSent?.();
      handleClose();
    },
    onError: (error) => {
      const errorMessage = extractEmailErrorMessage(error);
      toast({
        title: errorMessage.title,
        description: errorMessage.description,
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setTo('');
    setCc('');
    setBcc('');
    setSubject('');
    setBody('');
    setAttachments([]);
    onClose();
  };

  const handleSend = () => {
    if (!to.trim()) {
      toast({
        title: t('composePage.validationError'),
        description: t('composePage.recipientRequired'),
        variant: 'destructive',
      });
      return;
    }

    if (!subject.trim()) {
      toast({
        title: t('composePage.validationError'),
        description: t('composePage.subjectRequired'),
        variant: 'destructive',
      });
      return;
    }

    const emailData = {
      to,
      cc,
      bcc,
      subject,
      body,
      account_id: parseInt(accountId),
      attachments: attachments.length > 0 ? attachments : undefined
    };

    sendEmailMutation.mutate(emailData);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setAttachments([...attachments, ...Array.from(files)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle>{t('composePage.title')}</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="to">{t('to')}</Label>
                <Input
                  id="to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com"
                />
              </div>

              <div className="flex gap-2">
                {!showCc && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setShowCc(true)}
                  >
                    {t('composePage.cc')}
                  </Button>
                )}
                {!showBcc && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setShowBcc(true)}
                  >
                    {t('composePage.bcc')}
                  </Button>
                )}
              </div>

              {showCc && (
                <div className="space-y-2">
                  <Label htmlFor="cc">{t('composePage.cc')}</Label>
                  <Input
                    id="cc"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@example.com"
                  />
                </div>
              )}

              {showBcc && (
                <div className="space-y-2">
                  <Label htmlFor="bcc">{t('composePage.bcc')}</Label>
                  <Input
                    id="bcc"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="bcc@example.com"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="subject">{t('subject')}</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('composePage.subjectPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">{t('composePage.message')}</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('composePage.messagePlaceholder')}
                  className="min-h-[200px]"
                />
              </div>

              {attachments.length > 0 && (
                <div className="space-y-2">
                  <Label>{t('composePage.attachments')}</Label>
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <span className="text-sm text-gray-600">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="flex items-center justify-between p-4 border-t">
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 mr-2" />
              {t('composePage.attach')}
            </Button>
            <div className="mt-2 space-y-1">
              {attachments.length > 0 && (
                <p className="text-xs text-gray-600">
                  {t('composePage.filesSelected', { count: attachments.length })}{' '}
                  {attachments.slice(0, 2).map((file) => file.name).join(', ')}
                  {attachments.length > 2 ? ` ${t('composePage.moreFiles', { count: attachments.length - 2 })}` : ''}
                </p>
              )}
              <p className="text-xs text-amber-700">
                {t('composePage.attachmentsNotSent')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              {t('composePage.cancel')}
            </Button>
            <Button
              onClick={handleSend}
              disabled={sendEmailMutation.isPending}
            >
              {sendEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('composePage.sending')}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {t('send')}
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}