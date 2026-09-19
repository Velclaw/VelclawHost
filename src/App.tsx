import React, { useState, useEffect, useRef } from 'react';
import { 
  TabType, 
  HostNode, 
  MetricSnapshot, 
  DnsRecord, 
  SslInfo, 
  SystemLog, 
  SlowQuery, 
  ApiKeyItem, 
  AlertThresholds, 
  SystemAlert,
  TwoFactorState,
  CustomDomain
} from './types';
import { 
  INITIAL_NODES, 
  INITIAL_SSL, 
  INITIAL_DNS_RECORDS, 
  INITIAL_THRESHOLDS, 
  INITIAL_ALERTS, 
  INITIAL_SLOW_QUERIES, 
  INITIAL_API_KEYS, 
  INITIAL_LOGS, 
  INITIAL_CUSTOM_DOMAINS,
  generateHistoricalMetrics 
} from './mockData';
import { generateBackupCodes, verifyTotpCode } from './utils/totp';
import { downloadMetricsCsv, downloadLogsCsv } from './utils/csvExport';

// Components
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { OverviewTab } from './components/OverviewTab';
import { DomainManagementTab } from './components/DomainManagementTab';
import { DnsSslTab } from './components/DnsSslTab';
import { ChartsTab } from './components/ChartsTab';
import { AlertsTab } from './components/AlertsTab';
import { LogsTab } from './components/LogsTab';
import { DbOptimizationTab } from './components/DbOptimizationTab';
import { SecurityTab } from './components/SecurityTab';
import { ApiIntegrationTab } from './components/ApiIntegrationTab';
import { ReportsModal } from './components/ReportsModal';
import { FcmNotificationModal } from './components/FcmNotificationModal';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';

import { 
  LayoutDashboard, 
  Globe, 
  LineChart, 
  BellRing, 
  FileText, 
  Database, 
  ShieldCheck,
  Bell,
  Mic
} from 'lucide-react';

export default function App() {
  // Theme state: dark mode default as requested for night-time eye comfort
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('velclaw_theme');
      return saved ? saved === 'dark' : true;
    }
    return true;
  });

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Nodes & Selection
  const [nodes] = useState<HostNode[]>(INITIAL_NODES);
  const [selectedNode, setSelectedNode] = useState<HostNode>(INITIAL_NODES[0]);

  // Real-time Metrics Stream
  const [metrics, setMetrics] = useState<MetricSnapshot[]>(() => generateHistoricalMetrics(25));
  const [isStreaming, setIsStreaming] = useState<boolean>(true);

  // DNS & SSL
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>(INITIAL_DNS_RECORDS);
  const [ssl, setSsl] = useState<SslInfo>(INITIAL_SSL);

  // Custom Domains
  const [customDomains, setCustomDomains] = useState<CustomDomain[]>(INITIAL_CUSTOM_DOMAINS);

  // Thresholds & Alerts
  const [thresholds, setThresholds] = useState<AlertThresholds>(INITIAL_THRESHOLDS);
  const [alerts, setAlerts] = useState<SystemAlert[]>(INITIAL_ALERTS);

  // Database Optimization
  const [slowQueries, setSlowQueries] = useState<SlowQuery[]>(INITIAL_SLOW_QUERIES);

  // Event & Audit Logs
  const [logs, setLogs] = useState<SystemLog[]>(INITIAL_LOGS);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>(INITIAL_API_KEYS);

  // 2FA / MFA Security State
  const [twoFactor, setTwoFactor] = useState<TwoFactorState>({
    enabled: true,
    verified: true,
    secret: 'VELCLAWSEC2026',
    qrCodeText: 'otpauth://totp/Velclaw:huynhthuong.xyz@gmail.com?secret=VELCLAWSEC2026&issuer=VelclawPlatform',
    backupCodes: generateBackupCodes(8),
    adminEmail: 'huynhthuong.xyz@gmail.com',
    lastVerifiedAt: new Date().toISOString(),
  });

  // Modals & Navigation
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [isFcmModalOpen, setIsFcmModalOpen] = useState(false);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<{ title: string; message: string; type: 'warn' | 'crit' | 'info' } | null>(null);

  // Audio synthesizer for alert beep
  const playAlertSound = () => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // ignore audio context restrictions
    }
  };

  // Sync theme with document class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('velclaw_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('velclaw_theme', 'light');
    }
  }, [isDarkMode]);

  // Real-time metric ticker simulation (every 2.5s)
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      setMetrics((prev) => {
        const last = prev[prev.length - 1];
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timeLabel = `${hours}:${minutes}:${seconds}`;

        // realistic minor variance
        const deltaCpu = (Math.random() - 0.48) * 3.5;
        let newCpu = parseFloat(Math.min(98, Math.max(18, last.cpuUsage + deltaCpu)).toFixed(1));

        const deltaRam = (Math.random() - 0.5) * 0.2;
        let newRamGb = parseFloat(Math.min(15.2, Math.max(7.5, last.ramUsedGb + deltaRam)).toFixed(2));
        const newRamPct = parseFloat(((newRamGb / last.ramTotalGb) * 100).toFixed(1));

        const newSnapshot: MetricSnapshot = {
          timestamp: now.toISOString(),
          timeLabel,
          cpuUsage: newCpu,
          cpuCores: [
            parseFloat((newCpu + (Math.random() * 4 - 2)).toFixed(1)),
            parseFloat((newCpu + (Math.random() * 5 - 2.5)).toFixed(1)),
            parseFloat((newCpu + (Math.random() * 4 - 2)).toFixed(1)),
            parseFloat((newCpu + (Math.random() * 6 - 3)).toFixed(1)),
          ],
          ramUsagePercent: newRamPct,
          ramUsedGb: newRamGb,
          ramTotalGb: 16.0,
          swapUsedGb: last.swapUsedGb,
          swapTotalGb: 8.0,
          diskUsagePercent: last.diskUsagePercent,
          diskUsedGb: last.diskUsedGb,
          diskTotalGb: last.diskTotalGb,
          diskIops: Math.floor(820 + Math.random() * 450),
          networkInMbps: parseFloat((145 + Math.random() * 70).toFixed(1)),
          networkOutMbps: parseFloat((215 + Math.random() * 95).toFixed(1)),
          load1m: parseFloat((1.20 + (newCpu / 100) * 0.8).toFixed(2)),
          load5m: last.load5m,
          load15m: last.load15m,
          activeConnections: Math.floor(1800 + Math.random() * 300),
          latencyMs: parseFloat((11.5 + (newCpu > 80 ? 8 : 0) + Math.random() * 3).toFixed(1)),
        };

        // Check if CPU or RAM crosses thresholds and auto-alert
        if (thresholds.autoAlertEnabled) {
          if (newCpu >= thresholds.cpuCritical) {
            triggerThresholdAlert('CPU_HIGH', 'critical', `Phụ tải CPU đạt ${newCpu}% (Ngưỡng khẩn cấp ${thresholds.cpuCritical}%)`, newCpu, thresholds.cpuCritical);
          } else if (newRamPct >= thresholds.ramCritical) {
            triggerThresholdAlert('RAM_HIGH', 'critical', `Bộ nhớ RAM chiếm dụng ${newRamPct}% (Ngưỡng khẩn cấp ${thresholds.ramCritical}%)`, newRamPct, thresholds.ramCritical);
          }
        }

        return [...prev.slice(1), newSnapshot];
      });
    }, 2500);

    return () => clearInterval(interval);
  }, [isStreaming, thresholds]);

  // Trigger automated alert
  const triggerThresholdAlert = (
    type: SystemAlert['type'],
    severity: SystemAlert['severity'],
    title: string,
    value: number,
    threshold: number
  ) => {
    // avoid duplicate rapid spam
    setAlerts((prevAlerts) => {
      const existing = prevAlerts.find(a => !a.resolved && a.type === type);
      if (existing) return prevAlerts;

      const now = new Date();
      const timeStr = `Hôm nay, ${now.toLocaleTimeString('vi-VN')}`;

      const newAlert: SystemAlert = {
        id: `alt-${Date.now()}`,
        type,
        severity,
        title,
        message: `Hệ thống tự động phát hiện node ${selectedNode.hostname} chạm ngưỡng giới hạn. Kích hoạt FCM Push Notification & ghi log bảo trì.`,
        timestamp: timeStr,
        value,
        threshold,
        resolved: false,
      };

      // Sound
      if (thresholds.soundAlert) {
        playAlertSound();
      }

      // Native browser notification if enabled
      if (thresholds.notifyFCM && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body: `Giá trị: ${value}% trên máy chủ ${selectedNode.hostname}`,
            icon: '/favicon.ico',
          });
        } catch {
          // ignore
        }
      }

      // In-app toast banner
      setToastNotification({
        title,
        message: `Tự động thông báo qua FCM và Webhook tới quản trị viên.`,
        type: severity === 'critical' ? 'crit' : 'warn',
      });
      setTimeout(() => setToastNotification(null), 5000);

      // Append log entry
      setLogs((prevLogs) => [
        {
          id: `log-${Date.now()}`,
          timestamp: now.toISOString().replace('T', ' ').slice(0, 19),
          level: 'CRITICAL',
          category: 'SYSTEM',
          message: `[AUTO-ALERT TRIGGERED] ${title} trên host ${selectedNode.hostname}.`,
          source: 'kernel-watchdog-daemon',
          ip: selectedNode.ipV4,
        },
        ...prevLogs,
      ]);

      return [newAlert, ...prevAlerts];
    });
  };

  // Simulate CPU Spike (for user testing)
  const handleSimulateCpuSpike = () => {
    setMetrics((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      const spikeCpu = 92.4;
      copy[copy.length - 1] = {
        ...last,
        cpuUsage: spikeCpu,
        cpuCores: [94.1, 91.8, 93.0, 90.7],
      };
      return copy;
    });

    triggerThresholdAlert(
      'CPU_HIGH',
      'critical',
      'Cảnh báo đột biến CPU: 92.4% chạm ngưỡng nguy hiểm!',
      92.4,
      thresholds.cpuCritical
    );
  };

  // Simulate RAM Spike (for user testing)
  const handleSimulateRamSpike = () => {
    setMetrics((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      const spikeRam = 14.8;
      const spikePct = 92.5;
      copy[copy.length - 1] = {
        ...last,
        ramUsedGb: spikeRam,
        ramUsagePercent: spikePct,
      };
      return copy;
    });

    triggerThresholdAlert(
      'RAM_HIGH',
      'critical',
      'Cảnh báo đột biến RAM: 92.5% (14.8 / 16.0 GB)!',
      92.5,
      thresholds.ramCritical
    );
  };

  // Alert resolve action
  const handleResolveAlert = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, resolved: true, resolvedAt: new Date().toLocaleTimeString('vi-VN') } : a))
    );
  };

  const handleClearResolvedAlerts = () => {
    setAlerts((prev) => prev.filter((a) => !a.resolved));
  };

  // DNS handlers
  const handleAddDnsRecord = (rec: Omit<DnsRecord, 'id' | 'status'>) => {
    const newRec: DnsRecord = {
      ...rec,
      id: `dns-${Date.now()}`,
      status: 'active',
    };
    setDnsRecords((prev) => [...prev, newRec]);
    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        level: 'INFO',
        category: 'DNS',
        message: `Đã tạo bản ghi DNS mới ${newRec.type} ${newRec.name} -> ${newRec.content} (TTL: ${newRec.ttl}s).`,
        source: 'dns-manager',
      },
      ...prev,
    ]);
  };

  const handleToggleProxy = (id: string) => {
    setDnsRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, proxied: !r.proxied } : r))
    );
  };

  const handleDeleteDnsRecord = (id: string) => {
    setDnsRecords((prev) => prev.filter((r) => r.id !== id));
  };

  // Custom Domain Handlers
  const handleAddCustomDomain = (domainData: Omit<CustomDomain, 'id' | 'createdAt'>) => {
    const newDomain: CustomDomain = {
      ...domainData,
      id: `cd-${Date.now()}`,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setCustomDomains((prev) => [newDomain, ...prev]);
    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        level: 'INFO',
        category: 'DNS',
        message: `Đã cấu hình tên miền tùy chỉnh mới ${newDomain.domain} (${newDomain.recordType} -> ${newDomain.targetValue}) với trạng thái ${newDomain.status === 'active' ? 'Đang hoạt động' : 'Chờ duyệt DNS'}.`,
        source: 'domain-manager',
      },
      ...prev,
    ]);
  };

  const handleDeleteCustomDomain = (id: string) => {
    const target = customDomains.find((d) => d.id === id);
    setCustomDomains((prev) => prev.filter((d) => d.id !== id));
    if (target) {
      setLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
          level: 'WARN',
          category: 'DNS',
          message: `Đã gỡ cấu hình tên miền tùy chỉnh ${target.domain}.`,
          source: 'domain-manager',
        },
        ...prev,
      ]);
    }
  };

  const handleVerifyCustomDomain = async (id: string): Promise<boolean> => {
    await new Promise((res) => setTimeout(res, 900));
    setCustomDomains((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              status: 'active',
              sslStatus: 'active',
              lastCheckedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
            }
          : d
      )
    );
    const domainObj = customDomains.find((d) => d.id === id);
    if (domainObj) {
      setLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
          level: 'INFO',
          category: 'SSL',
          message: `Xác thực Anycast DNS thành công cho tên miền ${domainObj.domain}. Cấp phát chứng chỉ Let's Encrypt TLS 1.3 hoàn tất.`,
          source: 'acme-certbot',
        },
        ...prev,
      ]);
    }
    return true;
  };

  // DB Query Optimization handlers
  const handleOptimizeQuery = (id: string) => {
    setSlowQueries((prev) =>
      prev.map((q) => (q.id === id ? { ...q, optimized: true } : q))
    );
    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        level: 'INFO',
        category: 'DATABASE',
        message: `Chỉ mục cơ sở dữ liệu đã được khởi tạo thành công cho truy vấn ${id}. Thời gian phản hồi giảm còn ~9ms.`,
        source: 'db-index-advisor',
      },
      ...prev,
    ]);
  };

  const handleOptimizeAllQueries = () => {
    setSlowQueries((prev) => prev.map((q) => ({ ...q, optimized: true })));
    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        level: 'INFO',
        category: 'DATABASE',
        message: 'Hoàn tất tối ưu hóa toàn diện: Đã tạo Covering Indexes và cập nhật shared_buffers plan.',
        source: 'db-optimizer-core',
      },
      ...prev,
    ]);
  };

  // 2FA Verification
  const handleVerifyTwoFactor = (code: string): boolean => {
    const isValid = verifyTotpCode(code, twoFactor.secret);
    if (isValid) {
      setTwoFactor((prev) => ({
        ...prev,
        enabled: true,
        verified: true,
        lastVerifiedAt: new Date().toISOString(),
      }));
      setLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
          level: 'INFO',
          category: '2FA',
          message: `Xác thực 2FA TOTP thành công cho quản trị viên ${twoFactor.adminEmail}.`,
          source: 'mfa-guardian',
          ip: '113.185.42.19',
        },
        ...prev,
      ]);
      return true;
    }
    return false;
  };

  const handleRegenerateBackupCodes = () => {
    const newCodes = generateBackupCodes(8);
    setTwoFactor((prev) => ({ ...prev, backupCodes: newCodes }));
  };

  // API Key handlers
  const handleAddApiKey = (name: string, permissions: ApiKeyItem['permissions']) => {
    const randPart = Math.random().toString(36).substring(2, 10);
    const fullKey = `velclaw_live_${permissions.slice(0, 2)}_${randPart}8e93012bb81c9443f21`;
    const newKey: ApiKeyItem = {
      id: `key-${Date.now()}`,
      name,
      keyMasked: `velclaw_live_${randPart}••••••••••••••••`,
      fullKey,
      createdDate: new Date().toISOString().slice(0, 10),
      lastUsed: 'Vừa tạo',
      permissions,
      status: 'active',
    };
    setApiKeys((prev) => [newKey, ...prev]);
  };

  const handleRevokeApiKey = (id: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  };

  // Trigger test FCM Push
  const handleTriggerTestPush = (title: string, message: string) => {
    triggerThresholdAlert('CPU_HIGH', 'warning', title, 87.2, thresholds.cpuWarning);
  };

  const currentMetric = metrics[metrics.length - 1] || metrics[0];
  const unreadAlertsCount = alerts.filter((a) => !a.resolved).length;

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      {/* Toast Notification Banner (Floating) */}
      {toastNotification && (
        <div className="fixed top-20 right-4 z-50 max-w-md p-4 rounded-2xl bg-slate-900/95 border border-rose-500/50 shadow-2xl text-white flex items-start gap-3 animate-fade-in backdrop-blur-md">
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 flex-shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 flex-1">
            <div className="text-xs font-bold text-white flex items-center justify-between">
              <span>{toastNotification.title}</span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">FCM PUSH</span>
            </div>
            <p className="text-xs text-slate-300">{toastNotification.message}</p>
          </div>
          <button 
            onClick={() => setToastNotification(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Top Navigation */}
      <Navbar
        nodes={nodes}
        selectedNode={selectedNode}
        onSelectNode={setSelectedNode}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        isTwoFactorActive={twoFactor.enabled && twoFactor.verified}
        onOpenSecurityModal={() => setActiveTab('security-2fa')}
        onOpenFcmModal={() => setIsFcmModalOpen(true)}
        onOpenVoiceAssistant={() => setIsVoiceAssistantOpen(true)}
        alerts={alerts}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* Application Body */}
      <div className="flex">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isMobileMenuOpen={isMobileMenuOpen}
          onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
          unreadAlertCount={unreadAlertsCount}
          onOpenVoiceAssistant={() => setIsVoiceAssistantOpen(true)}
        />

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-12">
          {activeTab === 'overview' && (
            <OverviewTab
              node={selectedNode}
              metric={currentMetric}
              metrics={metrics}
              ssl={ssl}
              thresholds={thresholds}
              alerts={alerts}
              onSimulateSpike={handleSimulateCpuSpike}
              onOpenReports={() => setIsReportsModalOpen(true)}
              onOpenSecurity={() => setActiveTab('security-2fa')}
              onNavigateToCharts={() => setActiveTab('metrics-charts')}
              isTwoFactorActive={twoFactor.enabled && twoFactor.verified}
            />
          )}

          {activeTab === 'domains' && (
            <DomainManagementTab
              customDomains={customDomains}
              currentNodes={nodes}
              onAddDomain={handleAddCustomDomain}
              onDeleteDomain={handleDeleteCustomDomain}
              onVerifyDomain={handleVerifyCustomDomain}
            />
          )}

          {activeTab === 'dns-ssl' && (
            <DnsSslTab
              dnsRecords={dnsRecords}
              ssl={ssl}
              node={selectedNode}
              onUpdateSsl={(updated) => setSsl((prev) => ({ ...prev, ...updated }))}
              onAddDnsRecord={handleAddDnsRecord}
              onToggleProxy={handleToggleProxy}
              onDeleteDnsRecord={handleDeleteDnsRecord}
            />
          )}

          {activeTab === 'metrics-charts' && (
            <ChartsTab
              metrics={metrics}
              thresholds={thresholds}
              isStreaming={isStreaming}
              onToggleStreaming={() => setIsStreaming(!isStreaming)}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsTab
              thresholds={thresholds}
              alerts={alerts}
              currentMetric={currentMetric}
              onUpdateThresholds={(up) => setThresholds((prev) => ({ ...prev, ...up }))}
              onSimulateCpuSpike={handleSimulateCpuSpike}
              onSimulateRamSpike={handleSimulateRamSpike}
              onResolveAlert={handleResolveAlert}
              onClearResolvedAlerts={handleClearResolvedAlerts}
            />
          )}

          {activeTab === 'logs' && (
            <LogsTab
              logs={logs}
              alerts={alerts}
              onAddLog={(log) =>
                setLogs((prev) => [
                  {
                    ...log,
                    id: `log-${Date.now()}`,
                    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
                  },
                  ...prev,
                ])
              }
              onExportCsv={() => downloadLogsCsv(logs, alerts)}
            />
          )}

          {activeTab === 'db-optimizer' && (
            <DbOptimizationTab
              queries={slowQueries}
              onOptimizeQuery={handleOptimizeQuery}
              onOptimizeAll={handleOptimizeAllQueries}
            />
          )}

          {activeTab === 'security-2fa' && (
            <SecurityTab
              twoFactor={twoFactor}
              onToggleTwoFactor={(en) => setTwoFactor((prev) => ({ ...prev, enabled: en }))}
              onVerifyTwoFactor={handleVerifyTwoFactor}
              onRegenerateBackupCodes={handleRegenerateBackupCodes}
            />
          )}

          {activeTab === 'api-integration' && (
            <ApiIntegrationTab
              apiKeys={apiKeys}
              currentMetric={currentMetric}
              onAddApiKey={handleAddApiKey}
              onRevokeApiKey={handleRevokeApiKey}
            />
          )}

          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white font-mono">Báo Cáo &amp; Xuất Dữ Liệu</h2>
                  <p className="text-xs text-slate-400 mt-1">Xuất báo cáo PDF, CSV và lập lịch định kỳ</p>
                </div>
                <button
                  onClick={() => setIsReportsModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                >
                  Mở Trình Xuất Báo Cáo
                </button>
              </div>

              {/* Directly embedded modal view */}
              <ReportsModal
                isOpen={true}
                onClose={() => setActiveTab('overview')}
                node={selectedNode}
                metrics={metrics}
                ssl={ssl}
                thresholds={thresholds}
                alerts={alerts}
                logs={logs}
                isTwoFactorActive={twoFactor.enabled && twoFactor.verified}
              />
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Quick Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-800 bg-slate-950/95 backdrop-blur-md px-2 flex items-center justify-around">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex flex-col items-center gap-1 text-[10px] ${activeTab === 'overview' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Tổng Quan</span>
        </button>

        <button
          onClick={() => setActiveTab('dns-ssl')}
          className={`flex flex-col items-center gap-1 text-[10px] ${activeTab === 'dns-ssl' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <Globe className="w-5 h-5" />
          <span>DNS/SSL</span>
        </button>

        <button
          onClick={() => setActiveTab('metrics-charts')}
          className={`flex flex-col items-center gap-1 text-[10px] ${activeTab === 'metrics-charts' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <LineChart className="w-5 h-5" />
          <span>Biểu Đồ</span>
        </button>

        <button
          onClick={() => setActiveTab('alerts')}
          className={`relative flex flex-col items-center gap-1 text-[10px] ${activeTab === 'alerts' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <BellRing className="w-5 h-5" />
          <span>Cảnh Báo</span>
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 right-2 w-3.5 h-3.5 bg-rose-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('security-2fa')}
          className={`flex flex-col items-center gap-1 text-[10px] ${activeTab === 'security-2fa' ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
        >
          <ShieldCheck className="w-5 h-5" />
          <span>2FA MFA</span>
        </button>
      </nav>

      {/* Floating Action Button for Voice Assistant */}
      <button
        id="floating-voice-assistant-fab"
        onClick={() => setIsVoiceAssistantOpen(true)}
        className="fixed bottom-18 sm:bottom-6 right-4 sm:right-6 z-40 p-3 sm:p-3.5 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 text-white shadow-xl shadow-cyan-600/30 hover:scale-105 active:scale-95 transition-all border border-cyan-400/40 flex items-center gap-2 group"
        title="Trợ lý Giọng nói AI (Gemini Live)"
      >
        <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
        <span className="hidden md:inline text-xs font-bold font-mono tracking-wide">
          DevOps Voice AI
        </span>
      </button>

      {/* Floating Modals */}
      {isReportsModalOpen && activeTab !== 'reports' && (
        <ReportsModal
          isOpen={isReportsModalOpen}
          onClose={() => setIsReportsModalOpen(false)}
          node={selectedNode}
          metrics={metrics}
          ssl={ssl}
          thresholds={thresholds}
          alerts={alerts}
          logs={logs}
          isTwoFactorActive={twoFactor.enabled && twoFactor.verified}
        />
      )}

      {isFcmModalOpen && (
        <FcmNotificationModal
          isOpen={isFcmModalOpen}
          onClose={() => setIsFcmModalOpen(false)}
          alerts={alerts}
          onTriggerTestPush={handleTriggerTestPush}
        />
      )}

      {isVoiceAssistantOpen && (
        <VoiceAssistantModal
          isOpen={isVoiceAssistantOpen}
          onClose={() => setIsVoiceAssistantOpen(false)}
          selectedNode={selectedNode}
          currentMetric={currentMetric}
          alerts={alerts}
          isTwoFactorActive={twoFactor.enabled && twoFactor.verified}
          onNavigateTab={(tab) => setActiveTab(tab)}
          onSimulateCpuSpike={handleSimulateCpuSpike}
          onOpenReports={() => setIsReportsModalOpen(true)}
        />
      )}
    </div>
  );
}
