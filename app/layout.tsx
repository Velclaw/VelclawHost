import type { Metadata, Viewport } from "next";
import "../src/index.css";

export const metadata: Metadata = {
  title: "VelclawHost — Cloud Infrastructure",
  description:
    "VelclawHost — bảng điều khiển hạ tầng hosting: quản lý hostname và domain, DNS/TLS, triển khai ứng dụng, giám sát CPU/RAM, cảnh báo, nhật ký và báo cáo.",
  applicationName: "VelclawHost",
  openGraph: {
    title: "VelclawHost — Cloud Infrastructure",
    description:
      "Một workspace để quản lý hosting, domain, DNS/TLS, deployments và tình trạng hạ tầng.",
    siteName: "VelclawHost",
    type: "website",
  },
  twitter: { card: "summary" },
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
      </body>
    </html>
  );
}
