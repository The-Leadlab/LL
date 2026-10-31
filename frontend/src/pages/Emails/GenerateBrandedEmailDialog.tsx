import React, { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/hooks/use-toast';
import {
  outreachAPI,
  type GenerateHtmlBrand,
  type GenerateHtmlImage,
} from '@/services/api/outreach';

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

type AttachedImage = GenerateHtmlImage & { name: string };

function readStoredBrandDefaults(): GenerateHtmlBrand {
  try {
    const raw = localStorage.getItem('platform-customization');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      ui?: { primaryColor?: string; secondaryColor?: string };
      branding?: { companyName?: string; logoUrl?: string };
    };
    return {
      company_name: parsed.branding?.companyName,
      logo_url: parsed.branding?.logoUrl,
      primary_color: parsed.ui?.primaryColor || '#2563eb',
      secondary_color: parsed.ui?.secondaryColor || '#4f46e5',
    };
  } catch {
    return { primary_color: '#2563eb', secondary_color: '#4f46e5' };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const b64 = result.includes(',') ? result.split(',', 1)[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export type GenerateBrandedEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill subject hint from current compose field */
  subjectHint?: string;
  onApply: (result: { subject: string; html: string }) => void;
};

export function GenerateBrandedEmailDialog({
  open,
  onOpenChange,
  subjectHint,
  onApply,
}: GenerateBrandedEmailDialogProps) {
  const { t } = useTranslation('emails');
  const { toast } = useToast();
  const stored = useMemo(() => readStoredBrandDefaults(), [open]);

  const [prompt, setPrompt] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [secondaryColor, setSecondaryColor] = useState('#4f46e5');
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [images, setImages] = useState<AttachedImage[]>([]);

  useEffect(() => {
    if (!open) return;
    setPrimaryColor(stored.primary_color || '#2563eb');
    setSecondaryColor(stored.secondary_color || '#4f46e5');
    setCompanyName(stored.company_name || '');
    setLogoUrl(stored.logo_url || '');
  }, [open, stored]);

  const generateMutation = useMutation({
    mutationFn: () =>
      outreachAPI.generateHtml({
        prompt: prompt.trim(),
        subject_hint: subjectHint?.trim() || undefined,
        brand: {
          company_name: companyName.trim() || undefined,
          logo_url: logoUrl.trim() || undefined,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
        },
        images: images.map(({ mime_type, data_base64 }) => ({ mime_type, data_base64 })),
      }),
    onSuccess: (data) => {
      onApply({ subject: data.subject, html: data.html });
      toast({
        title: t('generateBranded.successTitle'),
        description: t('generateBranded.successBody'),
      });
      onOpenChange(false);
      setPrompt('');
      setImages([]);
    },
    onError: (error: unknown) => {
      const detail =
        error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast({
        title: t('generateBranded.failedTitle'),
        description: typeof detail === 'string' ? detail : t('generateBranded.failedBody'),
        variant: 'destructive',
      });
    },
  });

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: AttachedImage[] = [...images];
    for (const file of Array.from(files)) {
      if (next.length >= 4) break;
      const mime = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
      if (!ALLOWED_MIME.has(mime)) {
        toast({
          title: t('generateBranded.invalidImage'),
          description: t('generateBranded.invalidImageHint'),
          variant: 'destructive',
        });
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast({
          title: t('generateBranded.imageTooLarge'),
          description: t('generateBranded.imageTooLargeHint'),
          variant: 'destructive',
        });
        continue;
      }
      try {
        const data_base64 = await fileToBase64(file);
        next.push({ name: file.name, mime_type: mime, data_base64 });
      } catch {
        toast({
          title: t('generateBranded.invalidImage'),
          variant: 'destructive',
        });
      }
    }
    setImages(next);
  };

  const canGenerate = prompt.trim().length >= 3 && !generateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-600" />
            {t('generateBranded.title')}
          </DialogTitle>
          <DialogDescription>{t('generateBranded.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="branded-prompt">{t('generateBranded.promptLabel')}</Label>
            <Textarea
              id="branded-prompt"
              className="mt-1.5 min-h-[120px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('generateBranded.promptPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="brand-primary">{t('generateBranded.primaryColor')}</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="brand-primary"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded border border-border bg-card p-1"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="brand-secondary">{t('generateBranded.secondaryColor')}</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="brand-secondary"
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded border border-border bg-card p-1"
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="brand-company">{t('generateBranded.companyName')}</Label>
            <Input
              id="brand-company"
              className="mt-1.5"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t('generateBranded.companyPlaceholder')}
            />
          </div>

          <div>
            <Label htmlFor="brand-logo">{t('generateBranded.logoUrl')}</Label>
            <Input
              id="brand-logo"
              className="mt-1.5"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div>
            <Label>{t('generateBranded.attachments')}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('generateBranded.attachmentsHint')}</p>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-muted-foreground hover:bg-muted dark:border-border dark:hover:bg-muted">
              <ImagePlus className="h-4 w-4" />
              {t('generateBranded.addImages')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  void onPickFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {images.length > 0 && (
              <ul className="mt-2 space-y-1">
                {images.map((img, idx) => (
                  <li
                    key={`${img.name}-${idx}`}
                    className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-xs dark:bg-card"
                  >
                    <span className="truncate">{img.name}</span>
                    <button
                      type="button"
                      aria-label={t('generateBranded.removeImage')}
                      className="ml-2 rounded p-1 hover:bg-muted dark:hover:bg-muted"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('generateBranded.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canGenerate}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {t('generateBranded.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
