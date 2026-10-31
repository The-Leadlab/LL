import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Users } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  buildMainNavigation,
  bottomNavigation,
  flattenNavForMore,
  type NavItem,
} from '@/config/navigation';
import { useAuthStore } from '@/store/auth';

type MobileMoreSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SheetLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const { t } = useTranslation('nav');
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className="flex min-h-[48px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}

export function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const { t } = useTranslation('nav');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const adminOnlyNavKeys = new Set(['company']);
  const base = buildMainNavigation();
  const filtered = user?.is_admin
    ? base
    : base.filter((item) => !adminOnlyNavKeys.has(item.labelKey));
  const withAdmin: NavItem[] = user?.is_admin
    ? [...filtered, { labelKey: 'admin', icon: Users, path: '/admin' }]
    : filtered;

  const moreItems = [...flattenNavForMore(withAdmin), ...bottomNavigation];
  const close = () => onOpenChange(false);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        <DrawerHeader>
          <DrawerTitle className="font-sans text-foreground">More</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-3 pb-6">
          <div className="space-y-0.5">
            {moreItems.map((item) => (
              <SheetLink
                key={`${item.labelKey}-${item.path}`}
                item={item}
                onNavigate={close}
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-4 flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={async () => {
              close();
              await logout();
              window.location.assign('/signin');
            }}
          >
            <LogOut className="h-5 w-5" />
            {t('signOut')}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
