import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Rocket',
  description: 'The block, the week, and what actually got run.',
  applicationName: 'Rocket',
  appleWebApp: {
    capable: true,
    title: 'Rocket',
    // 'default', not 'black-translucent'. The translucent bar draws the page
    // under the clock and notch, which then obliges env(safe-area-inset-*)
    // plumbing on every fixed element for no visual gain here.
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
