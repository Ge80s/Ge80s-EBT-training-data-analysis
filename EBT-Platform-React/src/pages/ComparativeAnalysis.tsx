import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import { useData } from '../hooks/useData';
import { GitCompare, BarChart3, Target, AlertCircle } from 'lucide-react';

const COMPETENCIES = ['KNO', 'PRO', 'FPA', 'FPM', 'COM', 'LTW', 'SAW', 'WLM', 'PSD'];
const COMPETENCY_LABELS: Record<string, string> = {
  KNO: '知识运用', PRO: '程序执行', FPA: '自动航径', FPM: '手动航径',
  COM: '沟通', LTW: '领导力', SAW: '情景意识', WLM: '工作负荷', PSD: '问题解决',
};

type Mode = 'pairwise' | 'multi';
type GroupBy = 'rank' | 'aircraft' | 'batch' | 'batch_rank' | 'result';

export default function ComparativeAnalysis() {
  const { pilots: allPilots } = useData();
  const [groupBy, setGroupBy] = useState<GroupBy>('rank');
  const [mode, setMode] = useState<Mode>('pairwise');
  const [selectedA, setSelectedA] = useState<string[]>([]);
  const [selectedB, setSelectedB] = useState<string[]>([]);
  const [chartType, setChartType] = useState<'bar' | 'radar'>('bar');

  const groupByField: Record<Exclude<GroupBy, 'batch_rank'>, keyof typeof allPilots[0]> = {
    rank: 'technical_rank',
    aircraft: 'aircraft_type',
    batch: 'source_label',
    result: 'overall_result',
  };

  // 可用的分组选项（动态）
  const options = useMemo(() => {
    const getUnique = (key: 'technical_rank' | 'aircraft_type' | 'source_label' | 'overall_result') =>
      Array.from(new Set(allPilots.map(p => p[key]).filter(Boolean))).sort();
    switch (groupBy) {
      case 'rank': return getUnique('technical_rank');
      case 'aircraft': return getUnique('aircraft_type');
      case 'batch': return getUnique('source_label');
      case 'batch_rank':
        return Array.from(new Set(
          allPilots
            .filter(p => p.source_label && p.technical_rank)
            .map(p => `[${p.source_label}] ${p.technical_rank}`)
        )).sort();
      case 'result': return getUnique('overall_result');
      default: return [];
    }
  }, [allPilots, groupBy]);

  // 切换对比维度时，重置默认选择
  useEffect(() => {
    const initialA = options.length ? [options[0]] : [];
    const initialB = options.length > 1 ? [options[1]] : (options.length ? [options[0]] : []);
    const shouldUpdateA = initialA.length !== selectedA.length || initialA[0] !== selectedA[0];
    const shouldUpdateB = initialB.length !== selectedB.length || initialB[0] !== selectedB[0];

    if (shouldUpdateA) {
      setSelectedA(initialA);
    }
    if (shouldUpdateB) {
      setSelectedB(initialB);
    }
  }, [groupBy, options, selectedA, selectedB]);

  const matchesSelectedGroup = useCallback((pilot: typeof allPilots[number], selected: string[]) => {
    if (groupBy === 'batch_rank') {
      return selected.includes(`[${pilot.source_label}] ${pilot.technical_rank}`);
    }
    return selected.includes(String(pilot[groupByField[groupBy]]));
  }, [groupBy]);

  const pilotsA = useMemo(() => allPilots.filter(p => matchesSelectedGroup(p, selectedA)), [allPilots, selectedA, matchesSelectedGroup]);
  const pilotsB = useMemo(() => allPilots.filter(p => matchesSelectedGroup(p, selectedB)), [allPilots, selectedB, matchesSelectedGroup]);

  const groupALabel = mode === 'pairwise'
    ? (selectedA[0] || '群体 A')
    : `A组合（${selectedA.length} 项）`;
  const groupBLabel = mode === 'pairwise'
    ? (selectedB[0] || '群体 B')
    : `B组合（${selectedB.length} 项）`;

  const stats = useMemo(() => {
    const compute = (pilots: typeof allPilots) => {
      const compAvgs = COMPETENCIES.map(comp => {
        const vals = pilots.map(p => p.scores?.[comp] || 0).filter(v => v > 0);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      });
      const overall = compAvgs.filter(v => v > 0);
      return {
        count: pilots.length,
        overallAvg: overall.length ? overall.reduce((a, b) => a + b, 0) / overall.length : 0,
        compAvgs,
      };
    };
    return { a: compute(pilotsA), b: compute(pilotsB) };
  }, [pilotsA, pilotsB]);

  const chartData = useMemo(() => {
    return COMPETENCIES.map((comp, i) => ({
      subject: comp,
      label: COMPETENCY_LABELS[comp],
      [groupALabel]: parseFloat(stats.a.compAvgs[i].toFixed(2)),
      [groupBLabel]: parseFloat(stats.b.compAvgs[i].toFixed(2)),
      diff: parseFloat((stats.a.compAvgs[i] - stats.b.compAvgs[i]).toFixed(2)),
    }));
  }, [stats, groupALabel, groupBLabel]);

  // 显著差异项（差距 >= 0.3）
  const significantDiffs = useMemo(() => {
    return chartData
      .filter(d => Math.abs(d.diff) >= 0.3)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [chartData]);

  const groupByLabel: Record<GroupBy, string> = {
    rank: '技术等级',
    aircraft: '机型',
    batch: '批次',
    batch_rank: '跨批次层级',
    result: '总体结果',
  };

  const toggleOption = (
    selected: string[],
    setter: (v: string[]) => void,
    option: string
  ) => {
    if (selected.includes(option)) {
      setter(selected.filter(o => o !== option));
    } else {
      setter([...selected, option]);
    }
  };

  const renderSelectorPair = () => {
    if (mode === 'pairwise') {
      return (
        <>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-slate-500">群体 A:</label>
            <select
              value={selectedA[0] || ''}
              onChange={(e) => setSelectedA([e.target.value])}
              className="text-sm border border-slate-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px]"
            >
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-bold">VS</span>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-slate-500">群体 B:</label>
            <select
              value={selectedB[0] || ''}
              onChange={(e) => setSelectedB([e.target.value])}
              className="text-sm border border-slate-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px]"
            >
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </>
      );
    }

    return (
      <div className="flex flex-wrap gap-4 flex-1">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs font-medium text-slate-500 mb-1.5">群体 A 组合</div>
          <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-md p-2 bg-slate-50">
            {options.map(o => (
              <label key={`A-${o}`} className="flex items-center space-x-2 py-1 text-sm hover:bg-slate-100 rounded px-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedA.includes(o)}
                  onChange={() => toggleOption(selectedA, setSelectedA, o)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-700">{o}</span>
              </label>
            ))}
          </div>
          <div className="text-xs text-slate-400 mt-1 truncate" title={selectedA.join(', ')}>
            已选：{selectedA.length ? selectedA.join(', ') : '无'}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <span className="text-slate-400 font-bold">VS</span>
        </div>

        <div className="flex-1 min-w-[200px]">
          <div className="text-xs font-medium text-slate-500 mb-1.5">群体 B 组合</div>
          <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-md p-2 bg-slate-50">
            {options.map(o => (
              <label key={`B-${o}`} className="flex items-center space-x-2 py-1 text-sm hover:bg-slate-100 rounded px-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedB.includes(o)}
                  onChange={() => toggleOption(selectedB, setSelectedB, o)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-slate-700">{o}</span>
              </label>
            ))}
          </div>
          <div className="text-xs text-slate-400 mt-1 truncate" title={selectedB.join(', ')}>
            已选：{selectedB.length ? selectedB.join(', ') : '无'}
          </div>
        </div>
      </div>
    );
  };

  const allOptionsEmpty = options.length === 0;
  const canCompare = pilotsA.length > 0 && pilotsB.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800">群体对标分析</h1>
        <div className="text-sm text-slate-500">{allPilots.length} 条评估记录</div>
      </div>

      {/* 控制面板 */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-slate-500">对比维度:</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="text-sm border border-slate-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="rank">技术等级</option>
              <option value="aircraft">机型</option>
              <option value="batch">批次</option>
              <option value="batch_rank">跨批次层级</option>
              <option value="result">总体结果</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-slate-500">对比模式:</label>
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setMode('pairwise')}
                className={`flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'pairwise' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                两两对比
              </button>
              <button
                onClick={() => setMode('multi')}
                className={`flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'multi' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                多组组合对比
              </button>
            </div>
          </div>

          {renderSelectorPair()}

          <div className="flex items-center space-x-2 ml-auto">
            <label className="text-sm font-medium text-slate-500">图表类型:</label>
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setChartType('bar')}
                className={`flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${chartType === 'bar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <BarChart3 className="w-4 h-4 mr-1" /> 条形图
              </button>
              <button
                onClick={() => setChartType('radar')}
                className={`flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${chartType === 'radar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Target className="w-4 h-4 mr-1" /> 雷达图
              </button>
            </div>
          </div>
        </div>

        {allOptionsEmpty && (
          <div className="mt-4 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            当前维度下无可用分组选项，请先导入数据。
          </div>
        )}
        {!canCompare && !allOptionsEmpty && (
          <div className="mt-4 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            请确保群体 A 和群体 B 都至少选中一个分组。
          </div>
        )}
      </div>

      {/* 统计摘要卡 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500 mb-1">{groupALabel}</p>
          <h3 className="text-2xl font-bold text-blue-600">{stats.a.count}</h3>
          <p className="text-xs text-slate-400 mt-1">综合均分 {stats.a.overallAvg.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500 mb-1">{groupBLabel}</p>
          <h3 className="text-2xl font-bold text-emerald-600">{stats.b.count}</h3>
          <p className="text-xs text-slate-400 mt-1">综合均分 {stats.b.overallAvg.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500 mb-1">综合均分差值</p>
          <h3 className={`text-2xl font-bold ${stats.a.overallAvg - stats.b.overallAvg > 0 ? 'text-blue-600' : stats.a.overallAvg - stats.b.overallAvg < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
            {(stats.a.overallAvg - stats.b.overallAvg) > 0 ? '+' : ''}{(stats.a.overallAvg - stats.b.overallAvg).toFixed(2)}
          </h3>
          <p className="text-xs text-slate-400 mt-1">A - B 整体平均分差异</p>
        </div>
      </div>

      {/* 图表 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">
          {groupByLabel[groupBy]}对比：{groupALabel} vs {groupBLabel}
        </h3>
        <p className="text-xs text-slate-400 mb-4">按 9 维胜任力平均评分对比</p>
        <div className="h-96 w-full">
          {chartData.length > 0 && canCompare ? (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="subject" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} domain={[0, 5]} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey={groupALabel} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey={groupBLabel} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              ) : (
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Radar name={groupALabel} dataKey={groupALabel} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.35} />
                  <Radar name={groupBLabel} dataKey={groupBLabel} stroke="#10b981" fill="#10b981" fillOpacity={0.35} />
                  <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : v)} />
                  <Legend />
                </RadarChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              请选择两个有效的对比群体
            </div>
          )}
        </div>
      </div>

      {/* 显著差异提示 */}
      {significantDiffs.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center mb-3 text-amber-600 font-semibold">
            <GitCompare className="w-5 h-5 mr-2" />
            显著差异维度（差距 ≥ 0.3）
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {significantDiffs.map(d => (
              <div key={d.subject} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-700">{d.label} ({d.subject})</p>
                  <p className="text-xs text-slate-400">
                    A: {(d as any)[groupALabel]}  B: {(d as any)[groupBLabel]}
                  </p>
                </div>
                <span className={`text-sm font-bold ${d.diff > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                  {d.diff > 0 ? '+' : ''}{d.diff.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 详细对比表 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">详细对比数据</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-4 py-2 text-left font-medium">胜任力</th>
                <th className="px-4 py-2 text-center font-medium">{groupALabel}</th>
                <th className="px-4 py-2 text-center font-medium">{groupBLabel}</th>
                <th className="px-4 py-2 text-center font-medium">差值 (A - B)</th>
                <th className="px-4 py-2 text-center font-medium">差异程度</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map(d => {
                const isSignificant = Math.abs(d.diff) >= 0.3;
                return (
                  <tr key={d.subject} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700 font-medium">{d.label} ({d.subject})</td>
                    <td className="px-4 py-2 text-center text-slate-700">{((d as any)[groupALabel] as number).toFixed(2)}</td>
                    <td className="px-4 py-2 text-center text-slate-700">{((d as any)[groupBLabel] as number).toFixed(2)}</td>
                    <td className={`px-4 py-2 text-center font-medium ${d.diff > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                      {d.diff > 0 ? '+' : ''}{d.diff.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isSignificant ? (
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">显著差异</span>
                      ) : (
                        <span className="text-xs text-slate-400">差异较小</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
