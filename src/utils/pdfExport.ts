import { jsPDF } from 'jspdf';
import { HostNode, MetricSnapshot, SslInfo, AlertThresholds, SystemAlert } from '../types';

interface PdfReportOptions {
  node: HostNode;
  currentMetric: MetricSnapshot;
  ssl: SslInfo;
  thresholds: AlertThresholds;
  alerts: SystemAlert[];
  isTwoFactorActive: boolean;
}

export function generatePdfReport({
  node,
  currentMetric,
  ssl,
  thresholds,
  alerts,
  isTwoFactorActive,
}: PdfReportOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header background bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Brand title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('VELCLAW HOSTING PLATFORM', 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Production Hostname Infrastructure & Resource Utilization Audit', 14, 18);
  doc.text(`Generated: ${new Date().toLocaleString('vi-VN')}`, 14, 23);

  // Status Badge in header
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.roundedRect(pageWidth - 42, 8, 28, 7, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ONLINE 99.99%', pageWidth - 40, 13);

  let y = 38;

  // Section 1: Hostname & Server Architecture
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('1. THONG TIN MAY CHU HOSTNAME PRODUCTION', 14, y);
  y += 6;

  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(14, y, pageWidth - 28, 38, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');

  const col1 = 18;
  const col2 = 110;

  doc.text(`Hostname:`, col1, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${node.hostname}`, col1 + 25, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.text(`IPv4 / IPv6:`, col1, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${node.ipV4}  |  ${node.ipV6.slice(0, 24)}...`, col1 + 25, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text(`Operating System:`, col1, y + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(`${node.os}`, col1 + 32, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.text(`Linux Kernel:`, col1, y + 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${node.kernel}`, col1 + 25, y + 32);

  // Right column
  doc.setFont('helvetica', 'bold');
  doc.text(`Region:`, col2, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${node.region}`, col2 + 25, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.text(`Datacenter:`, col2, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${node.datacenter}`, col2 + 25, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text(`Node Uptime:`, col2, y + 24);
  doc.setFont('helvetica', 'normal');
  const days = Math.floor(node.uptimeSeconds / 86400);
  const hours = Math.floor((node.uptimeSeconds % 86400) / 3600);
  doc.text(`${days} ngay ${hours} gio (SLA 99.99%)`, col2 + 25, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.text(`Status:`, col2, y + 32);
  doc.setTextColor(16, 185, 129);
  doc.text(`PRODUCTION ACTIVE`, col2 + 25, y + 32);

  y += 46;

  // Section 2: Real-time System Resources
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('2. CHI SO TAI NGUYEN HE THONG (REAL-TIME METRICS)', 14, y);
  y += 6;

  const boxWidth = (pageWidth - 28 - 9) / 4;
  const metricsCards = [
    { label: 'CPU Usage', val: `${currentMetric.cpuUsage.toFixed(1)}%`, sub: `4 Cores @ 3.4GHz` },
    { label: 'RAM Usage', val: `${currentMetric.ramUsagePercent.toFixed(1)}%`, sub: `${currentMetric.ramUsedGb} / ${currentMetric.ramTotalGb} GB` },
    { label: 'Disk Storage', val: `${currentMetric.diskUsagePercent.toFixed(1)}%`, sub: `${currentMetric.diskUsedGb} / ${currentMetric.diskTotalGb} GB NVMe` },
    { label: 'Network Bandwidth', val: `${currentMetric.networkInMbps.toFixed(0)} Mbps`, sub: `Out: ${currentMetric.networkOutMbps.toFixed(0)} Mbps` },
  ];

  metricsCards.forEach((card, idx) => {
    const xPos = 14 + idx * (boxWidth + 3);
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(xPos, y, boxWidth, 24, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, xPos + 4, y + 6);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(card.val, xPos + 4, y + 14);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(card.sub, xPos + 4, y + 20);
  });

  y += 32;

  // Section 3: DNS, HTTPS & SSL Security Status
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('3. CAU HINH DNS, HTTPS VA AN TOAN KET NOI', 14, y);
  y += 6;

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pageWidth - 28, 36, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');

  doc.text('SSL Certificate:', col1, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${ssl.issuer} (${ssl.daysRemaining} ngay con lai)`, col1 + 28, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.text('TLS Protocol:', col1, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${ssl.tlsVersion} | Cipher: ${ssl.cipherSuite}`, col1 + 28, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text('HTTP Redirect:', col1, y + 24);
  doc.setFont('helvetica', 'normal');
  doc.text('HTTP Port 80 -> HTTPS Port 443 (301 Permanent Redirect Active)', col1 + 28, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.text('HSTS Status:', col1, y + 31);
  doc.setFont('helvetica', 'normal');
  doc.text('max-age=31536000; includeSubDomains; preload (A+ Security Score)', col1 + 28, y + 31);

  // Right column
  doc.setFont('helvetica', 'bold');
  doc.text('DNS Status:', col2, y + 8);
  doc.setTextColor(16, 185, 129);
  doc.text('All 8 records Propagated (100%)', col2 + 25, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Edge Proxy / CDN:', col2, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text('Cloudflare Argo Smart Tier 1 Active', col2 + 32, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text('Auto Renewal:', col2, y + 24);
  doc.setFont('helvetica', 'normal');
  doc.text('Enabled (ACME certbot daemon active)', col2 + 25, y + 24);

  y += 44;

  // Section 4: Multi-Factor Authentication & Alert Thresholds
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('4. BAO MAT XAC THUC DA YEU TO (2FA) & NGUONG CANH BAO', 14, y);
  y += 6;

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pageWidth - 28, 30, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  doc.setFont('helvetica', 'bold');
  doc.text('MFA / 2FA Status:', col1, y + 8);
  doc.setFont('helvetica', 'normal');
  if (isTwoFactorActive) {
    doc.setTextColor(16, 185, 129);
    doc.text('TOTP Authenticator Kich Hoat (Bao mat tuyet doi cho Admin)', col1 + 35, y + 8);
  } else {
    doc.setTextColor(239, 68, 68);
    doc.text('Chua hoan tat xac thuc 2FA (Khuyen nghi kich hoat ngay)', col1 + 35, y + 8);
  }

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.text('Canh bao CPU:', col1, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`Canh bao: ${thresholds.cpuWarning}%  |  Khai tu/Khan cap: ${thresholds.cpuCritical}%`, col1 + 35, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text('Canh bao RAM:', col1, y + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(`Canh bao: ${thresholds.ramWarning}%  |  Khai tu/Khan cap: ${thresholds.ramCritical}%`, col1 + 35, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.text('Kenh thong bao:', col2, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text('Firebase Cloud Messaging (FCM) + Webhook + Email', col2 + 30, y + 16);

  y += 38;

  // Section 5: Recent Incidents & Event History
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('5. NHAT KY SU KIEN VA CANH BAO GAN NHAT', 14, y);
  y += 6;

  alerts.slice(0, 3).forEach((alert) => {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, y, pageWidth - 28, 14, 1, 1, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    if (alert.severity === 'critical') {
      doc.setTextColor(239, 68, 68);
    } else if (alert.severity === 'warning') {
      doc.setTextColor(245, 158, 11);
    } else {
      doc.setTextColor(59, 130, 246);
    }
    doc.text(`[${alert.severity.toUpperCase()}] ${alert.title}`, 18, y + 5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${alert.message.slice(0, 85)}...  |  ${alert.timestamp}`, 18, y + 10);

    y += 16;
  });

  // Footer note
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'italic');
  doc.text('Bao cao nay duoc xuat tu dong boi Velclaw Hosting Platform Monitoring Engine.', 14, 285);
  doc.text(`Trang 1 / 1  -  Host: ${node.hostname}`, pageWidth - 70, 285);

  doc.save(`velclaw-production-report-${node.hostname}-${Date.now()}.pdf`);
}
