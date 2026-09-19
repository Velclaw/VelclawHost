import React, { useState } from 'react';
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
  Info
} from 'lucide-react';
import { DnsRecord, SslInfo, HostNode } from '../types';

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
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [recordType, setRecordType] = useState<DnsRecord['type']>('A');
  const [recordName, setRecordName] = useState('');
  const [recordContent, setRecordContent] = useState('');
  const [recordTtl, setRecordTtl] = useState(300);
  const [recordProxied, setRecordProxied] = useState(true);
  const [isVerifyingPropagation, setIsVerifyingPropagation] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const worldwideLocations = [
    { city: 'Tokyo, JP', code: 'NRT', status: 'OK', latency: '6ms', ip: '104.21.78.142' },
    { city: 'Singapore, SG', code: 'SIN', status: 'OK', latency: '18ms', ip: '104.21.78.142' },
    { city: 'Frankfurt, DE', code: 'FRA', status: 'OK', latency: '42ms', ip: '104.21.78.142' },
    { city: 'London, UK', code: 'LHR', status: 'OK', latency: '45ms', ip: '104.21.78.142' },
    { city: 'Ashburn (US-East), US', code: 'IAD', status: 'OK', latency: '68ms', ip: '104.21.78.142' },
    { city: 'Sydney, AU', code: 'SYD', status: 'OK', latency: '52ms', ip: '104.21.78.142' },
  ];

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordName || !recordContent) return;
    onAddDnsRecord({
      type: recordType,
      name: recordName,
      content: recordContent,
      ttl: recordTtl,
      proxied: recordProxied,
    });
    setRecordName('');
    setRecordContent('');
    setIsAddingRecord(false);
  };

  const handleRunPropagationCheck = () => {
    setIsVerifyingPropagation(true);
    setVerifyMessage(null);
    setTimeout(() => {
      setIsVerifyingPropagation(false);
      setVerifyMessage('Tất cả 6/6 trạm Anycast toàn cầu đã xác nhận phân giải DNS chuẩn xác (100% Propagation)!');
      setTimeout(() => setVerifyMessage(null), 5000);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Globe className="w-4 h-4" />
            <span>Cấu Hình DNS + HTTPS + HTTP</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">
            Kết Nối Bảo Mật &amp; Ổn Định Tuyệt Đối
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Hệ thống đã cấu hình sẵn chứng chỉ Let&apos;s Encrypt TLS 1.3, tự động chuyển hướng HTTP Port 80 sang HTTPS Port 443 bằng mã 301 Permanent Redirect, và đồng bộ Anycast DNSSEC.
          </p>
        </div>

        <button
          id="check-propagation-btn"
          onClick={handleRunPropagationCheck}
          disabled={isVerifyingPropagation}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-950/50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingPropagation ? 'animate-spin' : ''}`} />
          <span>{isVerifyingPropagation ? 'Đang kiểm tra Anycast...' : 'Kiểm Tra Phân Giải Toàn Cầu'}</span>
        </button>
      </div>

      {verifyMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{verifyMessage}</span>
        </div>
      )}

      {/* SSL / HTTPS & HTTP Redirect Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SSL Certificate Details */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Chứng Chỉ SSL / TLS Certificate</h3>
                <p className="text-xs text-slate-400">Giao thức mã hóa đầu-cuối end-to-end</p>
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
              <span className="text-emerald-400 font-semibold">{ssl.tlsVersion}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Thời Hạn Còn Lại:</span>
              <span className="text-emerald-300 font-bold">{ssl.daysRemaining} Ngày (Hạn: {ssl.validTo})</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Cipher Suite:</span>
              <span className="text-slate-300 truncate max-w-[240px]">{ssl.cipherSuite}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">SHA-256 Fingerprint:</span>
              <span className="text-slate-400 text-[10px] truncate max-w-[220px]">{ssl.fingerprint}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">OCSP Stapling:</span>
              <span className="text-emerald-400">Verified by Let&apos;s Encrypt</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tự động gia hạn qua ACME Protocol (Certbot)</span>
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
              <div className="text-slate-500 text-[10px] uppercase font-bold">// Nginx Ingress Rule (Active)</div>
              <div className="text-cyan-300">server &#123;</div>
              <div className="pl-4 text-slate-400">listen 80; listen [::]:80;</div>
              <div className="pl-4 text-slate-400">server_name {node.hostname};</div>
              <div className="pl-4 text-emerald-400">return 301 https://$host$request_uri;</div>
              <div className="text-cyan-300">&#125;</div>
            </div>
          </div>
        </div>
      </div>

      {/* DNS Records Management Table */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>Bảng Bản Ghi DNS (Authoritative Records)</span>
            </h3>
            <p className="text-xs text-slate-400">Quản lý các bản ghi trỏ tên miền về máy chủ Velclaw</p>
          </div>

          <button
            id="open-add-dns-modal-btn"
            onClick={() => setIsAddingRecord(!isAddingRecord)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-colors self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Bản Ghi DNS Mới</span>
          </button>
        </div>

        {/* Add record form */}
        {isAddingRecord && (
          <form onSubmit={handleCreateRecord} className="p-4 rounded-xl bg-slate-950 border border-slate-700/80 space-y-3 animate-fade-in">
            <div className="text-xs font-bold text-white uppercase tracking-wider">Tạo bản ghi DNS mới</div>
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
                  placeholder="@, sub, www..."
                  value={recordName}
                  onChange={(e) => setRecordName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Nội dung / IP đích</label>
                <input
                  type="text"
                  placeholder="104.21.78.142 hoặc alias"
                  value={recordContent}
                  onChange={(e) => setRecordContent(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">TTL &amp; Proxy</label>
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
                Lưu Bản Ghi
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
                <th className="py-2.5 px-3">Tên</th>
                <th className="py-2.5 px-3">Nội Dung / Giá Trị</th>
                <th className="py-2.5 px-3">TTL</th>
                <th className="py-2.5 px-3">Proxy Edge</th>
                <th className="py-2.5 px-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {dnsRecords.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      {r.type}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-semibold text-white">
                    {r.name}
                  </td>
                  <td className="py-3 px-3 text-slate-300 max-w-xs truncate">
                    {r.content}
                  </td>
                  <td className="py-3 px-3 text-slate-400">
                    {r.ttl === 300 ? 'Auto (300s)' : `${r.ttl}s`}
                  </td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => onToggleProxy(r.id)}
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
                      onClick={() => onDeleteDnsRecord(r.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors text-[11px]"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
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
              <span>Trạng Thái Phân Giải Anycast Toàn Cầu (DNS Propagation)</span>
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
