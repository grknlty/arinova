import type { Metadata, Viewport } from 'next';
import { Exo_2, Nunito_Sans } from 'next/font/google';
import './globals.css';

// Self-hosted at build time; latin-ext covers Turkish letters such as ş, ğ, ı.
const body = Nunito_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-body',
  display: 'swap',
});
// Sleek sci-fi headings, closer to anime title cards than rounded kids' type.
const heading = Exo_2({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nova · Kleine stappen, grote ontdekkingen',
  description:
    'Een fijne plek om te leren, oefenen en groeien. Nederlands, Türkçe, English.',
};
export const viewport: Viewport = {
  themeColor: '#1a1240',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${body.variable} ${heading.variable}`}>
      <body>{children}</body>
    </html>
  );
}
