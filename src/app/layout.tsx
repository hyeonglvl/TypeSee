import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import "@/styles/global.css";

// 'TypeSee' 워드마크(Home.tsx) 전용 — 앱 전체 폰트를 RIDIBatang으로 바꾼 뒤에도
// 이 폰트만 유지된다.
const displayFont = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["500", "600", "700"],
  variable: "--next-font-display",
});
const bodyFont = localFont({
  src: "../styles/RIDIBatang.otf",
  variable: "--next-font-ridibatang",
  display: "swap",
});

const SITE_URL = "https://type-see.vercel.app";
const DESCRIPTION = "타이핑하며 눈에 새기는 영단어";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "TypeSee",
  description: DESCRIPTION,
  openGraph: {
    title: "TypeSee",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "TypeSee",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TypeSee",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f0e4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // 크롬 원격 데스크톱 등 확장이 React 로드 전에 <html>에 속성을 주입해
    // 하이드레이션 경고를 낸다 — 이 요소의 속성 미스매치만 무시한다.
    <html
      lang="ko"
      className={`${displayFont.variable} ${bodyFont.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
