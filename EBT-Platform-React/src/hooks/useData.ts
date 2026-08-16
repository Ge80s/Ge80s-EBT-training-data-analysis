import { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import { apiService } from '../services/api_service';
import { setLoading, setError, setPilots, setSummary, setFilterOptions, setFilters } from '../store/slices/dataSlice';

export const useData = ({ autoFetch = false }: { autoFetch?: boolean } = {}) => {
  const dispatch = useDispatch();
  const { pilots, summary, loading, error, filters, filterOptions } = useSelector((state: RootState) => state.data);

  const fetchDashboardData = useCallback(async () => {
    dispatch(setLoading(true));
    try {
      // Parallel fetch summary, pilots and filter options
      const [summaryData, pilotsData, batchesData] = await Promise.all([
        apiService.getSummary(filters),
        apiService.getPilots(0, 2000), // fetch all for now
        apiService.getBatches()
      ]);

      dispatch(setSummary(summaryData));
      dispatch(setPilots(pilotsData.pilots || []));
      dispatch(setFilterOptions({
        batches: batchesData.batches || [],
        aircraftTypes: batchesData.aircraft_types || [],
        ranks: batchesData.ranks || [],
        trainingTypes: batchesData.training_types || [],
        examiners: batchesData.examiners || [],
      }));
      // 删除数据后，已不存在的筛选值应立即回到“全部”，避免下拉框保留失效选项。
      const validFilters: Partial<typeof filters> = {};
      if (filters.batch !== 'all' && !(batchesData.batches || []).includes(filters.batch)) validFilters.batch = 'all';
      if (filters.aircraftType !== 'all' && !(batchesData.aircraft_types || []).includes(filters.aircraftType)) validFilters.aircraftType = 'all';
      if (filters.rank !== 'all' && !(batchesData.ranks || []).includes(filters.rank)) validFilters.rank = 'all';
      if (Object.keys(validFilters).length) dispatch(setFilters(validFilters));
      dispatch(setError(null));
    } catch (err) {
      dispatch(setError(err instanceof Error ? err.message : '获取数据失败'));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, filters]);

  // 仅由应用布局启用，避免同一页面的多个组件重复请求。
  useEffect(() => {
    if (autoFetch) void fetchDashboardData();
  }, [autoFetch, fetchDashboardData]);

  const uploadFile = async (file: File, sourceLabel?: string) => {
    dispatch(setLoading(true));
    try {
      await apiService.uploadFile(file, sourceLabel);
      // Refresh data after upload
      await fetchDashboardData();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      dispatch(setError(msg));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  };

  const uploadMultipleFiles = async (files: File[], sourceLabel?: string) => {
    dispatch(setLoading(true));
    const results = [];
    try {
      const result = await apiService.uploadMultipleFiles(files, sourceLabel);
      results.push(...(result.results || []));
      await fetchDashboardData();
      return results;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      dispatch(setError(msg));
      throw err;
    } finally {
      dispatch(setLoading(false));
    }
  };

  const deleteUpload = async (uploadId: number) => {
    await apiService.deleteUpload(uploadId);
    await fetchDashboardData();
  };

  const deleteBatch = async (sourceLabel: string) => {
    await apiService.deleteBatch(sourceLabel);
    await fetchDashboardData();
  };

  // Filtered pilots based on current filters
  const filteredPilots = useMemo(() => {
    return pilots.filter(pilot => {
      if (filters.batch !== 'all' && pilot.source_label !== filters.batch) return false;
      if (filters.aircraftType !== 'all' && pilot.aircraft_type !== filters.aircraftType) return false;
      if (filters.rank !== 'all' && pilot.technical_rank !== filters.rank) return false;
      return true;
    });
  }, [pilots, filters.batch, filters.aircraftType, filters.rank]);

  return {
    pilots: filteredPilots,
    allPilots: pilots,
    summary,
    loading,
    error,
    filters,
    filterOptions,
    fetchDashboardData,
    uploadFile,
    uploadMultipleFiles,
    deleteUpload,
    deleteBatch,
  };
};
