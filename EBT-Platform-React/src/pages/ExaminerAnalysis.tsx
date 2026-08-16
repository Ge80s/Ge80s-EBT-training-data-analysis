import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ZAxis,
  BarChart, Bar, Cell,
} from 'recharts';
import { Scale, Users, UserCheck, MessageSquare, Hash, Award } from 'lucide-react';
import { useData } from '../hooks/useData';
import { apiService } from '../services/api_service';

const COMPETENCY_CODES = ['KNO', 'PRO', 'FPA', 'FPM', 'COM', 'LTW', 'SAW', 'WLM', 'PSD'];
const COMPETENCY_LABELS: Record<string, string> = {
  KNO: '知识运用', PRO: '程序执行', FPA: '自动航径', FPM: '手动航径',
  COM: '沟通', LTW: '领导力', SAW: '情景意识', WLM: '工作负荷', PSD: '问题解决',
};
const COMPETENCY_COLORS: Record<string, string> = {
  KNO: '#3b82f6', PRO: '#10b981', FPA: '#f59e0b', FPM: '#ef4444',
  COM: '#8b5cf6', LTW: '#ec4899', SAW: '#14b8a6', WLM: '#f97316', PSD: '#6366f1',
};

interface ExaminerScatterPoint {
  name: string;
  avgScore: number;
  count: number;
  deviation: number;
  z: number;
}

interface HeatmapCell {
  x: string;
  y: string;
  value: number;
}

interface QualityRow {
  examiner: string;
  count: number;
  avg_length: number;
  avg_keywords: number;
}

export default function ExaminerAnalysis() {
  // 教员分析只跟随顶栏的批次筛选，不受机型和等级影响。
  const { allPilots, filters } = useData();
  const batchPilots = useMemo(
    () => filters.batch === 'all' ? allPilots : allPilots.filter(pilot => pilot.source_label === filters.batch),
    [allPilots, filters.batch]
  );
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([]);
  const [qualityData, setQualityData] = useState<QualityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedExaminer, setSelectedExaminer] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([apiService.getExaminerHeatmap(filters.batch), apiService.getExaminerQuality(filters.batch)])
      .then(([heatmapRes, qualityRes]) => {
        if (!cancelled) {
          setHeatmapData(heatmapRes.data || []);
          setQualityData(qualityRes.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeatmapData([]);
          setQualityData([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters.batch]);

  // 散点数据（按评估人数加权）
  const examinerData = useMemo<ExaminerScatterPoint[]>(() => {
    const examiners: Record<string, { totalScore: number; count: number; scores: number[] }> = {};

    batchPilots.forEach(p => {
      if (!p.examiner) return;
      const values = Object.values(p.scores || {});
      if (values.length === 0) return;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;

      if (!examiners[p.examiner]) {
        examiners[p.examiner] = { totalScore: 0, count: 0, scores: [] };
      }
      examiners[p.examiner].totalScore += avg;
      examiners[p.examiner].count += 1;
      examiners[p.examiner].scores.push(avg);
    });

    const allScores = batchPilots.flatMap(p => Object.values(p.scores || {})).filter(score => score > 0);
    const overall = allScores.length ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length : 0;
    return Object.entries(examiners).map(([name, data]) => ({
      name,
      avgScore: parseFloat((data.totalScore / data.count).toFixed(2)),
      count: data.count,
      deviation: parseFloat((data.totalScore / data.count - overall).toFixed(2)),
      z: data.count,
    })).sort((a, b) => b.count - a.count);
  }, [batchPilots]);

  const overallAvg = useMemo(() => {
    const scores = batchPilots.flatMap(p => Object.values(p.scores || {})).filter(score => score > 0);
    return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  }, [batchPilots]);

  // 热力图轴：教员 & 胜任力
  const heatmapExaminers = useMemo(() => {
    return Array.from(new Set(heatmapData.map(d => d.y))).sort();
  }, [heatmapData]);

  const heatmapValues = useMemo(() => heatmapData.map(d => d.value), [heatmapData]);
  const heatmapMin = useMemo(() => heatmapValues.length ? Math.min(...heatmapValues) : 0, [heatmapValues]);
  const heatmapMax = useMemo(() => heatmapValues.length ? Math.max(...heatmapValues) : 5, [heatmapValues]);

  const colorScale = (value: number) => {
    const t = heatmapMax === heatmapMin ? 0.5 : (value - heatmapMin) / (heatmapMax - heatmapMin);
    // 蓝 -> 黄 -> 红
    const r = Math.round(t > 0.5 ? 239 + (59 - 239) * (t - 0.5) * 2 : 59 + (239 - 59) * t * 2);
    const g = Math.round(t > 0.5 ? 68 + (130 - 68) * (t - 0.5) * 2 : 130 + (68 - 130) * t * 2);
    const b = Math.round(t > 0.5 ? 68 + (246 - 68) * (t - 0.5) * 2 : 246 + (68 - 246) * t * 2);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // KPI 统计
  const kpi = useMemo(() => {
    if (examinerData.length === 0) return { total: 0, avg: 0, strictest: '', loosest: '', mostActive: '' };
    const total = examinerData.reduce((a, b) => a + b.count, 0);
    const avg = total > 0 ? examinerData.reduce((a, b) => a + b.avgScore * b.count, 0) / total : 0;
    const sortedByScore = [...examinerData].sort((a, b) => a.avgScore - b.avgScore);
    const sortedByCount = [...examinerData].sort((a, b) => b.count - a.count);
    return {
      total,
      avg,
      strictest: sortedByScore[0]?.name || '',
      loosest: sortedByScore[sortedByScore.length - 1]?.name || '',
      mostActive: sortedByCount[0]?.name || '',
    };
  }, [examinerData]);

  // 选中教员详情
  const selectedDetail = useMemo(() => {
    if (!selectedExaminer) return null;
    const row = qualityData.find(q => q.examiner === selectedExaminer);
    const scatter = examinerData.find(e => e.name === selectedExaminer);
    const cells = heatmapData.filter(d => d.y === selectedExaminer);
    return { row, scatter, cells };
  }, [selectedExaminer, qualityData, examinerData, heatmapData]);

  // 评语质量柱状图：按平均字数排序
  const qualityChartData = useMemo(() => {
    return [...qualityData].sort((a, b) => b.avg_length - a.avg_length).slice(0, 15);
  }, [qualityData]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">教员给分宽严度分析</h1>
        <div className="text-sm text-slate-500">{loading ? '加载中…' : `已分析 ${examinerData.length} 位教员`}</div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: '参与评估教员数', value: examinerData.length.toString(), icon: UserCheck, color: 'text-blue-600', bg: 'bg-blue-100' },
          { title: '平均给分', value: kpi.avg.toFixed(2), icon: Scale, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { title: '最严格教员', value: kpi.strictest || '-', icon: Award, color: 'text-red-600', bg: 'bg-red-100' },
          { title: '最活跃教员', value: `${kpi.mostActive || '-'} (${examinerData.find(e => e.name === kpi.mostActive)?.count || 0}次)`, icon: Hash, color: 'text-indigo-600', bg: 'bg-indigo-100' },
        ].map((kpiItem, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{kpiItem.title}</p>
                <h3 className="text-xl font-bold text-slate-800 truncate">{kpiItem.value}</h3>
              </div>
              <div className={`p-2 rounded-lg ${kpiItem.bg}`}>
                <kpiItem.icon className={`w-5 h-5 ${kpiItem.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 散点图 + 教员详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-2">
          <div className="flex items-center mb-2 text-slate-800 font-semibold text-lg">
            <Scale className="w-5 h-5 mr-2 text-blue-500" />
            教员评分偏差分布
          </div>
          <p className="text-sm text-slate-500 mb-4">
            气泡大小代表该教员评估的人数。横轴为评估人数，纵轴为给出的平均分。
            红线为整体平均分（{overallAvg.toFixed(2)} 分）。
          </p>

          <div className="h-[400px] w-full">
            {examinerData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="count"
                    name="评估人数"
                    tick={{ fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    label={{ value: '评估人数 (人)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="avgScore"
                    name="平均给分"
                    domain={[2.5, 3.5]}
                    tick={{ fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    label={{ value: '平均给分', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
                  />
                  <ZAxis type="number" dataKey="z" range={[100, 1000]} name="评估人数" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: any) => {
                      if (name === 'avgScore') return [typeof value === 'number' ? value.toFixed(2) : value, '平均给分'];
                      if (name === 'count') return [value, '评估人数'];
                      return [value, name];
                    }}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as ExaminerScatterPoint;
                      return p?.name || '';
                    }}
                  />

                  {overallAvg > 0 && (
                    <ReferenceLine y={overallAvg} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'top', value: '整体平均', fill: '#ef4444', fontSize: 12 }} />
                  )}

                  <Scatter
                    name="教员"
                    data={examinerData}
                    fill="#3b82f6"
                    fillOpacity={0.7}
                    onClick={(data) => {
                      const p = data?.payload as ExaminerScatterPoint;
                      if (p?.name) setSelectedExaminer(p.name);
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col h-full items-center justify-center text-slate-400">
                <Users className="w-12 h-12 mb-4 text-slate-200" />
                <p>暂无教员数据</p>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">提示：点击气泡可查看该教员的详细评分热力与评语质量。</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-1">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">教员详情</h3>
          {!selectedExaminer ? (
            <div className="text-center text-slate-400 py-12">
              <UserCheck className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm">点击左侧气泡选择教员查看详情</p>
            </div>
          ) : selectedDetail ? (
            <div className="space-y-4">
              <div className="flex items-center mb-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg mr-3">
                  {selectedExaminer[0]}
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800">{selectedExaminer}</h4>
                  <p className="text-xs text-slate-500">
                    {selectedDetail.scatter?.count || 0} 次评估 · 均分 {selectedDetail.scatter?.avgScore.toFixed(2) || '-'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">相对整体偏差</p>
                  <p className={`text-lg font-bold ${(selectedDetail.scatter?.deviation || 0) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {selectedDetail.scatter?.deviation && selectedDetail.scatter.deviation > 0 ? '+' : ''}
                    {selectedDetail.scatter?.deviation.toFixed(2) || '-'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">平均评语字数</p>
                  <p className="text-lg font-bold text-slate-800">{selectedDetail.row?.avg_length || 0}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">关键词平均分</p>
                  <p className="text-lg font-bold text-slate-800">{selectedDetail.row?.avg_keywords.toFixed(2) || 0}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">覆盖维度</p>
                  <p className="text-lg font-bold text-slate-800">{selectedDetail.cells.length}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">该教员各维度均分</p>
                <div className="space-y-1.5">
                  {selectedDetail.cells.sort((a, b) => b.value - a.value).map(cell => (
                    <div key={cell.x} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{COMPETENCY_LABELS[cell.x] || cell.x}</span>
                      <span className="font-medium" style={{ color: cell.value >= 3.5 ? '#10b981' : cell.value >= 3 ? '#f59e0b' : '#ef4444' }}>
                        {cell.value.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 教员 × 胜任力 热力图 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">教员 × 胜任力 评分热力图</h3>
        <p className="text-xs text-slate-400 mb-4">颜色越偏红表示该教员在该维度给分越高，蓝表示越低</p>
        {heatmapExaminers.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="grid" style={{ gridTemplateColumns: `120px repeat(${COMPETENCY_CODES.length}, minmax(80px, 1fr))` }}>
                {/* Header */}
                <div className="p-2 text-xs font-medium text-slate-400 border-b border-slate-100">教员</div>
                {COMPETENCY_CODES.map(c => (
                  <div key={c} className="p-2 text-xs font-medium text-center border-b border-slate-100" style={{ color: COMPETENCY_COLORS[c] }}>
                    {c}
                  </div>
                ))}

                {/* Rows */}
                {heatmapExaminers.map(examiner => (
                  <>
                    <div key={`${examiner}-label`} className="p-2 text-xs text-slate-600 border-b border-slate-100 truncate flex items-center">
                      {examiner}
                    </div>
                    {COMPETENCY_CODES.map(code => {
                      const cell = heatmapData.find(d => d.y === examiner && d.x === code);
                      const value = cell?.value ?? 0;
                      const textColor = value > (heatmapMin + heatmapMax) / 2 ? '#fff' : '#1e293b';
                      return (
                        <div
                          key={`${examiner}-${code}`}
                          className="p-2 text-xs font-medium text-center border-b border-slate-50 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all"
                          style={{ backgroundColor: colorScale(value), color: textColor }}
                          title={`${examiner} - ${COMPETENCY_LABELS[code]}: ${value.toFixed(2)}`}
                          onClick={() => setSelectedExaminer(examiner)}
                        >
                          {value.toFixed(1)}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-400 py-12">
            <Users className="w-12 h-12 mb-4 text-slate-200" />
            <p>暂无热力图数据</p>
          </div>
        )}
      </div>

      {/* 评语质量 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center">
            <MessageSquare className="w-5 h-5 mr-2 text-blue-500" />
            教员评语平均字数（TOP 15）
          </h3>
          <p className="text-xs text-slate-400 mb-4">反映教员评语详细程度</p>
          <div className="h-72 w-full">
            {qualityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={qualityChartData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis type="category" dataKey="examiner" tick={{ fill: '#64748b', fontSize: 10 }} width={55} />
                  <Tooltip formatter={(v: any) => [typeof v === 'number' ? `${v} 字` : v, '平均字数']} />
                  <Bar dataKey="avg_length" radius={[0, 4, 4, 0]}>
                    {qualityChartData.map((_, idx) => (
                      <Cell key={idx} fill={['#3b82f6', '#60a5fa', '#93c5fd'][idx % 3]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col h-full items-center justify-center text-slate-400">
                <MessageSquare className="w-10 h-10 mb-3 text-slate-200" />
                <p className="text-sm">暂无评语质量数据</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-1">教员评语关键词平均分（TOP 15）</h3>
          <p className="text-xs text-slate-400 mb-4">反映评语中结构化关键词的丰富度</p>
          <div className="h-72 w-full">
            {qualityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...qualityData].sort((a, b) => b.avg_keywords - a.avg_keywords).slice(0, 15)} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis type="category" dataKey="examiner" tick={{ fill: '#64748b', fontSize: 10 }} width={55} />
                  <Tooltip formatter={(v: any) => [typeof v === 'number' ? v.toFixed(2) : v, '关键词平均分']} />
                  <Bar dataKey="avg_keywords" radius={[0, 4, 4, 0]} fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col h-full items-center justify-center text-slate-400">
                <MessageSquare className="w-10 h-10 mb-3 text-slate-200" />
                <p className="text-sm">暂无评语质量数据</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 教员给分排行榜 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">教员给分排行榜</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-4 py-2 text-left font-medium">排名</th>
                <th className="px-4 py-2 text-left font-medium">教员</th>
                <th className="px-4 py-2 text-center font-medium">评估次数</th>
                <th className="px-4 py-2 text-center font-medium">平均给分</th>
                <th className="px-4 py-2 text-center font-medium">相对整体偏差</th>
                <th className="px-4 py-2 text-center font-medium">平均评语字数</th>
                <th className="px-4 py-2 text-center font-medium">关键词均分</th>
              </tr>
            </thead>
            <tbody>
              {[...examinerData].sort((a, b) => b.avgScore - a.avgScore).map((e, idx) => {
                const q = qualityData.find(q => q.examiner === e.name);
                return (
                  <tr
                    key={e.name}
                    className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${selectedExaminer === e.name ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedExaminer(e.name)}
                  >
                    <td className="px-4 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{e.name}</td>
                    <td className="px-4 py-2 text-center text-slate-600">{e.count}</td>
                    <td className="px-4 py-2 text-center font-medium text-slate-700">{e.avgScore.toFixed(2)}</td>
                    <td className={`px-4 py-2 text-center font-medium ${e.deviation > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {e.deviation > 0 ? '+' : ''}{e.deviation.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-center text-slate-600">{q?.avg_length ?? '-'}</td>
                    <td className="px-4 py-2 text-center text-slate-600">{q?.avg_keywords.toFixed(2) ?? '-'}</td>
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
