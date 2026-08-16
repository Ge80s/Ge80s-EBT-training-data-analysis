import { useRef, useState } from 'react';
import { Menu, Bell, Download, Upload, Loader2, FolderUp, Database, Trash2, X } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import { setFilters } from '../store/slices/dataSlice';
import { useData } from '../hooks/useData';
import { apiService } from '../services/api_service';

interface TopHeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export default function TopHeader({ sidebarOpen, setSidebarOpen }: TopHeaderProps) {
  const dispatch = useDispatch();
  const filters = useSelector((state: RootState) => state.data.filters);
  const { uploadMultipleFiles, deleteUpload, deleteBatch, loading, filterOptions } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [commonLabel, setCommonLabel] = useState('');
  const [showDataModal, setShowDataModal] = useState(false);
  const [uploads, setUploads] = useState<Array<{ id: number; filename: string; source_label: string; uploaded_at: string; row_count: number }>>([]);
  const [managingData, setManagingData] = useState(false);

  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await uploadMultipleFiles([file]);
        alert('文件上传并解析成功！');
      } catch (err) {
        alert('文件上传失败：' + (err instanceof Error ? err.message : '未知错误'));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles(files);
      setCommonLabel('');
      setShowLabelModal(true);
    }
    if (multiFileInputRef.current) multiFileInputRef.current.value = '';
  };

  const confirmBatchUpload = async () => {
    try {
      await uploadMultipleFiles(pendingFiles, commonLabel || undefined);
      setShowLabelModal(false);
      setPendingFiles([]);
      alert(`成功上传 ${pendingFiles.length} 个文件！`);
    } catch (err) {
      alert('批量上传失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const loadUploads = async () => {
    setManagingData(true);
    try {
      const data = await apiService.getUploads();
      setUploads(data.uploads || []);
      setShowDataModal(true);
    } catch (err) {
      alert('获取导入数据失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setManagingData(false);
    }
  };

  const removeUpload = async (upload: typeof uploads[number]) => {
    if (!window.confirm(`确定删除文件“${upload.filename}”及其 ${upload.row_count} 条关联评估记录吗？此操作不可恢复。`)) return;
    setManagingData(true);
    try {
      await deleteUpload(upload.id);
      setUploads(current => current.filter(item => item.id !== upload.id));
    } catch (err) {
      alert('删除失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setManagingData(false);
    }
  };

  const [exporting, setExporting] = useState(false);

  const removeBatch = async (sourceLabel: string, count: number) => {
    if (!window.confirm(`确定删除批次“${sourceLabel}”及其 ${count} 条文件记录吗？关联评估数据也将永久删除。`)) return;
    setManagingData(true);
    try {
      await deleteBatch(sourceLabel);
      setUploads(current => current.filter(item => item.source_label !== sourceLabel));
    } catch (err) {
      alert('删除批次失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setManagingData(false);
    }
  };

  const handleExportAiAnalysisDoc = async () => {
    setExporting(true);
    try {
      await apiService.exportAiAnalysisDoc();
    } catch (err) {
      alert('AI 分析导出失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 z-10 shadow-sm">
      <div className="flex items-center">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 mr-4 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Global Filters */}
        <div className="hidden md:flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-slate-500">批次:</label>
            <select
              value={filters.batch}
              onChange={(e) => dispatch(setFilters({ batch: e.target.value }))}
              className="text-sm border border-slate-300 rounded-md py-1.5 px-3 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-blue-400"
            >
              <option value="all">全部批次</option>
              {filterOptions.batches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-slate-500">机型:</label>
            <select
              value={filters.aircraftType}
              onChange={(e) => dispatch(setFilters({ aircraftType: e.target.value }))}
              className="text-sm border border-slate-300 rounded-md py-1.5 px-3 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-blue-400"
            >
              <option value="all">全部机型</option>
              {filterOptions.aircraftTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-slate-500">等级:</label>
            <select
              value={filters.rank}
              onChange={(e) => dispatch(setFilters({ rank: e.target.value }))}
              className="text-sm border border-slate-300 rounded-md py-1.5 px-3 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-blue-400"
            >
              <option value="all">全部等级</option>
              {filterOptions.ranks.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          ref={fileInputRef}
          onChange={handleSingleFileChange}
        />
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="hidden"
          ref={multiFileInputRef}
          onChange={handleMultiFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span className="hidden sm:inline">{loading ? '处理中...' : '导入数据'}</span>
        </button>
        <button
          onClick={loadUploads}
          disabled={managingData}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          {managingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          <span className="hidden sm:inline">数据管理</span>
        </button>
        <button
          onClick={() => multiFileInputRef.current?.click()}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderUp className="w-4 h-4" />}
          <span className="hidden sm:inline">批量导入</span>
        </button>
        <button
          type="button"
          onClick={handleExportAiAnalysisDoc}
          disabled={exporting}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="hidden sm:inline">导出 AI 报告</span>
        </button>
        <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors relative" title="通知">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
      </div>

      {/* Batch upload label modal */}
      {showLabelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-96">
            <h3 className="text-lg font-bold text-slate-800 mb-2">批量导入文件</h3>
            <p className="text-sm text-slate-500 mb-4">已选择 {pendingFiles.length} 个文件。可选：为所有文件指定统一的批次标签。</p>
            <input
              type="text"
              value={commonLabel}
              onChange={(e) => setCommonLabel(e.target.value)}
              placeholder="统一批次标签（可选）"
              className="w-full border border-slate-300 rounded-md py-2 px-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowLabelModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >取消</button>
              <button
                onClick={confirmBatchUpload}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >确认上传</button>
            </div>
          </div>
        </div>
      )}

      {showDataModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">数据管理</h3>
                <p className="text-sm text-slate-500 mt-1">删除操作会永久移除关联评估记录和原始导入文件。</p>
              </div>
              <button onClick={() => setShowDataModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="关闭数据管理"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              {uploads.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">暂无已导入数据。</p>
              ) : (
                Object.entries(uploads.reduce<Record<string, typeof uploads>>((groups, upload) => {
                  const label = upload.source_label || '未命名批次';
                  (groups[label] ||= []).push(upload);
                  return groups;
                }, {})).map(([label, batchUploads]) => (
                  <section key={label} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-800">{label}</p>
                        <p className="text-xs text-slate-500">{batchUploads.length} 个文件 · {batchUploads.reduce((sum, item) => sum + item.row_count, 0)} 条评估记录</p>
                      </div>
                      <button onClick={() => removeBatch(label, batchUploads.length)} disabled={managingData} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50">
                        <Trash2 className="w-4 h-4" /> 删除批次
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {batchUploads.map(upload => (
                        <div key={upload.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700 truncate">{upload.filename}</p>
                            <p className="text-xs text-slate-400">{upload.row_count} 条记录 · {upload.uploaded_at || '未知时间'}</p>
                          </div>
                          <button onClick={() => removeUpload(upload)} disabled={managingData} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">
                            <Trash2 className="w-4 h-4" /> 删除
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

