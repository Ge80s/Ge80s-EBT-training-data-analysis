import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Grid3X3, AlertTriangle, GitBranch, Filter, Loader2, ChevronDown, Check } from 'lucide-react';
import { apiService } from '../services/api_service';
import { useData } from '../hooks/useData';

interface FilterState {
  batch: string;
  aircraft_type: string;
  ranks: string[];
  threshold: string;
}

interface MatrixCell {
  x: string;
  y: string;
  value: number;
}

interface MatrixResponse {
  competency_labels: Record<string, string>;
  theme_order: string[];
  data: MatrixCell[];
}

interface RiskMatrixResponse {
  competency_risk: MatrixCell[];
  theme_risk: MatrixCell[];
  competency_labels: Record<string, string>;
  risk_names: Record<string, string>;
  risk_order: string[];
  theme_order: string[];
}

interface SankeyResponse {
  type: string;
  data: {
    nodes: { name: string }[];
    links: { source: number; target: number; value: number }[];
  };
}

type TabKey = 'heatmap' | 'risk' | 'sankey' | 'sankey3';

export default function MatrixAnalysis() {
  const { filters: globalFilters } = useData();
  const [activeTab, setActiveTab] = useState<TabKey>('heatmap');
  const [filters, setFilters] = useState<FilterState>({
    batch: '',
    aircraft_type: '',
    ranks: [],
    threshold: '3',
  });
  const [options, setOptions] = useState<{
    batches: string[];
    aircraft_types: string[];
    ranks: string[];
  }>({ batches: [], aircraft_types: [], ranks: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isRankOpen, setIsRankOpen] = useState(false);
  const rankRef = useRef<HTMLDivElement>(null);

  const [heatmapData, setHeatmapData] = useState<MatrixResponse | null>(null);
  const [riskData, setRiskData] = useState<RiskMatrixResponse | null>(null);
  const [sankeyData, setSankeyData] = useState<SankeyResponse | null>(null);
  const [sankey3Data, setSankey3Data] = useState<SankeyResponse | null>(null);

  // 点击外部关闭技术等级下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rankRef.current && !rankRef.current.contains(event.target as Node)) {
        setIsRankOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 顶栏全局筛选优先生效；矩阵页的下拉框同步显示相同条件。
  useEffect(() => {
    setFilters(previous => ({
      ...previous,
      batch: globalFilters.batch === 'all' ? '' : globalFilters.batch,
      aircraft_type: globalFilters.aircraftType === 'all' ? '' : globalFilters.aircraftType,
      ranks: globalFilters.rank === 'all' ? [] : [globalFilters.rank],
    }));
  }, [globalFilters.batch, globalFilters.aircraftType, globalFilters.rank]);

  // 加载筛选选项
  useEffect(() => {
    apiService.getBatches()
      .then(data => {
        setOptions({
          batches: data.batches || [],
          aircraft_types: data.aircraft_types || [],
          ranks: data.ranks || [],
        });
      })
      .catch(err => setError(err.message));
  }, []);

  const buildParams = (extra: Record<string, unknown> = {}) => {
    const params: Record<string, unknown> = {
      batch: filters.batch || null,
      aircraft_type: filters.aircraft_type || null,
      rank: filters.ranks.length ? filters.ranks : null,
      ...extra,
    };
    if (activeTab === 'heatmap' || activeTab === 'risk') {
      params.threshold = filters.threshold ? parseFloat(filters.threshold) : null;
    }
    return params;
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'heatmap') {
        const data = await apiService.getMatrixHeatmap(buildParams());
        setHeatmapData(data);
      } else if (activeTab === 'risk') {
        const data = await apiService.getMatrixRisk(buildParams());
        setRiskData(data);
      } else if (activeTab === 'sankey') {
        const data = await apiService.getMatrixSankey(buildParams({ type: 'theme_risk' }));
        setSankeyData(data);
      } else if (activeTab === 'sankey3') {
        const data = await apiService.getMatrixSankey(buildParams({ type: 'three_stage' }));
        setSankey3Data(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters.batch, filters.aircraft_type, filters.ranks]);

  // 阈值仅在热力/风险页生效，切换时重新加载
  useEffect(() => {
    if (activeTab === 'heatmap' || activeTab === 'risk') {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.threshold]);

  const heatmapOption = useMemo(() => {
    if (!heatmapData) return null;
    const { theme_order, competency_labels, data } = heatmapData;
    const yLabels = Object.keys(competency_labels);
    const xLabels = theme_order;
    const maxVal = Math.max(1, ...data.map(d => d.value));

    const seriesData = data.map(d => [xLabels.indexOf(d.x), yLabels.indexOf(d.y), d.value]);

    return {
      tooltip: {
        position: 'top',
        formatter: (p: any) => {
          return `${competency_labels[yLabels[p.data[1]]]} × ${xLabels[p.data[0]]}<br/>计数: <b>${p.data[2]}</b>`;
        },
      },
      grid: { top: '8%', bottom: '18%', left: '14%', right: '6%' },
      xAxis: {
        type: 'category',
        data: xLabels,
        splitArea: { show: true },
        axisLabel: { interval: 0, rotate: 45, fontSize: 10, color: '#475569' },
      },
      yAxis: {
        type: 'category',
        data: yLabels.map(code => competency_labels[code] || code),
        splitArea: { show: true },
        axisLabel: { fontSize: 11, color: '#475569' },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: { color: ['#dbeafe', '#93c5fd', '#f87171', '#dc2626'] },
      },
      series: [{
        name: '计数',
        type: 'heatmap',
        data: seriesData,
        label: { show: true, fontSize: 10, color: '#1e293b' },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
        },
      }],
    };
  }, [heatmapData]);

  const buildRiskOption = (matrixData: MatrixCell[], xLabels: string[], yLabels: string[], yLabelMap: Record<string, string>, title: string) => {
    const maxVal = Math.max(1, ...matrixData.map(d => d.value));
    const seriesData = matrixData.map(d => [xLabels.indexOf(d.x), yLabels.indexOf(d.y), d.value]);

    return {
      title: { text: title, left: 'center', textStyle: { fontSize: 14, color: '#334155' } },
      tooltip: {
        position: 'top',
        formatter: (p: any) => `${yLabelMap[yLabels[p.data[1]]] || yLabels[p.data[1]]} × ${xLabels[p.data[0]]}<br/>计数: <b>${p.data[2]}</b>`,
      },
      grid: { top: '14%', bottom: '18%', left: '14%', right: '6%' },
      xAxis: {
        type: 'category',
        data: xLabels,
        splitArea: { show: true },
        axisLabel: { interval: 0, rotate: 35, fontSize: 10, color: '#475569' },
      },
      yAxis: {
        type: 'category',
        data: yLabels.map(code => yLabelMap[code] || code),
        splitArea: { show: true },
        axisLabel: { fontSize: 11, color: '#475569' },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: { color: ['#fef3c7', '#fbbf24', '#f59e0b', '#b91c1c'] },
      },
      series: [{
        name: '计数',
        type: 'heatmap',
        data: seriesData,
        label: { show: true, fontSize: 10, color: '#1e293b' },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
      }],
    };
  };

  const riskCompOption = useMemo(() => {
    if (!riskData) return null;
    return buildRiskOption(
      riskData.competency_risk,
      riskData.risk_order,
      Object.keys(riskData.competency_labels),
      riskData.competency_labels,
      '胜任力 × 核心风险'
    );
  }, [riskData]);

  const riskThemeOption = useMemo(() => {
    if (!riskData) return null;
    return buildRiskOption(
      riskData.theme_risk,
      riskData.risk_order,
      riskData.theme_order,
      Object.fromEntries(riskData.theme_order.map(t => [t, t])),
      '训练主题 × 核心风险'
    );
  }, [riskData]);

  const sankeyOption = useMemo(() => {
    const data = activeTab === 'sankey' ? sankeyData : sankey3Data;
    if (!data) return null;
    return {
      tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        data: data.data.nodes,
        links: data.data.links.map(l => ({ source: l.source, target: l.target, value: l.value })),
        lineStyle: { color: 'gradient', curveness: 0.5 },
        label: { fontSize: 11, color: '#475569' },
      }],
    };
  }, [sankeyData, sankey3Data, activeTab]);

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'heatmap', label: '胜任力×主题热力图', icon: Grid3X3 },
    { key: 'risk', label: '核心风险矩阵', icon: AlertTriangle },
    { key: 'sankey', label: '主题→风险 桑基图', icon: GitBranch },
    { key: 'sankey3', label: '三级桑基图', icon: GitBranch },
  ];

  const renderSelect = (label: string, field: 'batch' | 'aircraft_type', items: string[]) => (
    <div className="flex items-center space-x-2">
      <label className="text-sm font-medium text-slate-600 whitespace-nowrap">{label}</label>
      <select
        value={filters[field]}
        onChange={e => setFilters(prev => ({ ...prev, [field]: e.target.value }))}
        className="block w-40 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">全部</option>
        {items.map(item => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </div>
  );

  const toggleRank = (rank: string) => {
    setFilters(previous => ({
      ...previous,
      ranks: previous.ranks.includes(rank)
        ? previous.ranks.filter(item => item !== rank)
        : [...previous.ranks, rank],
    }));
  };

  const selectAllRanks = () => {
    setFilters(prev => ({ ...prev, ranks: [...options.ranks] }));
  };

  const clearRanks = () => {
    setFilters(prev => ({ ...prev, ranks: [] }));
  };

  const getRankSummaryText = () => {
    if (filters.ranks.length === 0) return '全部等级';
    if (options.ranks.length > 0 && filters.ranks.length === options.ranks.length) return '全部等级 (已全选)';
    if (filters.ranks.length === 1) return filters.ranks[0];
    return `已选 ${filters.ranks.length} 项 (${filters.ranks.join(', ')})`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">EBT 矩阵分析</h1>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center text-slate-700 font-medium mr-2">
            <Filter className="w-4 h-4 mr-1.5" />
            筛选条件
          </div>
          {renderSelect('批次', 'batch', options.batches)}
          {renderSelect('机型', 'aircraft_type', options.aircraft_types)}

          {/* 技术等级多选 Popover 下拉菜单 */}
          <div className="flex items-center space-x-2 relative" ref={rankRef}>
            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">技术等级</label>
            <button
              type="button"
              onClick={() => setIsRankOpen(!isRankOpen)}
              className="block w-52 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-left font-normal text-slate-700 flex items-center justify-between hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <span className="truncate mr-1">{getRankSummaryText()}</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isRankOpen ? 'rotate-180' : ''}`} />
            </button>

            {isRankOpen && (
              <div className="absolute left-16 top-full mt-1.5 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-semibold text-slate-500">技术等级（多选）</span>
                  <div className="space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllRanks}
                      className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                    >
                      全选
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={clearRanks}
                      className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {options.ranks.map(rank => {
                    const isSelected = filters.ranks.includes(rank);
                    return (
                      <label
                        key={rank}
                        className={`flex items-center justify-between px-2 py-1.5 text-sm rounded cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
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
          {(activeTab === 'heatmap' || activeTab === 'risk') && (
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-slate-600 whitespace-nowrap">评分阈值</label>
              <select
                value={filters.threshold}
                onChange={e => setFilters(prev => ({ ...prev, threshold: e.target.value }))}
                className="block w-28 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="3">&lt; 3.0</option>
                <option value="3.5">&lt; 3.5</option>
                <option value="4">&lt; 4.0</option>
                <option value="">全部</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-2">
        <div className="flex space-x-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-1.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="flex h-64 items-center justify-center bg-white rounded-xl shadow-sm border border-slate-100">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {/* 内容区 */}
      {!loading && activeTab === 'heatmap' && heatmapOption && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">胜任力 × 训练主题 计数矩阵</h3>
          <p className="text-sm text-slate-500 mb-4">
            统计各胜任力维度在对应训练主题下评分低于阈值 {filters.threshold || '全部'} 的记录数。
          </p>
          <div className="h-[560px]">
            <ReactECharts option={heatmapOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      )}

      {!loading && activeTab === 'risk' && riskCompOption && riskThemeOption && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">胜任力 × 核心风险</h3>
            <p className="text-sm text-slate-500 mb-4">基于主题-风险映射与低评分记录聚合。</p>
            <div className="h-[420px]">
              <ReactECharts option={riskCompOption} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">训练主题 × 核心风险</h3>
            <p className="text-sm text-slate-500 mb-4">训练主题与核心风险的直接关联计数。</p>
            <div className="h-[500px]">
              <ReactECharts option={riskThemeOption} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>
        </div>
      )}

      {!loading && (activeTab === 'sankey' || activeTab === 'sankey3') && sankeyOption && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="text-lg font-semibold text-slate-800 mb-1">
            {activeTab === 'sankey' ? '训练主题 → 核心风险 桑基图' : '胜任力 → 训练主题 → 核心风险 三级桑基图'}
          </h3>
          <p className="text-sm text-slate-500 mb-4">流向宽度代表关联记录数量。</p>
          <div className="h-[600px]">
            <ReactECharts option={sankeyOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      )}
    </div>
  );
}
