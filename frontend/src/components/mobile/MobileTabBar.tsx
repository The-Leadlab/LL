import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import { phonePrimaryTabs, isPhoneTabActive } from '@/config/navigation';
import { cn } from '@/lib/utils';

type MobileTabBarProps = {
  onMore: () => void;
  moreOpen?: boolean;
};

export function MobileTabBar({ onMore, moreOpen }: MobileTabBarProps) {
  const { t } = useTranslation('nav');
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={t('dashboard')}
    >
      <ul className="mx-auto flex h-14 max-w-lg items-stretch justify-around px-1">
        {phonePrimaryTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isPhoneTabActive(location.pathname, tab.path);
          return (
            <li key={tab.path} className="flex-1">
              <Link
                to={tab.path}
                className={cn(
                  'flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium',
                  active
                    ? 'text-primary-600 dark:text-primary-300'
                    : 'text-neutral-500 dark:text-neutral-400'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="truncate">{t(tab.labelKey)}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onMore}
            className={cn(
              'flex h-full min-h-[44px] w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium',
              moreOpen
                ? 'text-primary-600 dark:text-primary-300'
                : 'text-neutral-500 dark:text-neutral-400'
            )}
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
