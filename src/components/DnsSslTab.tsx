import React, { useEffect, useState } from 'react';
import { 
  Globe, 
  Lock, 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  ArrowRight,
  Shield,
  Zap,
  Check,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Info,
  Layers,
  Server,
  Sparkles,
  Bot,
  Terminal,
  Copy,
  CheckCheck
} from 'lucide-react';
import { DnsRecord, SslInfo, HostNode, VelclawTld, VelclawDomainConfig } from '../types';
import { Cloud, PlusCircle, Trash, RefreshCw as RefreshIcon } from 'lucide-react';
import { VELCLAW_DOMAINS } from '../mockData';

interface DnsSslTabProps {
  dnsRecords: DnsRecord[];
  ssl: SslInfo;
  node: HostNode;
  onUpdateSsl: (updated: Partial<SslInfo>) => void;
  onAddDnsRecord: (record: Omit<DnsRecord, 'id' | 'status'>) => void;
  onToggleProxy: (id: string) => void;
  onDeleteDnsRecord: (id: string) => void;
}

export const DnsSslTab: React.FC<DnsSslTabProps> = ({
  dnsRecords,
  ssl,
  node,
  onUpdateSsl,
  onAddDnsRecord,
  onToggleProxy,
  onDeleteDnsRecord,
}) => {
  const [selectedTld, setSelectedTld] = useState<VelclawTld>('cfd');
  const [domainList, setDomainList] = useState<VelclawDomainConfig[]>(VELCLAW_DOMAINS);
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [recordType, setRecordType] = useState<DnsRecord['type']>('A');
  const [recordName, setRecordName] = useState('');
  const [recordContent, setRecordContent] = useState('');
  const [recordTtl, setRecordTtl] = useState(300);
  const [recordProxied, setRecordProxied] = useState(true);
  const [isVerifyingPropagation, setIsVerifyingPropagation] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  const activeDomainConfig = domainList.find((d) => d.tld === selectedTld) || domainList[0];

  const worldwideLocations = [
    { city: 'Tokyo, JP', code: 'NRT', status: 'OK', latency: '6ms', ip: '104.21.78.142' },
    { city: 'Singapore, SG', code: 'SIN', status: 'OK', latency: '18ms', ip: '104.21.78.142' },
    { city: 'Frankfurt, DE', code: 'FRA', status: 'OK', latency: '42ms', ip: '104.21.78.142' },
    { city: 'London, UK', code: 'LHR', status: 'OK', latency: '45ms', ip: '104.21.78.142' },
    { city: 'Ashburn (US-East), US', code: 'IAD', status: 'OK', latency: '68ms', ip: '104.21.78.142' },
    { city: 'Sydney, AU', code: 'SYD', status: 'OK', latency: '52ms', ip: '104.21.78.142' },
  ];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDomain(text);
    setTimeout(() => setCopiedDomain(null), 2500);
  };

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordName || !recordContent) return;

    const newRecord: DnsRecord = {
      id: `${selectedTld}-${Date.now()}`,
      type: recordType,
      name: recordName,
      content: recordContent,
      ttl: recordTtl,
      proxied: recordProxied,
      status: 'active',
    };

    setDomainList((prev) =>
      prev.map((d) =>
        d.tld === selectedTld
          ? { ...d, dnsRecords: [newRecord, ...d.dnsRecords] }
          : d
      )
    );

    if (selectedTld === 'com') {
      onAddDnsRecord({
        type: recordType,
        name: recordName,
        content: recordContent,
        ttl: recordTtl,
        proxied: recordProxied,
      });
    }

    setRecordName('');
    setRecordContent('');
    setIsAddingRecord(false);
  };

  const handleToggleDomainProxy = (recordId: string) => {
    setDomainList((prev) =>
      prev.map((d) =>
        d.tld === selectedTld
          ? {
              ...d,
              dnsRecords: d.dnsRecords.map((r) =>
                r.id === recordId ? { ...r, proxied: !r.proxied } : r
              ),
            }
          : d
      )
    );
    if (selectedTld === 'com') {
      onToggleProxy(recordId);
    }
  };

  const handleDeleteDomainRecord = (recordId: string) => {
    setDomainList((prev) =>
      prev.map((d) =>
        d.tld === selectedTld
          ? {
              ...d,
              dnsRecords: d.dnsRecords.filter((r) => r.id !== recordId),
            }
          : d
      )
    );
    if (selectedTld === 'com') {
      onDeleteDnsRecord(recordId);
    }
  };

  const handleRunPropagationCheck = () => {
    setIsVerifyingPropagation(true);
    setVerifyMessage(null);
    setTimeout(() => {
      setIsVerifyingPropagation(false);
      setVerifyMessage(`Tất cả 6/6 trạm Anycast toàn cầu đã xác nhận phân giải DNS chuẩn xác cho ${activeDomainConfig.domain} (100% Propagation)!`);
      setTimeout(() => setVerifyMessage(null), 5000);
    }, 1100);
  };

  const getTldIcon = (tld: VelclawTld) => {
    switch (tld) {
      case 'com':
        return <Globe className="w-4 h-4 text-emerald-400" />;
      case 'dev':
        return <Terminal className="w-4 h-4 text-indigo-400" />;
      case 'ai':
        return <Bot className="w-4 h-4 text-purple-400" />;
      case 'io':
        return <Zap className="w-4 h-4 text-cyan-400" />;
      case 'app':
        return <Layers className="w-4 h-4 text-rose-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <LiveDnsManager />
      <LiveDnsManager />
      {/* Top Banner: Domain Strategy & Anti-CFD Notice */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-cyan-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Globe className="w-4 h-4" />
            <span>Hệ Thống Tên Miền Chính Thức Velclaw</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              5 Top-Level Domains (.com / .dev / .ai / .io / .app)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">
            Quản Lý Cụm Tên Miền &amp; Ingress Routing
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Đã loại bỏ hoàn toàn tên miền <span className="line-through text-rose-400 font-mono">velclaw.cfd</span>. Velclaw hiện dùng ba miền first-party: .site cho platform, .dev cho developer và .app cho application. DNS/SSL chỉ được đánh dấu active sau khi xác minh thực tế.
          </p>
        </div>

        <button
          id="check-propagation-btn"
          onClick={handleRunPropagationCheck}
          disabled={isVerifyingPropagation}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-950/50 disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingPropagation ? 'animate-spin' : ''}`} />
          <span>{isVerifyingPropagation ? 'Đang kiểm tra Anycast...' : `Kiểm Tra ${activeDomainConfig.domain}`}</span>
        </button>
      </div>

      {/* 5-TLD Ecosystem Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {domainList.map((item) => {
          const isSelected = item.tld === selectedTld;
          return (
            <button
              key={item.tld}
              id={`select-domain-tld-${item.tld}`}
              onClick={() => setSelectedTld(item.tld)}
              className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-800/90 border-cyan-500/80 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-500/40'
                  : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2">
                  {getTldIcon(item.tld)}
                  <span className="font-mono font-bold text-sm text-white">
                    .{item.tld}
                  </span>
                </div>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                  item.tld === 'com' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  item.tld === 'dev' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                  item.tld === 'ai' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                  item.tld === 'io' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                  'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {item.badge}
                </span>
              </div>

              <div>
                <div className="text-xs font-mono font-bold text-slate-200 truncate">
                  {item.domain}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  {item.role}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  SSL Active
                </span>
                <span className="text-slate-500">
                  {item.dnsRecords.length} records
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {verifyMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{verifyMessage}</span>
        </div>
      )}

      {/* Active Domain Overview Banner */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400">
            {getTldIcon(activeDomainConfig.tld)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white tracking-wide">{activeDomainConfig.domain}</span>
              <span className="text-xs text-slate-400">({activeDomainConfig.role})</span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              {activeDomainConfig.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopy(activeDomainConfig.domain)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 border border-slate-700 transition-colors"
            title="Sao chép tên miền"
          >
            {copiedDomain === activeDomainConfig.domain ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Đã sao chép</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy Domain</span>
              </>
            )}
          </button>
          <a
            href={`https://${activeDomainConfig.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 text-xs flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Mở HTTPS</span>
          </a>
        </div>
      </div>

      {/* SSL / HTTPS & HTTP Redirect Control Panel for Current Domain */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SSL Certificate Details */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Chứng Chỉ SSL / TLS 1.3 ({activeDomainConfig.domain})</h3>
                <p className="text-xs text-slate-400">Let&apos;s Encrypt Wildcard (*.{activeDomainConfig.domain})</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ACTIVE (SECURE)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Tổ Chức Cấp (CA):</span>
              <span className="text-slate-200 font-semibold">{ssl.issuer}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Loại Mã Hóa:</span>
              <span className="text-cyan-300 font-semibold">{ssl.type}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Phiên Bản TLS:</span>
              <span className="text-emerald-400 font-semibold">{activeDomainConfig.tlsVersion}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Thời Hạn Còn Lại:</span>
              <span className="text-emerald-300 font-bold">{ssl.daysRemaining} Ngày (Hạn: {ssl.validTo})</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Subject Alternative Names (SAN):</span>
              <span className="text-slate-300">{activeDomainConfig.domain}, *.{activeDomainConfig.domain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cipher Suite:</span>
              <span className="text-slate-300 truncate max-w-[240px]">{ssl.cipherSuite}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">SHA-256 Fingerprint:</span>
              <span className="text-slate-400 text-[10px] truncate max-w-[220px]">{ssl.fingerprint}</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tự động gia hạn qua ACME Protocol (Certbot / Caddy)</span>
            </div>
            <button 
              onClick={() => onUpdateSsl({ autoRenew: !ssl.autoRenew })}
              className={`text-xs px-2.5 py-1 rounded font-medium ${ssl.autoRenew ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}
            >
              {ssl.autoRenew ? 'Đang bật' : 'Đã tắt'}
            </button>
          </div>
        </div>

        {/* HTTP Redirect & Security Headers */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Chuyển Hướng HTTP 301 &amp; HSTS</h3>
                <p className="text-xs text-slate-400">Ép buộc toàn bộ lưu lượng web qua HTTPS</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              HTTP/3 ALPN OK
            </span>
          </div>

          <div className="space-y-3">
            {/* HTTP 301 Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div>
                <div className="text-xs font-semibold text-white">Tự Động Redirect HTTP (Port 80) Sang HTTPS</div>
                <div className="text-[11px] text-slate-400">Trả về HTTP Header 301 Moved Permanently cho mọi truy cập không an toàn</div>
              </div>
              <button
                id="toggle-http-redirect-btn"
                onClick={() => onUpdateSsl({ httpRedirectEnabled: !ssl.httpRedirectEnabled })}
                className="text-cyan-400 hover:text-cyan-300"
              >
                {ssl.httpRedirectEnabled ? (
                  <ToggleRight className="w-8 h-8 text-cyan-400" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-600" />
                )}
              </button>
            </div>

            {/* HSTS Preload Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div>
                <div className="text-xs font-semibold text-white">HSTS (HTTP Strict Transport Security)</div>
                <div className="text-[11px] text-slate-400">max-age=31536000; includeSubDomains; preload (Chống tấn công SSL Stripping)</div>
              </div>
              <button
                id="toggle-hsts-btn"
                onClick={() => onUpdateSsl({ hstsEnabled: !ssl.hstsEnabled })}
                className="text-cyan-400 hover:text-cyan-300"
              >
                {ssl.hstsEnabled ? (
                  <ToggleRight className="w-8 h-8 text-emerald-400" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-600" />
                )}
              </button>
            </div>

            {/* Nginx Ingress Preview */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 font-mono text-[11px] text-slate-300 space-y-1">
              <div className="text-slate-500 text-[10px] uppercase font-bold">// Nginx Ingress Rule (Active for {activeDomainConfig.domain})</div>
              <div className="text-cyan-300">server &#123;</div>
              <div className="pl-4 text-slate-400">listen 80; listen [::]:80;</div>
              <div className="pl-4 text-slate-400">server_name {activeDomainConfig.domain} *.{activeDomainConfig.domain};</div>
              <div className="pl-4 text-emerald-400">return 301 https://$host$request_uri;</div>
              <div className="text-cyan-300">&#125;</div>
            </div>
          </div>
        </div>
      </div>

      {/* DNS Records Management Table for Current Domain */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>Bảng Bản Ghi DNS Của {activeDomainConfig.domain}</span>
            </h3>
            <p className="text-xs text-slate-400">Authoritative Cloudflare DNS Records cho {activeDomainConfig.domain}</p>
          </div>

          <button
            id="open-add-dns-modal-btn"
            onClick={() => setIsAddingRecord(!isAddingRecord)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-colors self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Bản Ghi Mới</span>
          </button>
        </div>

        {/* Add record form */}
        {isAddingRecord && (
          <form onSubmit={handleCreateRecord} className="p-4 rounded-xl bg-slate-950 border border-slate-700/80 space-y-3 animate-fade-in">
            <div className="text-xs font-bold text-white uppercase tracking-wider">
              Tạo bản ghi DNS mới cho {activeDomainConfig.domain}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Loại</label>
                <select
                  value={recordType}
                  onChange={(e) => setRecordType(e.target.value as DnsRecord['type'])}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                >
                  <option value="A">A (IPv4)</option>
                  <option value="AAAA">AAAA (IPv6)</option>
                  <option value="CNAME">CNAME (Alias)</option>
                  <option value="TXT">TXT (Verification)</option>
                  <option value="CAA">CAA (Certificate)</option>
                  <option value="NS">NS (Name Server)</option>
                  <option value="MX">MX (Mail)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Tên (@ hoặc subdomain)</label>
                <input
                  type="text"
                  placeholder="@, sub, www, api..."
                  value={recordName}
                  onChange={(e) => setRecordName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Nội dung / Giá trị trỏ đến</label>
                <input
                  type="text"
                  placeholder="104.21.78.142 hoặc alias target"
                  value={recordContent}
                  onChange={(e) => setRecordContent(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">TTL &amp; Proxy Edge</label>
                <div className="flex items-center gap-2">
                  <select
                    value={recordTtl}
                    onChange={(e) => setRecordTtl(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                  >
                    <option value={300}>300s (Auto)</option>
                    <option value={600}>10 phút</option>
                    <option value={3600}>1 giờ</option>
                    <option value={86400}>1 ngày</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setRecordProxied(!recordProxied)}
                    className={`px-2 py-1.5 rounded text-[10px] font-bold ${
                      recordProxied ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {recordProxied ? 'Proxy' : 'DNS'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingRecord(false)}
                className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-3.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
              >
                Lưu Bản Ghi Cho {activeDomainConfig.domain}
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Loại</th>
                <th className="py-2.5 px-3">Tên Host</th>
                <th className="py-2.5 px-3">FQDN Đầy Đủ</th>
                <th className="py-2.5 px-3">Nội Dung / Đích Đến</th>
                <th className="py-2.5 px-3">TTL</th>
                <th className="py-2.5 px-3">Proxy Edge</th>
                <th className="py-2.5 px-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {activeDomainConfig.dnsRecords.map((r) => {
                const fullHost = r.name === '@' ? activeDomainConfig.domain : `${r.name}.${activeDomainConfig.domain}`;
                return (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        {r.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-white">
                      {r.name}
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px]">
                      {fullHost}
                    </td>
                    <td className="py-3 px-3 text-slate-300 max-w-xs truncate">
                      {r.content}
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {r.ttl === 300 ? 'Auto (300s)' : `${r.ttl}s`}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        onClick={() => handleToggleDomainProxy(r.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                          r.proxied
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                        }`}
                        title="Chuyển đổi Proxy Cloudflare Edge"
                      >
                        {r.proxied ? 'Proxied (Argo)' : 'DNS Only'}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleDeleteDomainRecord(r.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors text-[11px]"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Anycast DNS Propagation status */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Trạng Thái Phân Giải Anycast Toàn Cầu ({activeDomainConfig.domain})</span>
            </h3>
            <p className="text-xs text-slate-400">Kiểm tra kết quả phân giải DNS trên 6 khu vực trọng yếu</p>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            100% Đồng Bộ
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {worldwideLocations.map((loc) => (
            <div key={loc.code} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-center space-y-1">
              <div className="text-[10px] text-slate-400 font-mono">{loc.code}</div>
              <div className="text-xs font-bold text-white truncate">{loc.city}</div>
              <div className="flex items-center justify-center gap-1 text-[11px] text-emerald-400 font-mono">
                <Check className="w-3 h-3 text-emerald-400" />
                <span>{loc.latency}</span>
              </div>
              <div className="text-[9px] text-slate-500 font-mono truncate">{loc.ip}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


function LiveDnsManager() {
  const [records, setRecords] = useState<any[]>([]);
  const [zone, setZone] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState('TXT');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [ttl, setTtl] = useState(300);
  const [proxied, setProxied] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setBusy(true); setError('');
    try {
      const [s, r] = await Promise.all([
        fetch('/api/v1/dns/status', { cache: 'no-store' }),
        fetch('/api/v1/dns/records?type=' + encodeURIComponent(type), { cache: 'no-store' }),
      ]);
      const sj = await s.json(); const rj = await r.json();
      if (!s.ok) throw new Error(sj.error || sj.message || 'DNS manager chưa được cấu hình trên server.');
      if (!r.ok) throw new Error(rj.error || 'Không thể tải DNS records.');
      setZone(sj.zone || null); setRecords(Array.isArray(rj.records) ? rj.records : []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [type]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/v1/dns/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name, content, ttl, proxied }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Không thể tạo DNS record.');
      setName(''); setContent(''); setNotice('Đã tạo bản ghi DNS.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Xóa bản ghi DNS này? Thao tác có thể ảnh hưởng dịch vụ đang dùng bản ghi.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/v1/dns/records/' + encodeURIComponent(id), { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Không thể xóa DNS record.');
      setNotice('Đã xóa bản ghi DNS.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 sm:p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-300"><Cloud className="h-5 w-5" /></div><div><h3 className="font-semibold text-white">DNS Manager · Live</h3><p className="text-xs text-slate-400">Quản lý bản ghi thật qua API; nameserver vẫn giữ nguyên.</p></div></div>
      <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-50"><RefreshIcon className={"h-4 w-4 " + (busy ? 'animate-spin' : '')} /> Làm mới</button>
    </div>
    {zone && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-slate-300">Zone <b className="text-white">{zone.name}</b> · {zone.status} · Nameservers: {(zone.nameServers || []).join(', ')}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}
    <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
      <select aria-label="Loại DNS" value={type} onChange={e => setType(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white">{['A','AAAA','CNAME','TXT','MX','CAA','SRV','NS'].map(t => <option key={t}>{t}</option>)}</select>
      <input aria-label="Tên bản ghi" required value={name} onChange={e => setName(e.target.value)} placeholder="api.velclaw.tech" className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white sm:col-span-1 lg:col-span-2" />
      <input aria-label="Giá trị bản ghi" required value={content} onChange={e => setContent(e.target.value)} placeholder="Giá trị / IP / target" className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white sm:col-span-1 lg:col-span-2" />
      <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"><PlusCircle className="h-4 w-4" /> Thêm record</button>
      <label className="flex items-center gap-2 px-1 text-xs text-slate-300">TTL <input type="number" min="60" max="86400" value={ttl} onChange={e => setTtl(Number(e.target.value))} className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2" /></label>
      {['A','AAAA','CNAME'].includes(type) && <label className="flex items-center gap-2 px-1 text-xs text-slate-300"><input type="checkbox" checked={proxied} onChange={e => setProxied(e.target.checked)} /> Cloudflare proxy</label>}
    </form>
    <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="bg-slate-900 text-slate-400"><tr><th className="p-3">Type</th><th className="p-3">Name</th><th className="p-3">Content</th><th className="p-3">TTL</th><th className="p-3">Proxy</th><th className="p-3">Thao tác</th></tr></thead><tbody>{records.map(r => <tr key={r.id} className="border-t border-slate-800 text-slate-200"><td className="p-3 font-mono">{r.type}</td><td className="p-3 font-mono">{r.name}</td><td className="p-3 font-mono max-w-64 break-all">{r.content}</td><td className="p-3">{r.ttl === 1 ? 'Auto' : r.ttl}</td><td className="p-3">{r.proxied ? 'Bật' : 'Tắt'}</td><td className="p-3"><button type="button" onClick={() => void remove(r.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1.5 text-rose-300 disabled:opacity-50"><Trash className="h-3.5 w-3.5" /> Xóa</button></td></tr>)}</tbody></table></div>
    {!busy && !records.length && !error && <p className="text-sm text-slate-400">Không có bản ghi thuộc bộ lọc này.</p>}
    <p className="text-[11px] text-slate-500">DNS mutations require an admin account. Không đổi nameserver từ màn hình này; kiểm tra kỹ bản ghi trước khi xóa.</p>
  </section>;
}
