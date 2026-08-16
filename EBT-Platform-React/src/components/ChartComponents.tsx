import React from 'react';
import { BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from './UIComponents';

/**
 * 图表组件库 - 使用 Recharts
 * 
 * 包含：
 * - 雷达图（9 维能力评分）
 * - 趋势图（时间序列）
 * - 柱状图（对比分析）
 * - 热力矩阵（飞行员 × 维度）
 */

// ==================== 雷达图组件 ====================

interface RadarData {
  dimension: string;
  value: number;
}

interface RadarChartProps {
  data: RadarData[];
  title?: string;
}

export const CompetencyRadar: React.FC<RadarChartProps> = ({ data, title = '能力评分雷达图' }) => {
  if (!data || data.length === 0) {
    return <Card title={title}><p className="text-gray-500">暂无数据</p></Card>;
  }

  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={data}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="dimension" />
          <PolarRadiusAxis angle={90} domain={[0, 100]} />
          <Radar name="评分" dataKey="value" stroke="#0284c7" fill="#0284c7" fillOpacity={0.6} />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>
    </Card>
  );
};


// ==================== 趋势图组件 ====================

interface TrendData {
  date: string;
  [key: string]: string | number;
}

interface TrendChartProps {
  data: TrendData[];
  title?: string;
  lines: Array<{ key: string; color: string; name: string }>;
}

export const TrendChart: React.FC<TrendChartProps> = ({ data, title = '趋势分析', lines }) => {
  if (!data || data.length === 0) {
    return <Card title={title}><p className="text-gray-500">暂无数据</p></Card>;
  }

  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              name={line.name}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};


// ==================== 柱状图组件 ====================

interface BarData {
  name: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarData[];
  title?: string;
}

export const ColumnChart: React.FC<BarChartProps> = ({ data, title = '对比分析' }) => {
  if (!data || data.length === 0) {
    return <Card title={title}><p className="text-gray-500">暂无数据</p></Card>;
  }

  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#0284c7" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};


// ==================== 评分分布直方图 ====================

interface DistributionData {
  range: string;
  count: number;
}

export const ScoreDistribution: React.FC<{ data: DistributionData[] }> = ({ data }) => {
  return (
    <Card title="评分分布">
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="range" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};


// ==================== KPI 卡片 ====================

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: string;
}

export const KPICard: React.FC<KPICardProps> = ({ title, value, unit, trend, icon }) => {
  const trendColor = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-600',
  };

  return (
    <Card className="border-l-4 border-blue-500">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-600 text-sm mb-2">{title}</p>
          <p className="text-3xl font-bold text-gray-900">
            {value}
            {unit && <span className="text-lg text-gray-600 ml-1">{unit}</span>}
          </p>
        </div>
        {icon && <span className="text-4xl">{icon}</span>}
      </div>
      {trend && (
        <p className={`text-sm mt-2 ${trendColor[trend]}`}>
          {trend === 'up' && '📈 上升趋势'}
          {trend === 'down' && '📉 下降趋势'}
          {trend === 'neutral' && '➡️ 持平'}
        </p>
      )}
    </Card>
  );
};


// ==================== 热力矩阵 ====================

interface HeatmapData {
  pilot: string;
  [dimension: string]: string | number;
}

export const Heatmap: React.FC<{ data: HeatmapData[]; title?: string }> = ({ data, title = '能力热力矩阵' }) => {
  if (!data || data.length === 0) {
    return <Card title={title}><p className="text-gray-500">暂无数据</p></Card>;
  }

  return (
    <Card title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left font-semibold">飞行员</th>
              <th className="px-4 py-2 text-center font-semibold">KNO</th>
              <th className="px-4 py-2 text-center font-semibold">PRO</th>
              <th className="px-4 py-2 text-center font-semibold">FPA</th>
              <th className="px-4 py-2 text-center font-semibold">FPM</th>
              <th className="px-4 py-2 text-center font-semibold">COM</th>
              <th className="px-4 py-2 text-center font-semibold">LTW</th>
              <th className="px-4 py-2 text-center font-semibold">SAW</th>
              <th className="px-4 py-2 text-center font-semibold">WLM</th>
              <th className="px-4 py-2 text-center font-semibold">PSD</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{row.pilot}</td>
                {Object.entries(row).map(([key, value]) =>
                  key !== 'pilot' ? (
                    <td key={key} className="px-4 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-1 rounded text-white text-xs font-semibold ${
                          (value as number) >= 85
                            ? 'bg-green-500'
                            : (value as number) >= 75
                            ? 'bg-blue-500'
                            : (value as number) >= 60
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                      >
                        {value}
                      </span>
                    </td>
                  ) : null
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
