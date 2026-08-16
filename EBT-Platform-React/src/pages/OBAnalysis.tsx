import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { ThumbsUp, ThumbsDown, Eye, Search, Filter, ChevronDown, ChevronRight, MessageSquare, Check } from 'lucide-react';
import { useData } from '../hooks/useData';

const COMPETENCY_CODES = ['KNO', 'PRO', 'FPA', 'FPM', 'COM', 'LTW', 'SAW', 'WLM', 'PSD'];
const COMPETENCY_NAMES: Record<string, string> = {
  KNO: '知识运用', PRO: '程序执行', FPA: '自动航径', FPM: '手动航径',
  COM: '沟通', LTW: '领导力', SAW: '情景意识', WLM: '工作负荷', PSD: '问题解决',
};
interface OBRecord {
  id: number;
  pilot: string;
  date: string;
  examiner: string;
  source_label: string;
  competency: string;
  item: string;
  mark: '赞' | '踩';
  comments: string;
  technical_rank: string;
}

export default function OBAnalysis() {
  const { pilots, filterOptions } = useData();
  const [selectedCompetency, setSelectedCompetency] = useState<string>('all');
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOB, setSelectedOB] = useState<string | null>(null);
  const [expandedPilots, setExpandedPilots] = useState<Set<string>>(new Set());
  const [isRankOpen, setIsRankOpen] = useState(false);
  const rankRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rankRef.current && !rankRef.current.contains(event.target as Node)) {
        setIsRankOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleRank = (rank: string) => {
    setSelectedRanks(prev => (
      prev.includes(rank) ? prev.filter(item => item !== rank) : [...prev, rank]
    ));
  };

  const selectAllRanks = () => setSelectedRanks([...filterOptions.ranks]);
  const clearRanks = () => setSelectedRanks([]);
  const getRankSummaryText = () => {
    if (selectedRanks.length === 0) return '全部等级';
    if (filterOptions.ranks.length > 0 && selectedRanks.length === filterOptions.ranks.length) return '全部等级 (已全选)';
    if (selectedRanks.length === 1) return selectedRanks[0];
    return `已选 ${selectedRanks.length} 项 (${selectedRanks.join(', ')})`;
  };

  // 提取所有 OB 记录
  const obRecords = useMemo<OBRecord[]>(() => {
    const list: OBRecord[] = [];
    pilots.forEach(p => {
      (p.ob_items || []).forEach(ob => {
        if (!ob || !ob.label) return;
        const parts = ob.label.split(' - ');
        const competency = parts[0] || 'Unknown';
        const item = parts.slice(1).join(' - ') || ob.label;
        list.push({
          id: p.id || Math.random(),
          pilot: p.name,
          date: p.check_date || '',
          examiner: p.examiner || '',
          source_label: p.source_label || '',
          competency,
          item,
          mark: ob.mark as '赞' | '踩',
          comments: p.comments || '',
          technical_rank: p.technical_rank || '',
        });
      });
    });
    return list;
  }, [pilots]);

  // 按胜任力汇总赞/踩
  const competencyStats = useMemo(() => {
    const stats: Record<string, { positive: number; negative: number }> = {};
    COMPETENCY_CODES.forEach(c => stats[c] = { positive: 0, negative: 0 });

    obRecords.forEach(r => {
      if (!stats[r.competency]) stats[r.competency] = { positive: 0, negative: 0 };
      if (r.mark === '赞') stats[r.competency].positive += 1;
      else if (r.mark === '踩') stats[r.competency].negative += 1;
    });

    return COMPETENCY_CODES.map(code => ({
      code,
      name: COMPETENCY_NAMES[code],
      positive: stats[code].positive,
      negative: stats[code].negative,
      total: stats[code].positive + stats[code].negative,
    })).sort((a, b) => b.total - a.total);
  }, [obRecords]);

  // 全局筛选
  const filteredRecords = useMemo(() => {
    return obRecords.filter(r => {
      const compMatch = selectedCompetency === 'all' || r.competency === selectedCompetency;
      const rankMatch = selectedRanks.length === 0 || selectedRanks.includes(r.technical_rank);
      const searchLower = searchTerm.toLowerCase();
      const searchMatch = !searchTerm ||
        r.item.toLowerCase().includes(searchLower) ||
        r.pilot.includes(searchTerm) ||
        r.competency.toLowerCase().includes(searchLower);
      return compMatch && rankMatch && searchMatch;
    });
  }, [obRecords, selectedCompetency, selectedRanks, searchTerm]);

  // Top 10 赞/踩（基于筛选后）
  const topStats = useMemo(() => {
    const positiveCounts: Record<string, number> = {};
    const negativeCounts: Record<string, number> = {};

    filteredRecords.forEach(r => {
      const label = `${r.competency} - ${r.item}`;
      if (r.mark === '踩') negativeCounts[label] = (negativeCounts[label] || 0) + 1;
      else if (r.mark === '赞') positiveCounts[label] = (positiveCounts[label] || 0) + 1;
    });

    const getTop = (counts: Record<string, number>) => Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { positive: getTop(positiveCounts), negative: getTop(negativeCounts) };
  }, [filteredRecords]);

  // 选中 OB 项的关联评语
  const relatedComments = useMemo(() => {
    if (!selectedOB) return [];
    return filteredRecords
      .filter(r => `${r.competency} - ${r.item}` === selectedOB && r.comments)
      .map(r => ({ pilot: r.pilot, date: r.date, examiner: r.examiner, comments: r.comments, mark: r.mark }));
  }, [selectedOB, filteredRecords]);

  // 涉及人员列表
  const relatedPilots = useMemo(() => {
    const map = new Map<string, { name: string; count: number; dates: string[]; marks: Array<'赞' | '踩'> }>();
    filteredRecords.forEach(r => {
      if (!map.has(r.pilot)) map.set(r.pilot, { name: r.pilot, count: 0, dates: [], marks: [] });
      const entry = map.get(r.pilot)!;
      entry.count += 1;
      entry.dates.push(r.date);
      entry.marks.push(r.mark);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredRecords]);

  // 总览数字
  const totals = useMemo(() => {
    const pos = filteredRecords.filter(r => r.mark === '赞').length;
    const neg = filteredRecords.filter(r => r.mark === '踩').length;
    return { pos, neg, total: pos + neg };
  }, [filteredRecords]);

  const togglePilot = (name: string) => {
    setExpandedPilots(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800">观察项 (OB) 分析</h1>
        <div className="text-sm text-slate-500">共 {totals.total} 条 OB 记录 · 赞 {totals.pos} · 踩 {totals.neg}</div>
      </div>

      {/* 总览 KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">OB 总记录</p>
              <h3 className="text-2xl font-bold text-slate-800">{totals.total}</h3>
            </div>
            <div className="p-2 rounded-lg bg-blue-100"><Eye className="w-5 h-5 text-blue-600" /></div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">优秀表现（赞）</p>
              <h3 className="text-2xl font-bold text-emerald-600">{totals.pos}</h3>
            </div>
            <div className="p-2 rounded-lg bg-emerald-100"><ThumbsUp className="w-5 h-5 text-emerald-600" /></div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">待改进（踩）</p>
              <h3 className="text-2xl font-bold text-red-500">{totals.neg}</h3>
            </div>
            <div className="p-2 rounded-lg bg-red-100"><ThumbsDown className="w-5 h-5 text-red-500" /></div>
          </div>
        </div>
      </div>

      {/* 筛选器 */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <label className="text-sm font-medium text-slate-500">胜任力:</label>
          <select
            value={selectedCompetency}
            onChange={e => setSelectedCompetency(e.target.value)}
            className="text-sm border border-slate-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部</option>
            {COMPETENCY_CODES.map(c => <option key={c} value={c}>{c} - {COMPETENCY_NAMES[c]}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 relative" ref={rankRef}>
          <label className="text-sm font-medium text-slate-500">技术等级:</label>
          <button
            type="button"
            onClick={() => setIsRankOpen(!isRankOpen)}
            className="text-sm border border-slate-300 rounded-md py-1.5 px-3 min-w-[170px] text-left flex items-center justify-between gap-2 bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <span className="truncate">{getRankSummaryText()}</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isRankOpen ? 'rotate-180' : ''}`} />
          </button>

          {isRankOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg z-50">
              <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100 pb-2">
                <span className="text-xs font-semibold text-slate-500">技术等级（多选）</span>
                <div className="space-x-2 text-xs">
                  <button type="button" onClick={selectAllRanks} className="text-blue-600 hover:text-blue-800 font-medium">全选</button>
                  <span className="text-slate-300">|</span>
                  <button type="button" onClick={clearRanks} className="text-slate-500 hover:text-slate-700 font-medium">清空</button>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filterOptions.ranks.map(rank => {
                  const isSelected = selectedRanks.includes(rank);
                  return (
                    <label
                      key={rank}
                      className={`flex items-center justify-between px-2 py-1.5 text-sm rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRank(rank)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{rank}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="搜索 OB 项、飞行员姓名..."
            className="text-sm border border-slate-300 rounded-md py-1.5 px-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 按胜任力分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-1">按胜任力分布</h3>
          <p className="text-xs text-slate-400 mb-4">各胜任力下赞/踩的绝对数量</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={competencyStats} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="code" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="positive" name="赞" stackId="a" fill="#10b981" />
                <Bar dataKey="negative" name="踩" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-1">赞/踩占比</h3>
          <p className="text-xs text-slate-400 mb-4">全局 OB 评价倾向</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: '赞', value: totals.pos, fill: '#10b981' },
                    { name: '踩', value: totals.neg, fill: '#ef4444' },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  label={entry => `${entry.name}: ${entry.value}`}
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top 10 赞/踩 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center mb-6 text-emerald-600 font-semibold text-lg">
            <ThumbsUp className="w-5 h-5 mr-2" />
            Top 10 优秀表现观察项
          </div>
          <div className="h-80 w-full">
            {topStats.positive.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={topStats.positive} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={180} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" name="频次" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {topStats.positive.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill="#10b981" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col h-full items-center justify-center text-slate-400"><Eye className="w-12 h-12 mb-4 text-slate-200" /><p>暂无数据</p></div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center mb-6 text-red-500 font-semibold text-lg">
            <ThumbsDown className="w-5 h-5 mr-2" />
            Top 10 待改进观察项
          </div>
          <div className="h-80 w-full">
            {topStats.negative.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={topStats.negative} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={180} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" name="频次" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {topStats.negative.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill="#ef4444" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col h-full items-center justify-center text-slate-400"><Eye className="w-12 h-12 mb-4 text-slate-200" /><p>暂无数据</p></div>
            )}
          </div>
        </div>
      </div>

      {/* 选中 OB 关联评语 */}
      {selectedOB && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">“{selectedOB}” 关联评语</h3>
            <button onClick={() => setSelectedOB(null)} className="text-sm text-slate-400 hover:text-slate-600">关闭</button>
          </div>
          {relatedComments.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {relatedComments.map((c, i) => (
                <div key={i} className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <span className="font-medium text-slate-700">{c.pilot}</span>
                    <span>|</span>
                    <span>{c.date || '—'}</span>
                    <span>|</span>
                    <span>{c.examiner || '—'}</span>
                    {c.mark === '赞' ? (
                      <span className="text-emerald-600 bg-emerald-50 px-1.5 rounded">赞</span>
                    ) : (
                      <span className="text-red-500 bg-red-50 px-1.5 rounded">踩</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 italic">"{c.comments}"</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">该 OB 项暂无文字评语关联。</p>
          )}
        </div>
      )}

      {/* 涉及人员明细 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">涉及人员明细（按 OB 出现次数排序）</h3>
        {relatedPilots.length > 0 ? (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {relatedPilots.map(p => {
              const expanded = expandedPilots.has(p.name);
              const pos = p.marks.filter(m => m === '赞').length;
              const neg = p.marks.filter(m => m === '踩').length;
              return (
                <div key={p.name} className="border border-slate-100 rounded-lg overflow-hidden">
                  <button
                    onClick={() => togglePilot(p.name)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="text-xs text-slate-400">{p.dates.filter(Boolean).length} 次评估记录</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-emerald-600 flex items-center"><ThumbsUp className="w-3.5 h-3.5 mr-1" /> {pos}</span>
                      <span className="text-red-500 flex items-center"><ThumbsDown className="w-3.5 h-3.5 mr-1" /> {neg}</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-4 pb-3 bg-slate-50">
                      <div className="space-y-2 mt-1">
                        {filteredRecords
                          .filter(r => r.pilot === p.name)
                          .map((r, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              {r.mark === '赞' ? <ThumbsUp className="w-4 h-4 text-emerald-500 mt-0.5" /> : <ThumbsDown className="w-4 h-4 text-red-500 mt-0.5" />}
                              <div className="flex-1">
                                <p className="text-slate-700">
                                  <span className="font-medium">{r.competency} - {r.item}</span>
                                  <span className="text-slate-400 ml-2">{r.date} · {r.examiner}</span>
                                </p>
                                {r.comments && (
                                  <p className="text-xs text-slate-500 mt-0.5 italic">{r.comments}</p>
                                )}
                              </div>
                              <button
                                onClick={() => setSelectedOB(`${r.competency} - ${r.item}`)}
                                className="text-xs text-blue-600 hover:underline flex items-center"
                              >
                                <MessageSquare className="w-3 h-3 mr-0.5" /> 关联评语
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">暂无匹配人员。</p>
        )}
      </div>
    </div>
  );
}
