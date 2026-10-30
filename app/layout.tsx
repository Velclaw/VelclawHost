import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "../src/index.css";

const siteUrl = "https://velclawhost.velclaw.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "VelClawHost — Cloud Infrastructure",
    template: "%s | VelClawHost",
  },
  description:
    "VelClawHost — bảng điều khiển hạ tầng hosting: quản lý domain, DNS/TLS, triển khai ứng dụng, giám sát và bảo mật.",
  applicationName: "VelClawHost",
  alternates: { canonical: "/" },
  openGraph: {
    title: "VelClawHost — Cloud Infrastructure",
    description:
      "Một workspace để quản lý hosting, domain, DNS/TLS, deployments và tình trạng hạ tầng.",
    siteName: "VelClawHost",
    url: siteUrl,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "VelClawHost",
    description: "Cloud infrastructure control plane.",
  },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#030304",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-violet-500/30 selection:text-violet-200">
        <div id="root">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
