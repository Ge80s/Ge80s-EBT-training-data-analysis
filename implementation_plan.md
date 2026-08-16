# Implementation Plan - EBT Platform React Version Enhancements & Fixes

This plan addresses three key requirements for the React version (`EBT-Platform-React`) of the EBT Flight Data Analysis Platform:
1. **Data Management & Deletion**: Allow users to delete imported Excel/CSV data files and batches instead of keeping them permanently.
2. **Cross-Batch Rank Comparison**: In Group Benchmark Analysis, add support for comparing technical ranks across different batches (e.g., 2024-Q1 Captains vs 2024-Q2 Captains).
3. **Dashboard Filter Reactivity Fix**: Ensure changing top header filters (Batch, Aircraft Type, Technical Rank) dynamically updates all summary dashboard metrics.

---

## User Review Required

> [!NOTE]
> Deleting an imported file/batch will permanently remove the associated record and pilot evaluation entries from the SQLite database. A confirmation dialog will prompt the user before execution.

---

## Open Questions

None. The user directives and requirements are clear and unambiguous.

---

## Proposed Changes

### Backend Components

#### [MODIFY] [main.py](file:///d:/EBT训练数据分析工具/EBT-Platform-React/backend/main.py)
- **Data Deletion Endpoints**:
  - Add `GET /api/uploads`: List all uploaded files (`id`, `filename`, `source_label`, `uploaded_at`, `row_count`).
  - Add `DELETE /api/uploads/{upload_id}`: Delete `Upload` record and all associated `Pilot` records, as well as the file from disk if present.
  - Add `DELETE /api/batches/{source_label}`: Delete all `Upload` and `Pilot` records matching `source_label`.
- **Dashboard Filter Support**:
  - Update `GET /api/data/summary` to accept `batch`, `aircraft_type`, and `rank` query parameters.
  - Apply filtering to `db.query(Pilot)` before passing data to `calculate_statistics()`.

---

### Frontend Components

#### [MODIFY] [api_service.tsx](file:///d:/EBT训练数据分析工具/EBT-Platform-React/src/services/api_service.tsx)
- Update `getSummary(filters)` to serialize query params (`batch`, `aircraft_type`, `rank`).
- Add `getUploads()`, `deleteUpload(uploadId)`, and `deleteBatch(sourceLabel)`.

#### [MODIFY] [useData.ts](file:///d:/EBT训练数据分析工具/EBT-Platform-React/src/hooks/useData.ts)
- Add automatic re-fetching of `summary` whenever `filters.batch`, `filters.aircraftType`, or `filters.rank` change.
- Expose `deleteUpload` and `deleteBatch` helper functions that auto-refresh `fetchDashboardData()`.

#### [MODIFY] [TopHeader.tsx](file:///d:/EBT训练数据分析工具/EBT-Platform-React/src/components/TopHeader.tsx)
- Add a "数据管理" (Data Management) button next to "导入数据".
- Create a Data Management Modal listing all uploaded batches/files with record count, upload date, and a red "删除" button with confirmation modal.
- On deletion success, refresh dashboard data.

#### [MODIFY] [ComparativeAnalysis.tsx](file:///d:/EBT训练数据分析工具/EBT-Platform-React/src/pages/ComparativeAnalysis.tsx)
- Add `'batch_rank'` (跨批次层级) to `GroupBy` options.
- Generate composite option labels (e.g. `[2024-Q1] 机长`, `[2024-Q1] 副驾驶`, `[2024-Q2] 机长`).
- Support filtering pilots by `source_label` and `technical_rank` combination in pairwise and multi-group mode.
- Update summary cards and tooltips to clearly reflect cross-batch rank labels.

---

## Verification Plan

### Automated / Syntax Tests
- Run TypeScript type checks (`npx tsc --noEmit` in `EBT-Platform-React`).

### Manual Verification
1. **Filter Reactivity**:
   - Open Total Dashboard (`/dashboard`).
   - Change Batch / Aircraft Type / Rank in Top Header filter dropdowns.
   - Verify KPI cards, Radar chart, and Score distribution change dynamically.
2. **Data Management & Deletion**:
   - Click "数据管理" in Top Header.
   - View list of uploaded files/batches.
   - Click Delete on a batch -> Confirm.
   - Verify batch is removed, total pilot count decreases, and dropdown filters update immediately.
3. **Cross-Batch Rank Comparison**:
   - Open Group Benchmark Analysis (`/comparative`).
   - Select "跨批次层级" (Batch & Rank) in Compare Dimension.
   - Select Group A: `[批次1] 机长`, Group B: `[批次2] 机长`.
   - Verify bar charts, radar charts, and score differences compute accurately between the two rank-batch cohorts.
