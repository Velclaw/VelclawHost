import React, { useState, useMemo } from 'react';
import { 
  Globe, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  ExternalLink, 
  Copy, 
  CheckCheck, 
  Trash2, 
  ShieldCheck, 
  Search, 
  Filter, 
  HelpCircle, 
  ArrowRight,
  Info,
  Server,
  Zap,
  Terminal,
  Bot,
  Layers,
  ChevronDown,
  Lock
} from 'lucide-react';
import { CustomDomain, VelclawTld, HostNode } from '../types';

interface DomainManagementTabProps {
  customDomains: CustomDomain[];
  currentNodes: HostNode[];
  onAddDomain: (domain: Omit<CustomDomain, 'id' | 'createdAt'>) => void;
  onDeleteDomain: (id: string) => void;
  onVerifyDomain: (id: string) => Promise<boolean>;
}

export const DomainManagementTab: React.FC<DomainManagementTabProps> = ({
  customDomains,
  currentNodes,
  onAddDomain,
  onDeleteDomain,
  onVerifyDomain,
}) => {
  // Form State
  const [domainInput, setDomainInput] = useState('');
  const [recordType, setRecordType] = useState<'A' | 'CNAME'>('A');
  const [targetValue, setTargetValue] = useState('104.21.78.142');
  const [notesInput, setNotesInput] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Validation Error State
  const [validationError, setValidationError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTldFilter, setSelectedTldFilter] = useState<'ALL' | VelclawTld>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'active' | 'pending'>('ALL');

  // UI Interactive State
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeGuideDomain, setActiveGuideDomain] = useState<CustomDomain | null>(null);

  // Supported TLDs definition
  const SUPPORTED_TLDS: { tld: VelclawTld; label: string; desc: string; color: string }[] = [
    { tld: 'com', label: '.com', desc: 'Canonical / Enterprise Web', color: 'emerald' },
    { tld: 'dev', label: '.dev', desc: 'Developer & Preview Staging', color: 'indigo' },
    { tld: 'ai', label: '.ai', desc: 'AI Engine & Agents Cluster', color: 'purple' },
    { tld: 'io', label: '.io', desc: 'High-IOPS Gateway Ingress', color: 'cyan' },
    { tld: 'app', label: '.app', desc: 'SaaS Console & Web Apps', color: 'rose' },
  ];

  // Helper: detect TLD from domain string
  const detectTld = (val: string): VelclawTld | null => {
    const clean = val.trim().toLowerCase();
    if (clean.endsWith('.com')) return 'com';
    if (clean.endsWith('.dev')) return 'dev';
    if (clean.endsWith('.ai')) return 'ai';
    if (clean.endsWith('.io')) return 'io';
    if (clean.endsWith('.app')) return 'app';
    return null;
  };

  const detectedTld = detectTld(domainInput);

  // Helper: Validate IPv4
  const validateIpV4 = (ip: string): boolean => {
    const regex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
    return regex.test(ip.trim());
  };

  // Helper: Validate Hostname
  const validateHostname = (host: string): boolean => {
    const regex = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;
    return regex.test(host.trim()) && host.trim().length >= 3;
  };

  // Real-time domain validation logic
  const handleDomainChange = (val: string) => {
    setDomainInput(val);
    const clean = val.trim().toLowerCase();

    if (!clean) {
      setValidationError(null);
      return;
    }

    // Check basic format
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!domainPattern.test(clean)) {
      setValidationError('Định dạng tên miền chưa đúng (ví dụ hợp lệ: myapp.com, api.cluster.dev, agent.brain.ai)');
      return;
    }

    // Check supported TLD
    const tld = detectTld(clean);
    if (!tld) {
      setValidationError('Tên miền bắt buộc phải thuộc một trong 5 TLDs được hỗ trợ: .com, .dev, .ai, .io, .app');
      return;
    }

    setValidationError(null);
  };

  // Real-time target validation logic
  const handleTargetChange = (val: string) => {
    setTargetValue(val);
    const clean = val.trim();

    if (!clean) {
      setTargetError('Giá trị IP/Host không được để trống');
      return;
    }

    if (recordType === 'A') {
      if (!validateIpV4(clean)) {
        setTargetError('Bản ghi A yêu cầu địa chỉ IPv4 hợp lệ (ví dụ: 104.21.78.142)');
      } else {
        setTargetError(null);
      }
    } else {
      if (!validateHostname(clean)) {
        setTargetError('Bản ghi CNAME yêu cầu Hostname hợp lệ (ví dụ: prod-edge-asia1.velclaw.cfd)');
      } else {
        setTargetError(null);
      }
    }
  };

  // Switch record type with auto placeholder suggestion
  const handleRecordTypeChange = (type: 'A' | 'CNAME') => {
    setRecordType(type);
    if (type === 'A') {
      setTargetValue('104.21.78.142');
      setTargetError(null);
    } else {
      setTargetValue('prod-edge-asia1.velclaw.cfd');
      setTargetError(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2500);
  };

  // Handle Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDomain = domainInput.trim().toLowerCase();
    const cleanTarget = targetValue.trim();

    // Final checks
    const tld = detectTld(cleanDomain);
    if (!tld) {
      setValidationError('Tên miền bắt buộc phải thuộc 5 TLDs: .com, .dev, .ai, .io, .app');
      return;
    }

    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!domainPattern.test(cleanDomain)) {
      setValidationError('Định dạng tên miền không hợp lệ');
      return;
    }

    if (recordType === 'A' && !validateIpV4(cleanTarget)) {
      setTargetError('Địa chỉ IPv4 không hợp lệ');
      return;
    }

    if (recordType === 'CNAME' && !validateHostname(cleanTarget)) {
      setTargetError('Địa chỉ Hostname CNAME không hợp lệ');
      return;
    }

    // Check duplicate
    if (customDomains.some((d) => d.domain.toLowerCase() === cleanDomain)) {
      setValidationError(`Tên miền ${cleanDomain} đã tồn tại trong danh sách!`);
      return;
    }

    // Determine initial status: if target matches Velclaw edge servers, set active, else pending
    const isStandardEdge = cleanTarget === '104.21.78.142' || cleanTarget.includes('velclaw');
    const initialStatus = isStandardEdge ? 'active' : 'pending';

    onAddDomain({
      domain: cleanDomain,
      tld,
      recordType,
      targetValue: cleanTarget,
      status: initialStatus,
      sslStatus: initialStatus === 'active' ? 'active' : 'pending',
      lastCheckedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      notes: notesInput.trim() || undefined,
    });

    setNotificationMsg({
      type: 'success',
      text: `Đã thêm thành công tên miền tùy chỉnh ${cleanDomain} (${initialStatus === 'active' ? 'Đang hoạt động' : 'Chờ duyệt DNS'})!`,
    });
    setTimeout(() => setNotificationMsg(null), 5000);

    // Reset Form
    setDomainInput('');
    setNotesInput('');
    setIsFormOpen(false);
    setValidationError(null);
    setTargetError(null);
  };

  // Trigger manual DNS Verification query
  const handleVerify = async (item: CustomDomain) => {
    setVerifyingId(item.id);
    try {
      const isSuccess = await onVerifyDomain(item.id);
      if (isSuccess) {
        setNotificationMsg({
          type: 'success',
          text: `Xác thực thành công! Tên miền ${item.domain} đã kích hoạt kết nối DNS và chứng chỉ SSL/TLS.`,
        });
      } else {
        setNotificationMsg({
          type: 'error',
          text: `Chưa thể xác thực ${item.domain}. Vui lòng kiểm tra lại bản ghi DNS tại nhà cung cấp tên miền của bạn.`,
        });
      }
    } catch {
      setNotificationMsg({
        type: 'error',
        text: `Gặp lỗi khi kết nối truy vấn Anycast DNS cho ${item.domain}.`,
      });
    } finally {
      setVerifyingId(null);
      setTimeout(() => setNotificationMsg(null), 6000);
    }
  };

  // Filtered domains
  const filteredDomains = useMemo(() => {
    return customDomains.filter((item) => {
      const matchesSearch = item.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.targetValue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesTld = selectedTldFilter === 'ALL' || item.tld === selectedTldFilter;
      const matchesStatus = selectedStatusFilter === 'ALL' || item.status === selectedStatusFilter;

      return matchesSearch && matchesTld && matchesStatus;
    });
  }, [customDomains, searchQuery, selectedTldFilter, selectedStatusFilter]);

  // Statistics calculation
  const totalCount = customDomains.length;
  const activeCount = customDomains.filter((d) => d.status === 'active').length;
  const pendingCount = customDomains.filter((d) => d.status === 'pending').length;

  const getTldBadgeColor = (tld: VelclawTld) => {
    switch (tld) {
      case 'com':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'dev':
        return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
      case 'ai':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'io':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'app':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-indigo-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Globe className="w-4 h-4" />
            <span>Quản Lý Tên Miền Tùy Chỉnh (Custom Domain Management)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Quy chuẩn 5 TLDs
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">
            Cấu Hình &amp; Điều Phối Tên Miền Tùy Chỉnh
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Gắn kết tên miền riêng của bạn vào cụm hạ tầng Velclaw với các đuôi cao cấp <span className="font-mono text-cyan-400 font-bold">.com</span>, <span className="font-mono text-indigo-400 font-bold">.dev</span>, <span className="font-mono text-purple-400 font-bold">.ai</span>, <span className="font-mono text-cyan-300 font-bold">.io</span>, và <span className="font-mono text-rose-400 font-bold">.app</span>. Tự động kiểm tra cú pháp, xác thực định tuyến Anycast và cấp phát SSL Let&apos;s Encrypt.
          </p>
        </div>

        <button
          id="btn-open-add-domain"
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-950/50 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{isFormOpen ? 'Đóng Biểu Mẫu' : 'Thêm Tên Miền Mới'}</span>
        </button>
      </div>

      {/* Notification Banner */}
      {notificationMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 animate-fade-in ${
            notificationMsg.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : notificationMsg.type === 'error'
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notificationMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <span>{notificationMsg.text}</span>
          </div>
          <button
            onClick={() => setNotificationMsg(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">Tổng Tên Miền</span>
            <span className="text-2xl font-bold font-mono text-white">{totalCount}</span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Trên 5 TLDs tiêu chuẩn</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-indigo-400">
            <Globe className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">Đang Hoạt Động</span>
            <span className="text-2xl font-bold font-mono text-emerald-400">{activeCount}</span>
            <span className="text-[11px] text-emerald-500/80 block mt-0.5">Phân giải Anycast OK</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">Chờ Duyệt DNS</span>
            <span className="text-2xl font-bold font-mono text-amber-400">{pendingCount}</span>
            <span className="text-[11px] text-amber-500/80 block mt-0.5">Cần trỏ bản ghi A/CNAME</span>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">SSL/TLS 1.3 Auto</span>
            <span className="text-2xl font-bold font-mono text-cyan-400">100%</span>
            <span className="text-[11px] text-cyan-500/80 block mt-0.5">Auto-cert ACME</span>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Lock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Add Custom Domain Form */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="p-5 rounded-2xl bg-slate-900 border border-indigo-500/50 shadow-xl shadow-indigo-950/20 space-y-4 animate-fade-in"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Cấu Hình Tên Miền Tùy Chỉnh Mới</h3>
                <p className="text-xs text-slate-400">Nhập tên miền thuộc .com, .dev, .ai, .io, .app và thiết lập loại bản ghi DNS</p>
              </div>
            </div>

            {detectedTld && (
              <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold border flex items-center gap-1.5 ${getTldBadgeColor(detectedTld)}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Nhận diện: .{detectedTld.toUpperCase()}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Field 1: Domain Name */}
            <div className="space-y-1.5 md:col-span-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Tên Miền Tùy Chỉnh <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="input-custom-domain-name"
                  type="text"
                  placeholder="ví dụ: portal.mybrand.com"
                  value={domainInput}
                  onChange={(e) => handleDomainChange(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-1 ${
                    validationError
                      ? 'border-rose-500/70 focus:ring-rose-500 text-rose-200'
                      : detectedTld
                      ? 'border-indigo-500/70 focus:ring-indigo-500'
                      : 'border-slate-700 focus:ring-slate-500'
                  }`}
                  required
                />
              </div>

              {validationError ? (
                <div className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>{validationError}</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 mt-1">
                  TLDs hợp lệ: <span className="text-slate-300 font-mono">.com, .dev, .ai, .io, .app</span>
                </div>
              )}
            </div>

            {/* Field 2: Record Type (A or CNAME) */}
            <div className="space-y-1.5 md:col-span-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Loại Bản Ghi DNS <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="btn-select-record-a"
                  onClick={() => handleRecordTypeChange('A')}
                  className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 ${
                    recordType === 'A'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                  }`}
                >
                  <span>Bản ghi A</span>
                  <span className="text-[10px] opacity-75">(IPv4)</span>
                </button>

                <button
                  type="button"
                  id="btn-select-record-cname"
                  onClick={() => handleRecordTypeChange('CNAME')}
                  className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 ${
                    recordType === 'CNAME'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                  }`}
                >
                  <span>CNAME</span>
                  <span className="text-[10px] opacity-75">(Alias)</span>
                </button>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {recordType === 'A' ? 'Trỏ địa chỉ IP trực tiếp tới Node' : 'Trỏ bí danh (Alias) tới Ingress Gateway'}
              </div>
            </div>

            {/* Field 3: Target Value (IP or Host) */}
            <div className="space-y-1.5 md:col-span-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 block">
                  {recordType === 'A' ? 'Địa Chỉ IPv4 Đích' : 'Hostname Đích (Alias)'} <span className="text-rose-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleRecordTypeChange(recordType)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300"
                >
                  Dùng IP/Host Mặc Định
                </button>
              </div>

              <input
                id="input-custom-domain-target"
                type="text"
                placeholder={recordType === 'A' ? '104.21.78.142' : 'prod-edge-asia1.velclaw.cfd'}
                value={targetValue}
                onChange={(e) => handleTargetChange(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-1 ${
                  targetError
                    ? 'border-rose-500/70 focus:ring-rose-500 text-rose-200'
                    : 'border-slate-700 focus:ring-indigo-500'
                }`}
                required
              />

              {targetError ? (
                <div className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>{targetError}</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 mt-1">
                  {recordType === 'A' ? 'Gợi ý: 104.21.78.142 hoặc 172.67.190.84' : 'Gợi ý: prod-edge-asia1.velclaw.cfd'}
                </div>
              )}
            </div>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">
              Ghi Chú Mục Đích (Tùy chọn)
            </label>
            <input
              type="text"
              placeholder="ví dụ: Môi trường production, Cổng API cho mobile app, Dự án AI Agent..."
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Chứng chỉ SSL Let&apos;s Encrypt sẽ được cấp tự động sau khi bản ghi DNS có hiệu lực.</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
              >
                Hủy
              </button>
              <button
                id="btn-submit-custom-domain"
                type="submit"
                disabled={Boolean(validationError) || Boolean(targetError) || !domainInput}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:pointer-events-none transition-all shadow-md shadow-indigo-950/40"
              >
                Lưu &amp; Kích Hoạt Cấu Hình
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Tìm theo tên miền, IP hoặc ghi chú..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center flex-wrap gap-2">
          {/* TLD Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-500 px-2 font-medium">TLD:</span>
            {(['ALL', 'com', 'dev', 'ai', 'io', 'app'] as const).map((tld) => (
              <button
                key={tld}
                onClick={() => setSelectedTldFilter(tld)}
                className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
                  selectedTldFilter === tld
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tld === 'ALL' ? 'TẤT CẢ' : `.${tld}`}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-500 px-2 font-medium">Trạng thái:</span>
            {(['ALL', 'active', 'pending'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatusFilter(st)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                  selectedStatusFilter === st
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st === 'ALL' ? 'Tất cả' : st === 'active' ? 'Đang hoạt động' : 'Chờ duyệt'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom Domains Table */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span>Danh Sách Tên Miền Tùy Chỉnh Đã Cấu Hình ({filteredDomains.length})</span>
            </h3>
            <p className="text-xs text-slate-400">Kiểm tra trạng thái xác thực DNS và chứng chỉ bảo mật</p>
          </div>
        </div>

        {filteredDomains.length === 0 ? (
          <div className="p-8 text-center space-y-3 bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
            <Globe className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-slate-300">Không tìm thấy tên miền nào phù hợp</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Chưa có tên miền nào được thêm hoặc bộ lọc hiện tại không khớp. Bấm nút &quot;Thêm Tên Miền Mới&quot; để bắt đầu gắn kết tên miền của bạn.
            </p>
            <button
              onClick={() => setIsFormOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Tên Miền Ngay</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">Tên Miền</th>
                  <th className="py-3 px-3">TLD</th>
                  <th className="py-3 px-3">Loại Bản Ghi</th>
                  <th className="py-3 px-3">Giá Trị IP / Host</th>
                  <th className="py-3 px-3">Trạng Thái DNS</th>
                  <th className="py-3 px-3">Chứng Chỉ SSL</th>
                  <th className="py-3 px-3">Ngày Tạo</th>
                  <th className="py-3 px-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredDomains.map((item) => {
                  const isVerifying = verifyingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Domain Name */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-xs">{item.domain}</span>
                          <a
                            href={`https://${item.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-cyan-400 transition-colors"
                            title={`Truy cập https://${item.domain}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        {item.notes && (
                          <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                            {item.notes}
                          </div>
                        )}
                      </td>

                      {/* TLD */}
                      <td className="py-3.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getTldBadgeColor(item.tld)}`}>
                          .{item.tld}
                        </span>
                      </td>

                      {/* Record Type */}
                      <td className="py-3.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          item.recordType === 'A'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        }`}>
                          {item.recordType}
                        </span>
                      </td>

                      {/* Target Value */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5 text-slate-300 max-w-[200px] truncate">
                          <span>{item.targetValue}</span>
                          <button
                            onClick={() => handleCopy(item.targetValue)}
                            className="text-slate-500 hover:text-white"
                            title="Sao chép giá trị đích"
                          >
                            {copiedText === item.targetValue ? (
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* DNS Status (Active vs Pending) */}
                      <td className="py-3.5 px-3">
                        {isVerifying ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-flex items-center gap-1.5 animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Đang kiểm tra...</span>
                          </span>
                        ) : item.status === 'active' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>Đang hoạt động</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Chờ duyệt DNS</span>
                          </span>
                        )}
                      </td>

                      {/* SSL Status */}
                      <td className="py-3.5 px-3">
                        {item.sslStatus === 'active' ? (
                          <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>TLS 1.3 OK</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Đang cấp phát</span>
                          </span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-3 text-slate-400 text-[11px]">
                        {item.createdAt.slice(0, 10)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleVerify(item)}
                            disabled={isVerifying}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-semibold border border-slate-700 flex items-center gap-1 transition-colors disabled:opacity-50"
                            title="Thực hiện truy vấn Anycast kiểm tra bản ghi DNS"
                          >
                            <RefreshCw className={`w-3 h-3 ${isVerifying ? 'animate-spin' : ''}`} />
                            <span>Kiểm Tra DNS</span>
                          </button>

                          <button
                            onClick={() => setActiveGuideDomain(item)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] border border-slate-700 transition-colors"
                            title="Xem hướng dẫn trỏ DNS tại Registrar"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              if (window.confirm(`Bạn có chắc chắn muốn xóa tên miền ${item.domain}?`)) {
                                onDeleteDomain(item.id);
                              }
                            }}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Xóa tên miền tùy chỉnh"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Setup Instructions & DNS Delegation Modal / Drawer */}
      {activeGuideDomain && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Hướng Dẫn Cấu Hình Bản Ghi DNS Cho: <span className="text-indigo-400 font-mono">{activeGuideDomain.domain}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Thực hiện thêm bản ghi sau vào bảng quản lý DNS tại Nhà cung cấp tên miền của bạn (Cloudflare, Namecheap, GoDaddy...)
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveGuideDomain(null)}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800"
            >
              Đóng hướng dẫn
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase block mb-1">Loại Bản Ghi (Type)</span>
              <span className="text-indigo-300 font-bold text-sm">{activeGuideDomain.recordType}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase block mb-1">Tên Host (Host / Name)</span>
              <span className="text-slate-200 font-bold text-sm">
                {activeGuideDomain.domain.split('.')[0] === activeGuideDomain.domain ? '@' : activeGuideDomain.domain.split('.')[0]}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 md:col-span-2 flex items-center justify-between">
              <div>
                <span className="text-slate-500 text-[10px] uppercase block mb-1">Giá Trị / Trỏ Tới (Value / Target)</span>
                <span className="text-emerald-400 font-bold text-sm">{activeGuideDomain.targetValue}</span>
              </div>
              <button
                onClick={() => handleCopy(activeGuideDomain.targetValue)}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[11px] border border-slate-700 flex items-center gap-1"
              >
                {copiedText === activeGuideDomain.targetValue ? (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Info className="w-4 h-4 text-cyan-400" />
              <span>Quy trình hoàn tất:</span>
            </div>
            <ol className="list-decimal pl-5 space-y-1 text-slate-400 text-[11px]">
              <li>Đăng nhập trang quản trị DNS tại Registrar nơi bạn đã mua tên miền <strong>.{activeGuideDomain.tld}</strong>.</li>
              <li>Thêm bản ghi <strong>{activeGuideDomain.recordType}</strong> với giá trị mục tiêu <strong>{activeGuideDomain.targetValue}</strong> và TTL là <strong>300 (Auto)</strong>.</li>
              <li>Sau khoảng 1 - 5 phút (khi DNS lan truyền xong), quay lại đây bấm <strong>&quot;Kiểm Tra DNS&quot;</strong> để hệ thống xác nhận trạng thái <strong>&quot;Đang hoạt động&quot;</strong> và tự động kích hoạt chứng chỉ SSL TLS 1.3.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Bottom Ecosystem Matrix for the 5 TLDs */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Tiêu Chuẩn 5 TLDs Được Tối Ưu Hóa Sẵn Sàng (Ready Ingress)</span>
            </h3>
            <p className="text-xs text-slate-400">Hạ tầng VelclawHost tự động cấu hình wildcard routing và TLS cho 5 đuôi tên miền</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {SUPPORTED_TLDS.map((item) => (
            <div
              key={item.tld}
              className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${getTldBadgeColor(item.tld)}`}>
                  {item.label}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Sẵn sàng
                </span>
              </div>
              <div className="text-xs font-bold text-white">{item.desc}</div>
              <div className="text-[10px] text-slate-500 font-mono">
                Wildcard *.{item.tld} auto-routed
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
