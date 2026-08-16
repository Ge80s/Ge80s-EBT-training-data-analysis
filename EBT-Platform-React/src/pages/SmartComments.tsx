import { useState, useEffect, useRef, useMemo } from 'react';
import { apiService } from '../services/api_service';
import {
  Loader2, MessageSquare, Tag, PieChart as PieChartIcon, Sparkles, FileSpreadsheet,
  Send, Bot, Settings, Layers, ShieldAlert, CheckCircle2, AlertCircle,
  Key, Server, Cpu, RefreshCw, User, GraduationCap, BarChart2
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useData } from '../hooks/useData';

interface CommentsData {
  total_comments: number;
  keywords: { word: string; frequency: number }[];
  iata_risk: Record<string, number>;
  icao_threat: Record<string, number>;
  flight_phase: Record<string, number>;
  doc9995_theme: Record<string, number>;
  risk_tags: Record<string, number>;
}

type MainTab = 'taxonomy' | 'deep_ai' | 'chat' | 'config';
type TaxonomyDimension = 'iata' | 'icao' | 'phase' | 'doc9995';

const CHART_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

export default function SmartComments() {
  const { summary, filters, pilots } = useData();
  const [activeTab, setActiveTab] = useState<MainTab>('taxonomy');
  const [taxonomyDim, setTaxonomyDim] = useState<TaxonomyDimension>('iata');

  const [data, setData] = useState<CommentsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI 配置 State
  const [aiConfig, setAiConfig] = useState({
    provider: 'gemini',
    api_key: '',
    api_key_masked: '',
    model: 'gemini-2.5-flash',
    base_url: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [configTesting, setConfigTesting] = useState(false);
  const [configTestResult, setConfigTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  // AI 深度分析 State
  const [deepType, setDeepType] = useState<'pilot_development' | 'examiner_quality' | 'cohort_training_demand'>('pilot_development');
  const [selectedPilot, setSelectedPilot] = useState<string>('');
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepReport, setDeepReport] = useState<string | null>(null);

  // AI 流式对话 State
  const [query, setQuery] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'ai'; content: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const aiEndRef = useRef<HTMLDivElement>(null);

  // 导出
  const [exporting, setExporting] = useState(false);

  // 唯一学员列表
  const uniquePilots = useMemo(() => {
    const set = new Set<string>();
    (pilots || []).forEach(p => set.add(p.name));
    return Array.from(set).sort();
  }, [pilots]);

  useEffect(() => {
    if (uniquePilots.length > 0 && !selectedPilot) {
      setSelectedPilot(uniquePilots[0]);
    }
  }, [uniquePilots, selectedPilot]);

  // 加载分析数据
  useEffect(() => {
    async function loadCommentsAnalysis() {
      if (!summary || summary.total_pilots === 0) return;
      setLoading(true);
      try {
        const result = await apiService.analyzeComments(filters);
        if (result.error) throw new Error(result.error);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取评语 NLP 分析失败');
      } finally {
        setLoading(false);
      }
    }
    loadCommentsAnalysis();
  }, [summary, filters]);

  // 加载 AI 配置
  useEffect(() => {
    async function loadConfig() {
      try {
        const cfg = await apiService.getAIConfig();
        setAiConfig(prev => ({ ...prev, ...cfg }));
      } catch (e) {
        console.error('加载 AI 配置失败', e);
      }
    }
    loadConfig();
  }, []);

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, aiLoading]);

  // 保存 AI 配置
  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setConfigTestResult(null);
    try {
      const payload = {
        provider: aiConfig.provider,
        api_key: aiConfig.api_key,
        model: aiConfig.model,
        base_url: aiConfig.base_url,
      };
      const res = await apiService.saveAIConfig(payload);
      const nextConfig = { ...aiConfig, ...res.config };
      setAiConfig(nextConfig);
      setConfigTestResult({ success: true, message: 'AI 接口配置保存成功！' });
    } catch (e) {
      setConfigTestResult({ success: false, message: '保存失败: ' + (e instanceof Error ? e.message : '未知错误') });
    } finally {
      setConfigSaving(false);
    }
  };

  // 测试 AI 连接
  const handleTestConnection = async () => {
    setConfigTesting(true);
    setConfigTestResult(null);
    try {
      const payload = {
        provider: aiConfig.provider,
        api_key: aiConfig.api_key,
        model: aiConfig.model,
        base_url: aiConfig.base_url,
      };
      const res = await apiService.testAIConnection(payload);
      setConfigTestResult(res);
    } catch (e) {
      setConfigTestResult({ success: false, message: '测试连接异常: ' + (e instanceof Error ? e.message : '未知错误') });
    } finally {
      setConfigTesting(false);
    }
  };

  // 执行 AI 深度分析
  const handleRunDeepAnalysis = async () => {
    setDeepLoading(true);
    setDeepReport(null);
    try {
      const res = await apiService.generateAIDeepAnalysis(deepType, filters, selectedPilot);
      setDeepReport(res.report);
    } catch (e) {
      setDeepReport('⚠️ 深度分析生成失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setDeepLoading(false);
    }
  };

  // 发送 AI 对话
  const handleSendQuery = async (customPrompt?: string) => {
    const promptToSend = customPrompt || query;
    if (!promptToSend.trim()) return;
    if (!customPrompt) setQuery('');

    setAiMessages(prev => [...prev, { role: 'user', content: promptToSend.trim() }]);
    setAiLoading(true);

    let accumulated = '';
    setAiMessages(prev => [...prev, { role: 'ai', content: '' }]);

    try {
      await apiService.analyzeStream(promptToSend.trim(), (token) => {
        accumulated += token;
        setAiMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'ai') {
            last.content = accumulated;
          }
          return next;
        });
      }, filters);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      setAiMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'ai') {
          last.content = `⚠️ [错误类型: 前端请求异常]\n\n${errorMessage}`;
        }
        return next;
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      await apiService.exportReport({
        threshold: 3,
        batch: filters.batch === 'all' ? null : filters.batch,
        aircraft_type: filters.aircraftType === 'all' ? null : filters.aircraftType,
        rank: filters.rank === 'all' ? null : filters.rank,
      });
      alert('多 Sheet 分析报告已开始下载！');
    } catch (err) {
      alert('导出报告失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setExporting(false);
    }
  };

  // 根据选中的分类维度准备图表数据
  const currentTaxonomyData = useMemo(() => {
    if (!data) return [];
    let map: Record<string, number> = {};
    if (taxonomyDim === 'iata') map = data.iata_risk || {};
    else if (taxonomyDim === 'icao') map = data.icao_threat || {};
    else if (taxonomyDim === 'phase') map = data.flight_phase || {};
    else if (taxonomyDim === 'doc9995') map = data.doc9995_theme || {};

    return Object.entries(map)
      .map(([key, val]) => ({ name: key, value: val }))
      .filter(d => d.value > 0);
  }, [data, taxonomyDim]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-96 items-center justify-center text-slate-400">
        <MessageSquare className="w-12 h-12 mb-4 text-slate-200" />
        <p>{error || '暂无评语数据，请先导入包含评语的评估表格'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">智能评语分析与 AI 诊断</h1>
          <p className="text-xs text-slate-500 mt-1">
            民航标准 (ICAO / IATA / Doc 9995) 4维风险分类与 Google Gemini / Kimi AI 智能分析
          </p>
        </div>
        <button
          type="button"
          onClick={() => { console.debug('[UI] export button clicked'); handleExportReport(); }}
          disabled={exporting}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          <span>导出 Excel 多 Sheet 综合报告</span>
        </button>
      </div>

      {/* 选项卡导航 */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-3 gap-2">
        <button
          onClick={() => setActiveTab('taxonomy')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${activeTab === 'taxonomy'
            ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
            }`}
        >
          <PieChartIcon className="w-4 h-4" />
          <span>4维民航风险与训练主题分类</span>
        </button>

        <button
          onClick={() => setActiveTab('deep_ai')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${activeTab === 'deep_ai'
            ? 'border-purple-600 text-purple-600 bg-purple-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
            }`}
        >
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span>实用 AI 深度分析诊断</span>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${activeTab === 'chat'
            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
            }`}
        >
          <Bot className="w-4 h-4 text-indigo-500" />
          <span>AI 智能对话问答</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${activeTab === 'config'
            ? 'border-amber-600 text-amber-600 bg-amber-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
            }`}
        >
          <Settings className="w-4 h-4 text-amber-500" />
          <span>AI 接口配置 (Gemini/Kimi)</span>
        </button>
      </div>

      {/* Tab 1: 4维风险与训练主题分类 */}
      {activeTab === 'taxonomy' && (
        <div className="space-y-6">
          {/* 分类切换器 */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-sm font-semibold text-slate-700">
              <Layers className="w-4 h-4 text-blue-500" />
              <span>选择分析分类视角：</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTaxonomyDim('iata')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${taxonomyDim === 'iata'
                  ? 'bg-red-50 text-red-700 border-red-300 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                IATA 风险分类 (CFIT / LOC-I / RE / MAC)
              </button>
              <button
                onClick={() => setTaxonomyDim('icao')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${taxonomyDim === 'icao'
                  ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                ICAO 事故/威胁分类 (TEM / SOP)
              </button>
              <button
                onClick={() => setTaxonomyDim('phase')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${taxonomyDim === 'phase'
                  ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                飞行阶段 (起飞 / 进近 / 着陆 / 复飞)
              </button>
              <button
                onClick={() => setTaxonomyDim('doc9995')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${taxonomyDim === 'doc9995'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                ICAO Doc 9995 评估与训练主题矩阵 (12标准主题)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 分类饼图 */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center text-slate-800 font-semibold text-base">
                  <PieChartIcon className="w-5 h-5 mr-2 text-blue-500" />
                  {taxonomyDim === 'iata' && 'IATA 风险事件标签分布'}
                  {taxonomyDim === 'icao' && 'ICAO 威胁与差错分类占比'}
                  {taxonomyDim === 'phase' && '飞行阶段高频风险分布'}
                  {taxonomyDim === 'doc9995' && 'ICAO Doc 9995 评估与训练主题分布 (12官方主题)'}
                </div>
                <span className="text-xs text-slate-400">基于 {data.total_comments} 条评估评语</span>
              </div>
              <div className="h-80 w-full">
                {currentTaxonomyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={currentTaxonomyData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {currentTaxonomyData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={((val: any) => [`${val} 次识别`, '频次']) as any} />
                      <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">此分类视角下暂未匹配到关键词数据</div>
                )}
              </div>
            </div>

            {/* 柱状图对比 */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <div className="flex items-center mb-4 text-slate-800 font-semibold text-base">
                <BarChart2 className="w-5 h-5 mr-2 text-indigo-500" />
                频次分布直方图
              </div>
              <div className="h-80 w-full">
                {currentTaxonomyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={currentTaxonomyData} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                      <RechartsTooltip formatter={((val: any) => [`${val} 次`, '识别频次']) as any} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {currentTaxonomyData.map((_entry, index) => (
                          <Cell key={`cell-bar-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">暂无数据</div>
                )}
              </div>
            </div>
          </div>

          {/* 高频提取词汇 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center mb-4 text-slate-800 font-semibold text-lg">
              <Tag className="w-5 h-5 mr-2 text-indigo-500" />
              全群评语 NLP 高频核心词提取 Top 20
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {data.keywords.map((kw, idx) => (
                <div key={idx} className="flex items-center">
                  <div className="w-28 text-sm font-medium text-slate-700 truncate">{kw.word}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 mx-3 relative">
                    <div
                      className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((kw.frequency / (data.keywords[0]?.frequency || 1)) * 100, 100)}%` }}
                    ></div>
                  </div>
                  <div className="w-14 text-right text-xs font-semibold text-slate-500">{kw.frequency} 次</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: 实用 AI 深度分析 */}
      {activeTab === 'deep_ai' && (
        <div className="space-y-6">
          {/* 功能选择控制台 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <Sparkles className="w-5 h-5 text-purple-600 mr-2" />
              选择 AI 深度分析模块
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div
                onClick={() => setDeepType('pilot_development')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${deepType === 'pilot_development'
                  ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-200'
                  : 'border-slate-200 hover:border-purple-200 bg-white'
                  }`}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                    <User className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-slate-800">1. 学员个人发展诊断</h4>
                </div>
                <p className="text-xs text-slate-500">根据个人历次评估历史，生成个人优势、短板诊断及成长路线图。</p>
              </div>

              <div
                onClick={() => setDeepType('examiner_quality')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${deepType === 'examiner_quality'
                  ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-200'
                  : 'border-slate-200 hover:border-purple-200 bg-white'
                  }`}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-slate-800">2. 教员评分评语质量分析</h4>
                </div>
                <p className="text-xs text-slate-500">评估教员打分严格度偏置、评语具象度与建设性，提供质量改进建议。</p>
              </div>

              <div
                onClick={() => setDeepType('cohort_training_demand')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${deepType === 'cohort_training_demand'
                  ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-200'
                  : 'border-slate-200 hover:border-purple-200 bg-white'
                  }`}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-slate-800">3. 群体训练需求与场景矩阵</h4>
                </div>
                <p className="text-xs text-slate-500">结合 IATA/ICAO 风险分布，针对整体和技术等级群体自动推荐 Doc 9995 课程。</p>
              </div>
            </div>

            {/* 参数配置栏 */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
              {deepType === 'pilot_development' ? (
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-semibold text-slate-700">选择目标学员：</label>
                  <select
                    value={selectedPilot}
                    onChange={e => setSelectedPilot(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {uniquePilots.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  当前分析范围：已施加侧边栏筛选条件 ({filters.batch === 'all' ? '全部批次' : filters.batch} · {filters.aircraftType === 'all' ? '全部机型' : filters.aircraftType})
                </div>
              )}

              <button
                onClick={handleRunDeepAnalysis}
                disabled={deepLoading}
                className="flex items-center space-x-2 px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {deepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{deepLoading ? 'AI 正在深度思考与生成...' : '立即生成 AI 深度分析报告'}</span>
              </button>
            </div>
          </div>

          {/* 深度分析报告渲染展示区 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 min-h-[400px]">
            {!deepReport && !deepLoading && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Bot className="w-14 h-14 text-slate-200 mb-3" />
                <p className="text-sm">点击上方“立即生成 AI 深度分析报告”按钮以开始分析</p>
              </div>
            )}

            {deepLoading && (
              <div className="flex flex-col items-center justify-center py-20 text-purple-600">
                <Loader2 className="w-10 h-10 animate-spin mb-3" />
                <p className="text-sm font-medium">AI 正在深度调理评估上下文数据并生成报告，请稍候…</p>
              </div>
            )}

            {deepReport && !deepLoading && (
              <div className="prose max-w-none">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                  <div className="flex items-center space-x-2 text-purple-700 font-bold text-lg">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span>AI 深度诊断分析完成</span>
                  </div>
                  <span className="text-xs text-slate-400">生成时间: {new Date().toLocaleTimeString()}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 bg-slate-50/70 p-5 rounded-xl border border-slate-200/80 font-sans">
                  {deepReport}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: AI 智能对话问答 */}
      {activeTab === 'chat' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[650px]">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div className="flex items-center text-slate-800 font-semibold text-base">
              <Bot className="w-5 h-5 mr-2 text-indigo-600" />
              AI 智能 EBT 助手 (实时流式问答)
            </div>
            <div className="text-xs text-slate-400">
              后端模型: <span className="font-mono text-slate-600">{aiConfig.provider} ({aiConfig.model})</span>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex flex-wrap gap-2 text-xs">
            <span className="text-slate-400 py-1">快捷提问:</span>
            {[
              '总结当前整体训练数据的核心风险问题',
              '分析副驾驶 (FO) 群体最突出的短板',
              '如何改进教员评语的建设性与具象度？',
              '推荐针对可控撞地 (CFIT) 风险的场景训练方案'
            ].map(p => (
              <button
                key={p}
                onClick={() => handleSendQuery(p)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition-colors cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Chat Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {aiMessages.length === 0 && (
              <div className="text-center text-slate-400 py-16">
                <Bot className="w-12 h-12 mx-auto mb-3 text-indigo-200" />
                <p className="font-semibold text-slate-600">欢迎使用 AI 智能 EBT 评估分析助手</p>
                <p className="text-xs mt-1 text-slate-400">您可以直接询问关于人员成绩分布、教员评语建议或模拟机训练场景的设计问题。</p>
              </div>
            )}
            {aiMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                  }`}>
                  {msg.role === 'ai' ? (
                    <div className="whitespace-pre-wrap leading-relaxed font-sans">
                      {msg.content || (aiLoading && idx === aiMessages.length - 1 ? '思考与分析中…' : '')}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            <div ref={aiEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendQuery(); } }}
                placeholder="输入关于飞行训练评估、技术等级或评语的问题..."
                className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
              />
              <button
                onClick={() => handleSendQuery()}
                disabled={aiLoading || !query.trim()}
                className="flex items-center space-x-1 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>发送</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: AI 接口配置 */}
      {activeTab === 'config' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 max-w-3xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <Settings className="w-5 h-5 text-amber-500 mr-2" />
                AI 接口服务提供商配置
              </h3>
              <p className="text-xs text-slate-500 mt-1">支持 Google Gemini 与 Kimi (Moonshot AI) 的 API Key 接入与连通性测试</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* 提供商选择 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center">
                <Cpu className="w-4 h-4 mr-1 text-slate-500" />
                选择 AI 模型提供商 (Provider)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAiConfig(prev => ({ ...prev, provider: 'gemini', model: 'gemini-3.0-pro' }))}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between cursor-pointer ${aiConfig.provider === 'gemini'
                    ? 'border-blue-500 bg-blue-50/70 text-blue-800 ring-2 ring-blue-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  <div>
                    <div className="font-bold text-sm">Google Gemini</div>
                    <div className="text-xs text-slate-500">Google AI Studio (支持 Gemini 3.0 PRO)</div>
                  </div>
                  {aiConfig.provider === 'gemini' && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                </button>

                <button
                  type="button"
                  onClick={() => setAiConfig(prev => ({ ...prev, provider: 'kimi', model: 'kimi-k2.5' }))}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between cursor-pointer ${aiConfig.provider === 'kimi'
                    ? 'border-blue-500 bg-blue-50/70 text-blue-800 ring-2 ring-blue-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  <div>
                    <div className="font-bold text-sm">Kimi (Moonshot AI)</div>
                    <div className="text-xs text-slate-500">Moonshot API / OpenAI 兼容</div>
                  </div>
                  {aiConfig.provider === 'kimi' && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                </button>
              </div>
            </div>

            {/* Model Selector */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center">
                <Server className="w-4 h-4 mr-1 text-slate-500" />
                模型选择 (Model)
              </label>
              <select
                value={aiConfig.model}
                onChange={e => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              >
                {aiConfig.provider === 'gemini' ? (
                  <>
                    <option value="gemini-3.0-pro">gemini-3.0-pro (最新旗舰 Gemini 3.0 PRO 模型)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (推荐，响应极快)</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro (深度推理逻辑能力强)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (经典长上下文模型)</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash (轻量快速)</option>
                  </>
                ) : (
                  <>
                    <option value="kimi-k2.5">kimi-k2.5 (最新 Kimi 2.5 旗舰模型)</option>
                    <option value="moonshot-v1-8k">moonshot-v1-8k (Moonshot 标准上下文)</option>
                    <option value="moonshot-v1-32k">moonshot-v1-32k (Moonshot 长文本分析)</option>
                    <option value="moonshot-v1-128k">moonshot-v1-128k (Moonshot 超长海量评语)</option>
                  </>
                )}
              </select>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center">
                <Key className="w-4 h-4 mr-1 text-slate-500" />
                API Key 密钥
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={aiConfig.api_key}
                  onChange={e => setAiConfig(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder={aiConfig.api_key_masked ? `已有保存 Key: ${aiConfig.api_key_masked} (若无需更改可留空)` : '输入您的 API Key'}
                  className="w-full border border-slate-300 rounded-lg pl-3 pr-20 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 bg-slate-100 rounded"
                >
                  {showApiKey ? '隐藏 Key' : '显示 Key'}
                </button>
              </div>
            </div>

            {/* 自定义 Base URL */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center">
                <Server className="w-4 h-4 mr-1 text-slate-500" />
                自定义 API Endpoint URL (可选)
              </label>
              <input
                type="text"
                value={aiConfig.base_url}
                onChange={e => setAiConfig(prev => ({ ...prev, base_url: e.target.value }))}
                placeholder={aiConfig.provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta (留空使用默认)' : 'https://api.moonshot.cn/v1 (留空使用默认)'}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 测试连接反馈 */}
          {configTestResult && (
            <div className={`p-4 rounded-xl border flex items-start space-x-3 text-sm ${configTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
              }`}>
              {configTestResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold">{configTestResult.success ? '测试连通成功！' : '测试连通失败'}</p>
                <p className="text-xs mt-0.5 opacity-90">{configTestResult.message}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={configTesting}
              className="flex items-center space-x-1 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {configTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>测试 API 连接</span>
            </button>

            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={configSaving}
              className="flex items-center space-x-1 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              {configSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>保存配置</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
