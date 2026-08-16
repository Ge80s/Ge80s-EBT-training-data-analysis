import { useState } from 'react';

/**
 * API 服务层 - 处理所有与后端的通信
 * 
 * 功能：
 * - 文件上传
 * - 数据获取
 * - AI 分析流式消费
 * - 导出结果
 */

const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:8000/api'
  : '/api';

const uploadRequestError = (error: unknown) => {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return new Error('无法连接数据服务。请确认 EBT 后端服务已启动（http://127.0.0.1:8000）。');
  }
  return error;
};

export const apiService = {
  /**
   * 上传 Excel/CSV 文件
   */
  async uploadFile(file: File, sourceLabel?: string) {
    const formData = new FormData();
    formData.append('file', file);

    let url = `${API_BASE_URL}/upload`;
    if (sourceLabel) {
      url += `?source_label=${encodeURIComponent(sourceLabel)}`;
    }

    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', body: formData });
    } catch (error) {
      throw uploadRequestError(error);
    }

    if (!response.ok) {
      throw new Error(`上传失败: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * 批量上传多个 Excel/CSV 文件
   */
  async uploadMultipleFiles(files: File[], sourceLabel?: string) {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const query = sourceLabel
      ? `?source_label=${encodeURIComponent(sourceLabel)}`
      : '';
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/upload-batch${query}`, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      throw uploadRequestError(error);
    }

    if (!response.ok) {
      throw new Error(`批量上传失败: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * 获取飞行员数据列表
   */
  async getPilots(skip: number = 0, limit: number = 100) {
    const response = await fetch(
      `${API_BASE_URL}/data/pilots?skip=${skip}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error('获取飞行员数据失败');
    }

    return response.json();
  },

  /**
   * 获取仪表板摘要数据
   */
  async getSummary(filters: { batch?: string; aircraftType?: string; rank?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.batch && filters.batch !== 'all') params.set('batch', filters.batch);
    if (filters.aircraftType && filters.aircraftType !== 'all') params.set('aircraft_type', filters.aircraftType);
    if (filters.rank && filters.rank !== 'all') params.set('rank', filters.rank);
    const query = params.toString();
    const response = await fetch(`${API_BASE_URL}/data/summary${query ? `?${query}` : ''}`);

    if (!response.ok) {
      throw new Error('获取摘要数据失败');
    }

    return response.json();
  },

  /**
   * 获取 AI 配置
   */
  async getAIConfig() {
    const response = await fetch(`${API_BASE_URL}/ai/config`);
    if (!response.ok) throw new Error('获取 AI 配置失败');
    return response.json();
  },

  /**
   * 保存 AI 配置
   */
  async saveAIConfig(config: { provider: string; api_key?: string; model?: string; base_url?: string }) {
    const response = await fetch(`${API_BASE_URL}/ai/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('保存 AI 配置失败');
    return response.json();
  },

  /**
   * 测试 AI 接口连通性
   */
  async testAIConnection(config?: { provider?: string; api_key?: string; model?: string; base_url?: string }) {
    const response = await fetch(`${API_BASE_URL}/ai/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {}),
    });
    if (!response.ok) throw new Error('测试 AI 连接响应异常');
    return response.json();
  },

  /**
   * AI 深度结构化分析
   */
  async generateAIDeepAnalysis(
    type: 'pilot_development' | 'examiner_quality' | 'cohort_training_demand',
    filters: { batch?: string; aircraftType?: string; rank?: string } = {},
    targetName?: string
  ) {
    const response = await fetch(`${API_BASE_URL}/ai/deep-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target_name: targetName, filters }),
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.detail || '生成 AI 深度分析报告失败');
    }
    return response.json();
  },

  /**
   * AI 分析 - 流式响应
   * 
   * 使用 Server-Sent Events 实时消费 AI 输出
   */
  async analyzeStream(
    prompt: string,
    onToken: (token: string) => void,
    filters: { batch?: string; aircraftType?: string; rank?: string } = {}
  ) {
    const response = await fetch(`${API_BASE_URL}/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, filters }),
    });

    if (!response.ok) {
      throw new Error('AI 分析失败');
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                onToken(data.token);
              }
              if (data.error) {
                throw new Error(data.error);
              }
              if (data.done) {
                return;
              }
            } catch (e) {
              if (e instanceof Error && e.message) {
                throw e;
              }
              console.error('解析流数据失败:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  /**
   * 获取上传文件列表
   */
  async getUploadedFiles() {
    const response = await fetch(`${API_BASE_URL}/files/list`);

    if (!response.ok) {
      throw new Error('获取文件列表失败');
    }

    return response.json();
  },

  /** 获取已导入文件（数据管理）。 */
  async getUploads() {
    const response = await fetch(`${API_BASE_URL}/uploads`);
    if (!response.ok) throw new Error('获取导入文件列表失败');
    return response.json();
  },

  /** 删除单个导入文件及其关联记录。 */
  async deleteUpload(uploadId: number) {
    const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('删除导入文件失败');
    return response.json();
  },

  /** 删除同一批次的全部导入文件及关联记录。 */
  async deleteBatch(sourceLabel: string) {
    const response = await fetch(`${API_BASE_URL}/batches/${encodeURIComponent(sourceLabel)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('删除批次失败');
    return response.json();
  },

  /**
   * 删除上传的文件
   */
  async deleteFile(fileId: number) {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('删除文件失败');
    }

    return response.json();
  },

  /**
   * 导出分析结果
   */
  async exportAnalysis(format: 'excel' | 'csv' = 'excel') {
    const response = await fetch(`${API_BASE_URL}/analysis/export?format=${format}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('导出失败');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis_result.${format === 'excel' ? 'xlsx' : 'csv'}`;
    a.click();
    window.URL.revokeObjectURL(url);
  },

  /**
   * 导出多 sheet 综合分析报告
   */
  async exportReport(filters: { threshold?: number; batch?: string | null; aircraft_type?: string | null; rank?: string | null } = {}) {
    const payload = {
      threshold: filters.threshold ?? 3,
      batch: filters.batch || null,
      aircraft_type: filters.aircraft_type || null,
      rank: filters.rank || null,
    };

    console.debug('[apiService] exportReport ->', { url: `${API_BASE_URL}/export/report`, payload });

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/export/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('[apiService] exportReport fetch error', err);
      throw err instanceof Error ? err : new Error('网络请求失败');
    }

    console.debug('[apiService] exportReport response', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[apiService] exportReport failed body', text);
      throw new Error('导出报告失败');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'EBT_Analysis_Report.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async exportAiAnalysisDoc() {
    console.debug('[apiService] exportAiAnalysisDoc ->', `${API_BASE_URL}/export/ai-analysis-doc`);
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/export/ai-analysis-doc`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('[apiService] exportAiAnalysisDoc fetch error', err);
      throw err instanceof Error ? err : new Error('网络请求失败');
    }

    console.debug('[apiService] exportAiAnalysisDoc response', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[apiService] exportAiAnalysisDoc failed body', text);
      throw new Error('AI 分析文档导出失败');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'EBT_AI_Analysis.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * 智能评语分析
   */
  async analyzeComments(filters: { batch?: string; aircraftType?: string; rank?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.batch && filters.batch !== 'all') params.set('batch', filters.batch);
    if (filters.aircraftType && filters.aircraftType !== 'all') params.set('aircraft_type', filters.aircraftType);
    if (filters.rank && filters.rank !== 'all') params.set('rank', filters.rank);
    const query = params.toString();
    const response = await fetch(`${API_BASE_URL}/analysis/comments${query ? `?${query}` : ''}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('评语分析失败');
    }

    return response.json();
  },

  /**
   * 获取筛选选项（批次、机型、技术等级等）
   */
  async getBatches() {
    const response = await fetch(`${API_BASE_URL}/data/batches`);

    if (!response.ok) {
      throw new Error('获取筛选选项失败');
    }

    return response.json();
  },

  /**
   * 获取胜任力 × 训练主题 热力矩阵
   */
  async getMatrixHeatmap(params: { threshold?: number | null; batch?: string | null; aircraft_type?: string | null; rank?: string | string[] | null } = {}) {
    const response = await fetch(`${API_BASE_URL}/matrix/heatmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('获取热力矩阵失败');
    }

    return response.json();
  },

  /**
   * 获取风险矩阵（胜任力×核心风险、训练主题×核心风险）
   */
  async getMatrixRisk(params: { threshold?: number | null; batch?: string | null; aircraft_type?: string | null; rank?: string | string[] | null } = {}) {
    const response = await fetch(`${API_BASE_URL}/matrix/risk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('获取风险矩阵失败');
    }

    return response.json();
  },

  /**
   * 获取单个飞行员的全部历史评估记录（按时间正序）
   */
  async getPilotHistory(pilotName: string, filters: { batch?: string; aircraftType?: string; rank?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.batch && filters.batch !== 'all') params.set('batch', filters.batch);
    if (filters.aircraftType && filters.aircraftType !== 'all') params.set('aircraft_type', filters.aircraftType);
    if (filters.rank && filters.rank !== 'all') params.set('rank', filters.rank);
    const query = params.toString();
    const response = await fetch(
      `${API_BASE_URL}/data/pilot/${encodeURIComponent(pilotName)}/history${query ? `?${query}` : ''}`
    );

    if (!response.ok) {
      throw new Error('获取飞行员历史记录失败');
    }

    return response.json();
  },

  /**
   * 获取教员 × 胜任力 平均评分热力图数据
   */
  async getExaminerHeatmap(batch?: string) {
    const query = batch && batch !== 'all' ? `?batch=${encodeURIComponent(batch)}` : '';
    const response = await fetch(`${API_BASE_URL}/examiner/heatmap${query}`);

    if (!response.ok) {
      throw new Error('获取教员热力图失败');
    }

    return response.json();
  },

  /**
   * 获取教员评语质量统计
   */
  async getExaminerQuality(batch?: string) {
    const query = batch && batch !== 'all' ? `?batch=${encodeURIComponent(batch)}` : '';
    const response = await fetch(`${API_BASE_URL}/examiner/quality${query}`);

    if (!response.ok) {
      throw new Error('获取教员评语质量失败');
    }

    return response.json();
  },

  /**
   * 获取桑基图数据
   */
  async getMatrixSankey(params: { type?: 'theme_risk' | 'three_stage'; batch?: string | null; aircraft_type?: string | null; rank?: string | string[] | null } = {}) {
    const response = await fetch(`${API_BASE_URL}/matrix/sankey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('获取桑基图数据失败');
    }

    return response.json();
  },
};

/**
 * React Hook: 使用 API 服务
 */
export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (apiFunc: () => Promise<any>) => {
    setLoading(true);
    setError(null);
    try {
      return await apiFunc();
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, execute, apiService };
};
