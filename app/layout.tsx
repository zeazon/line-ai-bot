import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'LINE AI Bot — แอดมิน', description: 'ตั้งค่าบอท LINE ที่ตอบด้วย AI' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
