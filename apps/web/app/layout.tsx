import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'MessengerPro', description: 'Self-hosted real-time messaging' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
