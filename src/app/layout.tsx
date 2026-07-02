import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-word",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-meaning",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "TypeSee",
  description: "타이핑하며 영단어를 눈에 새기는 학습 앱",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistMono.variable} ${notoSansKr.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
