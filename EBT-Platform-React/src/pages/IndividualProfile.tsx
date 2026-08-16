import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import {
  Search, User, CheckCircle, XCircle, Loader2,
  TrendingUp, TrendingDown, Award, AlertTriangle,
  Calendar, Plane, UserCheck, ChevronDown, ChevronRight,
  BarChart3,
} from 'lucide-react';
import { useData } from '../hooks/useData';
import { apiService } from '../services/api_service';

const COMPETENCY_LABELS: Record<string, string> = {
  KNO: 'KNO·知识运用', PRO: 'PRO·程序执行', FPA: 'FPA·自动航径',
  FPM: 'FPM·手动航径', COM: 'COM·沟通', LTW: 'LTW·领导力',
  SAW: 'SAW·情景意识', WLM: 'WLM·工作负荷', PSD: 'PSD·问题解决',
};

const COMPETENCY_CODES = ['KNO', 'PRO', 'FPA', 'FPM', 'COM', 'LTW', 'SAW', 'WLM', 'PSD'];

const COMPETENCY_COLORS: Record<string, string> = {
  KNO: '#3b82f6', PRO: '#10b981', FPA: '#f59e0b', FPM: '#ef4444',
  COM: '#8b5cf6', LTW: '#ec4899', SAW: '#14b8a6', WLM: '#f97316', PSD: '#6366f1',
};

interface HistoryRecord {
  id: number;
  check_date: string;
  aircraft_type: string;
  technical_rank: string;
  source_label?: string;
  training_type?: string;
  examiner?: string;
  scores: Record<string, number>;
  ob_items?: Array<{ label: string; mark: string }>;
  comments?: string;
  overall_result?: string;
  final_conclusion?: string;
}

export default function IndividualProfile() {
  const { pilots, summary, filters } = useData();
  const [searchParams] = useSearchParams();
  const urlPilotName = searchParams.get('name');
  const allPilots = pilots;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPilotName, setSelectedPilotName] = useState(urlPilotName || '');
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedRecords, setExpandedRecords] = useState<Set<number>>(new Set());

  // 飞行员列表（按姓名聚合，统计评估次数）
  const pilotOptions = useMemo(() => {
    const map = new Map<string, { name: string; count: number; latestDate: string; aircraft: string; rank: string }>();
    allPilots.forEach(p => {
      if (!map.has(p.name)) {
        map.set(p.name, { name: p.name, count: 0, latestDate: '', aircraft: p.aircraft_type, rank: p.technical_rank });
      }
      const entry = map.get(p.name)!;
      entry.count += 1;
      if (p.check_date && p.check_date > entry.latestDate) {
        entry.latestDate = p.check_date;
        entry.aircraft = p.aircraft_type;
        entry.rank = p.technical_rank;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allPilots]);

  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    return pilotOptions.filter(p => p.name.includes(searchTerm)).slice(0, 8);
  }, [pilotOptions, searchTerm]);

  // 当 URL 带有 name 参数或无选中飞行员时自动选中对应飞行员
  useEffect(() => {
    if (urlPilotName) {
      setSelectedPilotName(urlPilotName);
    } else if (!selectedPilotName && pilotOptions.length > 0) {
      setSelectedPilotName(pilotOptions[0].name);
    }
  }, [urlPilotName, pilotOptions]);

  // 加载选中飞行员的历史
  useEffect(() => {
    if (!selectedPilotName) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    apiService.getPilotHistory(selectedPilotName, filters)
      .then(data => {
        if (!cancelled) setHistory(data.records || []);
      })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPilotName, filters]);

  // 个人平均分
  const personalAvg = useMemo(() => {
    const result: Record<string, number> = {};
    if (history.length === 0) return result;
    COMPETENCY_CODES.forEach(c => {
      const vals = history.map(r => r.scores?.[c] || 0).filter(v => v > 0);
      result[c] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    return result;
  }, [history]);

  // 机队平均分（来自 summary）
  const fleetAvg = useMemo(() => {
    return (summary?.average_scores as Record<string, number>) || {};
  }, [summary]);

  // 雷达数据：个人 vs 机队
  const radarData = useMemo(() => {
    return COMPETENCY_CODES.map(code => ({
      subject: code,
      个人: parseFloat((personalAvg[code] || 0).toFixed(2)),
      机队: parseFloat((fleetAvg[code] || 0).toFixed(2)),
      fullMark: 5,
    }));
  }, [personalAvg, fleetAvg]);

  // 综合平均分趋势
  const trendData = useMemo(() => {
    return history.map((r, idx) => {
      const vals = COMPETENCY_CODES.map(c => r.scores?.[c] || 0).filter(v => v > 0);
      const composite = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return {
        idx,
        session: `${r.check_date} #${idx + 1}`,
        date: r.check_date,
        composite: parseFloat(composite.toFixed(2)),
        source: r.source_label || '',
        ...Object.fromEntries(COMPETENCY_CODES.map(c => [c, r.scores?.[c] || 0])),
      };
    });
  }, [history]);

  // 强弱项分析
  const strengthWeakness = useMemo(() => {
    if (Object.keys(personalAvg).length === 0) return { strong: [], weak: [] };
    const arr = COMPETENCY_CODES.map(c => ({
      code: c,
      name: COMPETENCY_LABELS[c],
      personal: personalAvg[c] || 0,
      fleet: fleetAvg[c] || 0,
      diff: (personalAvg[c] || 0) - (fleetAvg[c] || 0),
    }));
    const valid = arr.filter(a => a.personal > 0);
    const strong = [...valid].sort((a, b) => b.diff - a.diff).slice(0, 3);
    const weak = [...valid].sort((a, b) => a.diff - b.diff).slice(0, 3);
    return { strong, weak };
  }, [personalAvg, fleetAvg]);

  // OB 汇总
  const obStats = useMemo(() => {
    let positive = 0, negative = 0;
    const all: Array<{ date: string; source: string; item: string; mark: string }> = [];
    history.forEach(r => {
      (r.ob_items || []).forEach(ob => {
        if (ob.mark === '赞') positive += 1;
        else if (ob.mark === '踩') negative += 1;
        all.push({ date: r.check_date, source: r.source_label || '', item: ob.label, mark: ob.mark });
      });
    });
    return { positive, negative, all: all.sort((a, b) => b.date.localeCompare(a.date)) };
  }, [history]);

  // 整体均分 & 趋势
  const overallStats = useMemo(() => {
    if (trendData.length === 0) return { current: 0, first: 0, delta: 0, direction: 'stable' as const };
    const first = trendData[0].composite;
    const current = trendData[trendData.length - 1].composite;
    const delta = current - first;
    return {
      current,
      first,
      delta,
      direction: delta > 0.1 ? 'up' : delta < -0.1 ? 'down' : 'stable',
    };
  }, [trendData]);

  const selectedMeta = useMemo(() =>
    pilotOptions.find(p => p.name === selectedPilotName),
  [pilotOptions, selectedPilotName]);

  const latestRank = useMemo(() => {
    if (history.length > 0) {
      const sorted = [...history].sort((a, b) => (b.check_date || '').localeCompare(a.check_date || ''));
      return sorted[0].technical_rank || selectedMeta?.rank || '';
    }
    return selectedMeta?.rank || '';
  }, [history, selectedMeta]);

  const toggleRecord = (id: number) => {
    setExpandedRecords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* 标题 + 搜索 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800">飞行员画像</h1>
        <div className="text-sm text-slate-500">共 {pilotOptions.length} 名飞行员 / {allPilots.length} 条评估记录</div>
      </div>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 relative z-20">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-500 focus:outline-none focus:placeholder-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="搜索飞行员姓名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {searchTerm && searchResults.length > 0 && (
            <div className="absolute mt-1 w-full bg-white shadow-lg rounded-md border border-slate-200 py-1 z-50 max-h-80 overflow-auto">
              {searchResults.map(p => (
                <button
                  key={p.name}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                  onClick={() => { setSelectedPilotName(p.name); setSearchTerm(''); }}
                >
                  <span className="flex items-center">
                    <User className="w-4 h-4 mr-2 text-slate-400" />
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-slate-400 text-xs">{p.aircraft} - {p.rank}</span>
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{p.count} 次</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedPilotName && (
          <div className="mt-3 flex flex-wrap gap-2">
            {pilotOptions.slice(0, 12).map(p => (
              <button
                key={p.name}
                onClick={() => setSelectedPilotName(p.name)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                  p.name === selectedPilotName
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="font-medium">{p.name}</span>
                {p.rank && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                    p.name === selectedPilotName ? 'bg-blue-700 text-blue-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                  }`}>
                    {p.rank}
                  </span>
                )}
                {p.count > 1 && <span className="opacity-70">×{p.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 未选择时的引导 */}
      {!selectedPilotName && (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-100 text-center text-slate-400">
          <User className="w-16 h-16 mx-auto mb-4 text-slate-200" />
          <p>请在上方搜索并选择一位飞行员以查看详细画像</p>
          {pilots.length === 0 && (
            <p className="mt-2 text-sm text-amber-500">⚠ 当前无数据，请先在数据管理页面上传评估文件</p>
          )}
        </div>
      )}

      {/* 已选择但无历史记录 */}
      {selectedPilotName && historyLoading && (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
          <p>正在加载历史评估数据…</p>
        </div>
      )}

      {/* 主体 */}
      {selectedPilotName && !historyLoading && history.length > 0 && (
        <>
          {/* 顶部信息卡 + 综合趋势 */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 lg:col-span-1">
              <div className="flex items-center mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-2xl mr-3 shrink-0 shadow-sm">
                  {selectedPilotName[0]}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-slate-800">{selectedPilotName}</h2>
                    {latestRank && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                        {latestRank}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    机型: {selectedMeta?.aircraft || '—'} · 最新技术等级: {latestRank || '—'}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-center text-slate-600">
                  <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                  <span>最近评估：{selectedMeta?.latestDate || '—'}</span>
                </div>
                <div className="flex items-center text-slate-600">
                  <BarChart3 className="w-4 h-4 mr-2 text-slate-400" />
                  <span>累计评估：{history.length} 次</span>
                </div>
                <div className="flex items-center text-slate-600">
                  <Plane className="w-4 h-4 mr-2 text-slate-400" />
                  <span>来源：{Array.from(new Set(history.map(r => r.source_label).filter(Boolean))).join('、') || '—'}</span>
                </div>
                <div className="flex items-center text-slate-600">
                  <UserCheck className="w-4 h-4 mr-2 text-slate-400" />
                  <span>教员：{Array.from(new Set(history.map(r => r.examiner).filter(Boolean))).join('、') || '—'}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">综合均分</p>
                    <p className="text-3xl font-bold text-blue-600">{overallStats.current.toFixed(2)}</p>
                  </div>
                  <div className={`flex items-center text-sm font-medium ${
                    overallStats.direction === 'up' ? 'text-emerald-600' :
                    overallStats.direction === 'down' ? 'text-red-500' : 'text-slate-500'
                  }`}>
                    {overallStats.direction === 'up' && <TrendingUp className="w-4 h-4 mr-1" />}
                    {overallStats.direction === 'down' && <TrendingDown className="w-4 h-4 mr-1" />}
                    {overallStats.delta >= 0 ? '+' : ''}{overallStats.delta.toFixed(2)}
                  </div>
                </div>
                {history.length > 1 && (
                  <p className="text-xs text-slate-400 mt-1">
                    首 → 末：{overallStats.first.toFixed(2)} → {overallStats.current.toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            {/* 雷达图：个人 vs 机队 */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 lg:col-span-3">
              <h3 className="text-lg font-semibold text-slate-800 mb-1">能力模型对比</h3>
              <p className="text-xs text-slate-400 mb-3">个人均值 vs 全员均值（来自 {allPilots.length} 条记录的机队基准）</p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Radar name="个人" dataKey="个人" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} strokeWidth={2} />
                    <Radar name="机队" dataKey="机队" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="4 3" />
                    <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : v)} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 趋势图 */}
          {history.length > 1 && (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800 mb-1">能力发展趋势</h3>
              <p className="text-xs text-slate-400 mb-3">按时间顺序展示 9 维胜任力评分 + 综合平均分（黑色虚线）</p>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="session" tick={{ fill: '#64748b', fontSize: 10 }} angle={-15} textAnchor="end" height={60} />
                    <YAxis domain={[0, 5.5]} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {COMPETENCY_CODES.map(c => (
                      <Line
                        key={c}
                        type="monotone"
                        dataKey={c}
                        stroke={COMPETENCY_COLORS[c]}
                        strokeWidth={1.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                        opacity={0.7}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="composite"
                      stroke="#0f172a"
                      strokeWidth={3}
                      strokeDasharray="6 4"
                      dot={{ r: 6, fill: '#0f172a' }}
                      name="⭐ 综合平均"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 强弱项 + OB 汇总 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800 mb-3">强弱项分析（vs 机队均值）</h3>
              {strengthWeakness.strong.length === 0 && strengthWeakness.weak.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">数据不足</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center text-sm font-medium text-emerald-700 mb-2">
                      <Award className="w-4 h-4 mr-1" /> 强项 TOP {strengthWeakness.strong.length}
                    </div>
                    {strengthWeakness.strong.map(s => (
                      <div key={s.code} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-slate-700">{s.name}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-slate-500">{s.personal.toFixed(2)}</span>
                          <span className="text-emerald-600 font-medium">+{s.diff.toFixed(2)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex items-center text-sm font-medium text-red-600 mb-2">
                      <AlertTriangle className="w-4 h-4 mr-1" /> 弱项 TOP {strengthWeakness.weak.length}
                    </div>
                    {strengthWeakness.weak.map(s => (
                      <div key={s.code} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-slate-700">{s.name}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-slate-500">{s.personal.toFixed(2)}</span>
                          <span className="text-red-500 font-medium">{s.diff.toFixed(2)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800 mb-3">OB 行为观察汇总</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                  <div className="flex items-center text-emerald-600 text-sm">
                    <CheckCircle className="w-4 h-4 mr-1" /> 累计赞
                  </div>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{obStats.positive}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <div className="flex items-center text-red-500 text-sm">
                    <XCircle className="w-4 h-4 mr-1" /> 累计踩
                  </div>
                  <p className="text-2xl font-bold text-red-600 mt-1">{obStats.negative}</p>
                </div>
              </div>
              {obStats.all.length > 0 ? (
                <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg">
                  {obStats.all.map((ob, i) => (
                    <div key={i} className="flex items-start px-3 py-1.5 text-xs border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      {ob.mark === '赞'
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mr-2 mt-0.5 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500 mr-2 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-700 truncate">{ob.item}</p>
                        <p className="text-slate-400 text-[10px]">{ob.date} · {ob.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">暂无 OB 记录</p>
              )}
            </div>
          </div>

          {/* 历史评语全档（可展开） */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">历史评语全档</h3>
            <div className="space-y-2">
              {[...history].reverse().map(r => {
                const expanded = expandedRecords.has(r.id);
                return (
                  <div key={r.id} className="border border-slate-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleRecord(r.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                    >
                      <div className="flex items-center gap-3 text-sm">
                        {expanded
                          ? <ChevronDown className="w-4 h-4 text-slate-400" />
                          : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-slate-800">{r.check_date || '未知日期'}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-600">{r.source_label || '—'}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-600">👨‍✈️ {r.examiner || '—'}</span>
                        {r.overall_result && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            r.overall_result.includes('合格') || r.overall_result.includes('通过')
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {r.overall_result}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        综合均分 {(Object.values(r.scores || {}).reduce((a, b) => a + b, 0) / 9).toFixed(2)}
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-3 bg-slate-50">
                        {r.comments ? (
                          <p className="text-sm text-slate-700 italic leading-relaxed whitespace-pre-wrap">"{r.comments}"</p>
                        ) : (
                          <p className="text-sm text-slate-400">（无文字评语）</p>
                        )}
                        {r.final_conclusion && (
                          <p className="text-xs text-slate-500 mt-2">
                            <span className="font-medium">最终结论：</span>{r.final_conclusion}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 详细评分表 */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">详细评分记录</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="px-3 py-2 text-left font-medium">日期</th>
                    <th className="px-3 py-2 text-left font-medium">来源</th>
                    <th className="px-3 py-2 text-left font-medium">机型</th>
                    <th className="px-3 py-2 text-left font-medium">教员</th>
                    {COMPETENCY_CODES.map(c => (
                      <th key={c} className="px-2 py-2 text-center font-medium" style={{ color: COMPETENCY_COLORS[c] }}>
                        {c}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-medium bg-slate-100">综合</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map(r => {
                    const vals = Object.values(r.scores || {});
                    const composite = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                    return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.check_date || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.source_label || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.aircraft_type || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.examiner || '—'}</td>
                        {COMPETENCY_CODES.map(c => {
                          const v = r.scores?.[c] || 0;
                          return (
                            <td key={c} className="px-2 py-2 text-center">
                              <span className={`font-medium ${
                                v >= 4.5 ? 'text-emerald-600' :
                                v >= 3.5 ? 'text-slate-700' :
                                v >= 3.0 ? 'text-amber-600' : 'text-red-500'
                              }`}>
                                {v.toFixed(1)}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center bg-slate-50 font-bold text-blue-600">
                          {composite.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 有姓名但查无数据 */}
      {selectedPilotName && !historyLoading && history.length === 0 && (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-100 text-center text-slate-400">
          <User className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p>未找到该飞行员的历史评估记录</p>
        </div>
      )}
    </div>
  );
}
