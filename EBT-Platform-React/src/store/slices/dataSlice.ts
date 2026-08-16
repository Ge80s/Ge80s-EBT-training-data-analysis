import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export interface PilotData {
  id: number;
  name: string;
  check_date: string;
  aircraft_type: string;
  technical_rank: string;
  scores: Record<string, number>;
  ob_items: { label: string; mark: '赞' | '踩' }[];
  comments: string;
  examiner: string;
  source_label: string;
  training_type: string;
  overall_result: string;
  final_conclusion: string;
  upload_id: number;
}

export interface SummaryData {
  total_pilots: number;
  average_scores: Record<string, number>;
  overall_average: number;
  score_distribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  risk_count: number;
  risk_pilots: string[];
  data_sources: number;
  last_updated: string;
}

export interface FilterOptions {
  batches: string[];
  aircraftTypes: string[];
  ranks: string[];
  trainingTypes: string[];
  examiners: string[];
}

interface DataState {
  pilots: PilotData[];
  summary: SummaryData | null;
  loading: boolean;
  error: string | null;
  filters: {
    batch: string;
    aircraftType: string;
    rank: string;
  };
  filterOptions: FilterOptions;
}

const loadFiltersFromStorage = () => {
  try {
    const saved = localStorage.getItem('ebt_filters');
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return { batch: 'all', aircraftType: 'all', rank: 'all' };
};

const initialState: DataState = {
  pilots: [],
  summary: null,
  loading: false,
  error: null,
  filters: loadFiltersFromStorage(),
  filterOptions: {
    batches: [],
    aircraftTypes: [],
    ranks: [],
    trainingTypes: [],
    examiners: [],
  },
};

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setPilots: (state, action: PayloadAction<PilotData[]>) => {
      state.pilots = action.payload;
    },
    setSummary: (state, action: PayloadAction<SummaryData>) => {
      state.summary = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<DataState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
      try {
        localStorage.setItem('ebt_filters', JSON.stringify(state.filters));
      } catch {
        // ignore
      }
    },
    setFilterOptions: (state, action: PayloadAction<Partial<FilterOptions>>) => {
      state.filterOptions = { ...state.filterOptions, ...action.payload };
    },
  },
});

export const { setLoading, setError, setPilots, setSummary, setFilters, setFilterOptions } = dataSlice.actions;
export default dataSlice.reducer;
