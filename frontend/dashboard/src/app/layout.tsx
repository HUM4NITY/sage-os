import type { Metadata } from 'next';
import Script from 'next/script';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Header } from '@/components/Header';
import { LeftRail } from '@/components/LeftRail';
import { getOverview } from '@/lib/api';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sage - The Caregiving OS',
  description: 'Cognitive-signal summaries for caregivers, in plain English.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const overview = await getOverview();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="sage-dashboard-theme" strategy="beforeInteractive">
          {`try {
            const value = localStorage.getItem('sage-theme-preference');
            if (value === 'dark' || value === 'light') {
              document.documentElement.setAttribute('data-theme', value);
            } else {
              document.documentElement.removeAttribute('data-theme');
            }
          } catch (error) {}`}
        </Script>
        <AutoRefresh />
        <Header patient={overview.patient} severity={overview.latest_session.severity} />
        <div className="flex">
          <LeftRail since={overview.patient.active_since} />
          <main className="min-h-[calc(100vh-4rem)] flex-1 px-10 py-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
