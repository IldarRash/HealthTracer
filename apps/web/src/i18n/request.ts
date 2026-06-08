import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from './config';

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieValue = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;

  const messages = (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>;

  return {
    locale,
    messages,
    timeZone: 'UTC',
    getMessageFallback({ namespace, key }: { namespace?: string; key: string }) {
      // Fall back to the message key so partial ru.json never throws.
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
