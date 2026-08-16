import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Target, AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight, Loader2,
  X, Search, ChevronRight, UserCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  Tooltip,
} from 'recharts';
import { useData } from '../hooks/useData';

export default function Dashboard() {
  const { summary, loading } = useData();
  const navigate = useNavigate();

  const [showRiskModal, setShowRiskModal] = useState(false);
  const [riskSearchTerm, setRiskSearchTerm] = useState('');

  const allRiskPilots = useMemo(() => summary?.risk_pilots || [], [summary?.risk_pilots]);

  const filteredModalRiskPilots = useMemo(() => {
    if (!riskSearchTerm.trim()) return allRiskPilots;
    return allRiskPilots.filter(p => typeof p === 'string' && p.toLowerCase().includes(riskSearchTerm.trim().toLowerCase()));
  }, [allRiskPilots, riskSearchTerm]);

  if (loading && !summary) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Fallbacks if no data
  const totalPilots = summary?.total_pilots || 0;
  const overallAvg = summary?.overall_average || 0;
  const riskCount = summary?.risk_count || 0;
  const excellentCount = summary?.score_distribution?.excellent || 0;
  const excellentRate = totalPilots > 0 ? ((excellentCount / totalPilots) * 100).toFixed(1) + '%' : '0%';

  const kpiData = [
    { title: '评估总人数', value: totalPilots.toString(), change: '+0', isPositive: true, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100', clickable: false },
    { title: '整体平均分', value: overallAvg.toFixed(2), change: '+0.0', isPositive: true, icon: Target, color: 'text-emerald-600', bg: 'bg-emerald-100', clickable: false },
    { title: '高风险标识', value: riskCount.toString(), change: '0', isPositive: riskCount === 0, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100', clickable: true },
    { title: '优秀率 (人均)', value: excellentRate, change: '0%', isPositive: true, icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-100', clickable: false },
  ];

  const competencyLabels: Record<string, string> = {
    KNO: 'KNO', PRO: 'PRO', FPA: 'FPA', FPM: 'FPM', COM: 'COM',
    LTW: 'LTW', SAW: 'SAW', WLM: 'WLM', PSD: 'PSD',
  };

  const radarData = summary?.average_scores
    ? Object.entries(summary.average_scores).map(([key, value]) => ({
        subject: competencyLabels[key] || key,
        A: parseFloat((value as number).toFixed(2)),
        fullMark: 5,
      }))
    : [];

  // 评分分布（按人数）
  const distributionData = [
    { name: '优秀 (≥4.5)', value: summary?.score_distribution?.excellent || 0, color: '#10b981' },
    { name: '良好 (3.5-4.5)', value: summary?.score_distribution?.good || 0, color: '#3b82f6' },
    { name: '合格 (3.0-3.5)', value: summary?.score_distribution?.fair || 0, color: '#f59e0b' },
    { name: '待改进 (<3.0)', value: summary?.score_distribution?.poor || 0, color: '#ef4444' },
  ];

  // risk_pilots 在后端已去重，直接取前4条，用姓名作 key
  const riskPilots = allRiskPilots.slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">总览仪表板</h1>
        <div className="text-sm text-slate-500">
          最后更新: {summary?.last_updated ? new Date(summary.last_updated).toLocaleString() : '-'}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, index) => (
          <div
            key={index}
            onClick={() => {
              if (kpi.clickable) setShowRiskModal(true);
            }}
            className={`bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-all ${
              kpi.clickable ? 'cursor-pointer hover:border-amber-300' : ''
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-1">
                  {kpi.title}
                  {kpi.clickable && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-normal">点击查看</span>}
                </p>
                <h3 className="text-2xl font-bold text-slate-800">{kpi.value}</h3>
              </div>
              <div className={`p-2 rounded-lg ${kpi.bg}`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className={`flex items-center font-medium ${kpi.isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                {kpi.isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
                {kpi.change}
              </span>
              <span className="text-slate-400 ml-2">较上批次</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">整体胜任力维度分析</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                <Radar name="平均得分" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.5} />
                <Tooltip formatter={((val: number) => [val.toFixed(2), '平均分']) as any} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">高风险需关注人员</h3>
              <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">Top 4 / 共 {allRiskPilots.length} 人</span>
            </div>
            <div className="space-y-3">
              {riskPilots.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">暂无高风险人员 ✓</p>
              ) : (
                riskPilots.map((pilotName) => (
                  <div
                    key={pilotName}
                    onClick={() => navigate(`/profile?name=${encodeURIComponent(pilotName)}`)}
                    className="flex items-start p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-red-50/50 hover:border-red-200 transition-all cursor-pointer group"
                    title="点击查看该飞行员详细档案"
                  >
                    <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-600 shrink-0 text-sm">
                      {typeof pilotName === 'string' ? pilotName[0] : '?'}
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-slate-800 group-hover:text-red-700 transition-colors">
                          {typeof pilotName === 'string' ? pilotName : '未知'}
                        </h4>
                        <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">需关注</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">存在低于 3.0 分的单项得分</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRiskModal(true)}
            className="w-full mt-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1 cursor-pointer"
          >
            <span>查看完整预警名单 ({allRiskPilots.length} 人)</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Score Distribution Bar Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">人员评分分布</h3>
        <p className="text-xs text-slate-400 mb-4">基于每位飞行员全维度平均分</p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distributionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip formatter={((val: number) => [`${val} 人`, '人数']) as any} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {distributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 完整高风险预警名单 Modal 弹窗 */}
      {showRiskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">高风险需关注人员完整预警名单</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    共计 <span className="font-semibold text-red-600">{allRiskPilots.length}</span> 人触发胜任力低分预警（单项得分 &lt; 3.0 分）
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-4 border-b border-slate-100 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={riskSearchTerm}
                  onChange={(e) => setRiskSearchTerm(e.target.value)}
                  placeholder="搜索预警飞行员姓名..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>
            </div>

            {/* Modal Content List */}
            <div className="overflow-y-auto p-4 space-y-2.5 flex-1 max-h-[50vh]">
              {filteredModalRiskPilots.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">未匹配到预警人员</p>
                </div>
              ) : (
                filteredModalRiskPilots.map((pilotName) => (
                  <div
                    key={pilotName}
                    onClick={() => {
                      setShowRiskModal(false);
                      navigate(`/profile?name=${encodeURIComponent(pilotName)}`);
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-white hover:bg-red-50/50 hover:border-red-200 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 font-bold flex items-center justify-center text-sm shrink-0">
                        {typeof pilotName === 'string' ? pilotName[0] : '?'}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-slate-800 group-hover:text-red-700 transition-colors">{pilotName}</h4>
                          <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">需关注</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">存在低于 3.0 分的单项胜任力得分记录</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 text-xs font-medium text-blue-600 group-hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg group-hover:bg-blue-100 transition-colors shrink-0">
                      <span>查看个人档案</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
              <span>点击任意人员可跳转至“飞行员档案”查看详细胜任力与历史评语</span>
              <button
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

