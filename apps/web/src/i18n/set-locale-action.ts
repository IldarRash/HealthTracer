'use server';

import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from './config';

export async function setLocaleCookie(next: string): Promise<void> {
  if (!isLocale(next)) {
    return;
  }
  const store = await cookies();
  store.set(LOCALE_COOKIE, next, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
