# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**EBT 飞行训练多维分析系统 v1.1** — A Streamlit-based analytics dashboard for Evidence-Based Training (EBT) flight data. It processes pilot evaluation Excel/CSV files and renders a 6-tab interactive dashboard in Chinese.

The user intends this tool to be treated with the rigor of an aviation data analysis expert. Correctness and data fidelity are paramount over convenience or shortcuts.

## Running the App

```bash
# Development
streamlit run app.py

# Windows (auto-installs deps then launches)
启动文件.bat
```

## Building the Executable

```bash
pyinstaller EBT_System.spec
# Output: dist/EBT_Analysis.exe
```

## Installing Dependencies

```bash
pip install streamlit pandas plotly jieba openpyxl -i https://pypi.tuna.tsinghua.edu.cn/simple
```

## Architecture

All application logic lives in a single file: **`app.py`** (~730 lines). There are no submodules.

**`run_app.py`** is only a PyInstaller-compatible launcher — do not add logic here.

### Data pipeline inside `app.py`

1. **`load_single_file()`** (lines 14–130) — reads one Excel/CSV file, parses the dual-row header, auto-maps columns to canonical names (姓名, 检查时间, 机型, 技术等级, …), extracts the 9 competency scores and OB (Observed Behavior) items. This is the most critical function; column-name mapping must remain robust to upstream formatting variation.

2. **`analyze_comments_smart()`** (lines 133–156) — Jieba-based NLP over instructor comments, producing keyword frequency and categorised risk tags (进近/落地, 自动化, 非正常, SOP/CRM, 复飞/爬升).

3. **`calc_comment_quality()`** (lines 158–168) — simple scoring heuristic for comment depth.

4. **Main UI block** (lines 170–729) — sidebar filters (data source, aircraft type, technical rank) feed into six `st.tabs`:
   - Tab 1 📊 Summary Dashboard — aggregate metrics, radar charts
   - Tab 2 🆚 Comparative Analysis — cross-batch comparisons
   - Tab 3 👨‍✈️ Individual Profile — per-pilot radar, trend lines, OB history
   - Tab 4 🧠 Smart Comments — group NLP analysis, AI prompt generation
   - Tab 5 🔍 OB Analysis — behavioral observation trends
   - Tab 6 👨‍🏫 Examiner Analysis — grading strictness, comment quality

### Competency Dimensions

Nine dimensions with short codes used throughout charts:

| Code | Full Name |
|------|-----------|
| KNO | 知识运用 |
| PRO | 程序执行 |
| FPA | 飞行航迹管理-自动 |
| FPM | 飞行航迹管理-手动 |
| COM | 沟通 |
| LTW | 领导力与团队合作 |
| SAW | 情景意识 |
| WLM | 工作负荷管理 |
| PSD | 问题解决与决策 |

OB items appear as 赞 (positive) / 踩 (negative) marks.

## Key Constraints

- **Chinese-first**: All UI text, column headers in source data, and NLP processing are in Chinese. Do not replace Chinese strings with English equivalents unless asked.
- **Dual-header Excel**: Source files use a two-row header scheme. `load_single_file()` handles this — changes here must preserve backwards compatibility with the three sample `.xlsx` files in the repo root.
- **Encoding**: File ingestion tries UTF-8, GBK, GB18030 in sequence. Maintain this fallback chain.
- **PyInstaller compatibility**: Any new dependency must be added to the `hiddenimports` and `collect_all` lists in `EBT_System.spec`, and any data files must be added to `datas`.
- **No test suite exists.** Manual validation against the sample Excel files is the only verification path.
