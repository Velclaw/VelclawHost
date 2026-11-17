import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthSessionProvider } from "./session-provider";
import "../src/index.css";

const siteUrl = "https://velclawhost.velclaw.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "VelClaw — Developer Control Center",
    template: "%s | VelClaw",
  },
  description:
    "VelClaw — bảng điều khiển hạ tầng hosting: quản lý domain, DNS/TLS, triển khai ứng dụng, giám sát và bảo mật.",
  applicationName: "VelClaw",
  alternates: { canonical: "/" },
  openGraph: {
    title: "VelClaw — Cloud Infrastructure",
    description:
      "Một workspace để quản lý hosting, domain, DNS/TLS, deployments và tình trạng hạ tầng.",
    siteName: "VelClaw",
    url: siteUrl,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VelClaw",
    description: "Cloud infrastructure control plane.",
  },
  icons: { icon: "/assets/velclaw-mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="bg-black text-white antialiased">
        <AuthSessionProvider><div id="root">{children}</div></AuthSessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
