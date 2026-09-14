'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The way around the app, on every page.
 *
 * Rocket installs as a standalone app (`manifest.ts` `display: 'standalone'`), so
 * there is no browser chrome and no back button. Before this, each page linked to
 * the others only at the very bottom of a long scroll, the check-in page linked
 * nowhere at all, and the Runs page's back link read "Block" while going to
 * Today.
 */
const TABS = [
  { href: '/', label: 'Today', match: (p: string) => p === '/' },
  {
    href: '/checkin',
    label: 'Check in',
    match: (p: string) => p.startsWith('/checkin'),
  },
  {
    href: '/block',
    label: 'Block',
    match: (p: string) => p.startsWith('/block'),
  },
  {
    href: '/activities',
    label: 'Runs',
    match: (p: string) => p.startsWith('/activities'),
  },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex h-14 items-center justify-center text-sm',
                  active
                    ? 'font-medium text-sky-300'
                    : 'text-zinc-400 active:text-zinc-200',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
