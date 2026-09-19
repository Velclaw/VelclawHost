import React, { useState } from 'react';
import { 
  Database, 
  Zap, 
  CheckCircle2, 
  Clock, 
  Layers, 
  TrendingUp, 
  RefreshCw, 
  Check, 
  Flame,
  ArrowRight,
  Code2
} from 'lucide-react';
import { SlowQuery } from '../types';

interface DbOptimizationTabProps {
  queries: SlowQuery[];
  onOptimizeQuery: (id: string) => void;
  onOptimizeAll: () => void;
}

export const DbOptimizationTab: React.FC<DbOptimizationTabProps> = ({
  queries,
  onOptimizeQuery,
  onOptimizeAll,
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [explainModalQuery, setExplainModalQuery] = useState<SlowQuery | null>(null);
  const [optimizerNotice, setOptimizerNotice] = useState<string | null>(null);

  const handleRunAllOptimization = () => {
    setIsOptimizing(true);
    setOptimizerNotice(null);
    setTimeout(() => {
      onOptimizeAll();
      setIsOptimizing(false);
      setOptimizerNotice('Đã tối ưu hóa thành công toàn bộ chỉ mục (Covering B-Tree Indexes) & làm ấm bộ nhớ đệm (Warm Cache). Tốc độ phản hồi CSDL tăng 97.4%!');
      setTimeout(() => setOptimizerNotice(null), 6000);
    }, 1200);
  };

  const optimizedCount = queries.filter(q => q.optimized).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Database className="w-4 h-4" />
            <span>Tối Ưu Hóa Truy Vấn Cơ Sở Dữ Liệu (Query Optimizer)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">
            Tăng Tốc Độ Phản Hồi Toàn Bộ Ứng Dụng &amp; Giảm Trễ
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Tự động phát hiện các truy vấn chạy chậm (Slow Queries), đề xuất chỉ mục tối ưu (Index Recommendation) và cấu hình lại bộ đệm Shared Buffers nhằm nâng cao trải nghiệm người dùng cuối.
          </p>
        </div>

        <button
          id="run-optimize-all-queries-btn"
          onClick={handleRunAllOptimization}
          disabled={isOptimizing}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-950/50 disabled:opacity-50"
        >
          <Zap className={`w-4 h-4 ${isOptimizing ? 'animate-bounce' : ''}`} />
          <span>{isOptimizing ? 'Đang Tối Ưu Hóa...' : 'Tối Ưu Toàn Diện CSDL (EXPLAIN)'}</span>
        </button>
      </div>

      {optimizerNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fade-in shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span>{optimizerNotice}</span>
        </div>
      )}

      {/* Database Performance KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cache Hit Ratio (Shared Buffers)</span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            99.4%
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Truy vấn đọc thẳng từ RAM, không trễ Disk</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>Queries Per Second (QPS)</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            1,842 <span className="text-xs font-normal text-slate-400">qps</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Lưu lượng xử lý đồng thời cao</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Database className="w-3.5 h-3.5 text-purple-400" />
            <span>Connection Pool (PgBouncer)</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            14 <span className="text-xs font-normal text-slate-400">/ 100 active</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Hàng đợi kết nối 0ms (Tối ưu)</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>Chỉ Mục Đã Tối Ưu Hóa</span>
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-300">
            {optimizedCount} / {queries.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Covering Indexes đã kích hoạt</div>
        </div>
      </div>

      {/* Slow Queries & Optimization Table */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-cyan-400" />
              <span>Danh Sách Truy Vấn Cần Tối Ưu (Slow Query Log &amp; Plan)</span>
            </h3>
            <p className="text-xs text-slate-400">Phân tích thực thi truy vấn theo pg_stat_statements</p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {queries.length} câu truy vấn giám sát
          </span>
        </div>

        <div className="space-y-4">
          {queries.map((q) => (
            <div
              key={q.id}
              className={`p-4 rounded-xl border transition-all ${
                q.optimized
                  ? 'bg-slate-950/60 border-emerald-500/30'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                    TABLE: {q.table}
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    q.impact === 'high' ? 'bg-rose-500/20 text-rose-400' : q.impact === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {q.impact} IMPACT
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({q.callsPerMinute} calls/min)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-xs font-mono">
                    <span className="text-slate-500">Latency: </span>
                    {q.optimized ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1 inline-flex">
                        <span className="line-through text-slate-500 text-[11px]">{q.avgTimeMs}ms</span>
                        <ArrowRight className="w-3 h-3 text-emerald-400" />
                        {q.optimizedTimeMs}ms (Giảm 97%)
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold">{q.avgTimeMs}ms (Chậm)</span>
                    )}
                  </div>

                  {q.optimized ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1 border border-emerald-500/20">
                      <Check className="w-3.5 h-3.5" />
                      ĐÃ TỐI ƯU
                    </span>
                  ) : (
                    <button
                      onClick={() => onOptimizeQuery(q.id)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Đánh Chỉ Mục Ngay</span>
                    </button>
                  )}
                </div>
              </div>

              {/* SQL Text */}
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px] font-mono text-cyan-200 overflow-x-auto whitespace-pre-wrap">
                {q.query}
              </pre>

              {/* Recommendation */}
              {q.missingIndex && (
                <div className="mt-2 text-[11px] font-mono text-slate-400 flex items-center gap-2">
                  <span className="text-indigo-400 font-semibold">Chỉ mục khuyến nghị:</span>
                  <code className="text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {q.missingIndex}
                  </code>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
