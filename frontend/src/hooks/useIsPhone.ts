import { useEffect, useState } from 'react';

/** Matches Tailwind `md` breakpoint (768px). True when viewport is phone-sized. */
const PHONE_MQ = '(max-width: 767px)';

export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(PHONE_MQ).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isPhone;
}
