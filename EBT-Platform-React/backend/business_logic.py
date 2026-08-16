"""
业务逻辑服务层 - 从 Streamlit app.py 迁移的核心函数

这些函数包含所有的数据处理、分析、NLP 逻辑
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Tuple
import jieba
import re
import json
from collections import Counter
import os

from constants import (
    COMPETENCY_CODES,
    COMPETENCY_NAMES,
    COMPETENCY_COL_MAP,
    COMPETENCY_KEYWORDS,
    COMPETENCY_POSITIONAL,
    EBT_SCENARIO_KEYWORDS_HIERARCHICAL,
    EBT_SCENARIO_KEYWORDS,
    NEGATION_WORDS,
    THEME_ORDER,
    SCENARIO_TO_CORE_RISK,
    RISK_NAMES,
    RISK_ORDER,
    OB_KEYS,
)

# ==================== 数据加载与处理 ====================

def load_single_file(file_path: str, source_label: str = None) -> Dict:
    """
    从 Excel/CSV 文件加载单个数据源，采用极其鲁棒的表头映射与 OB 提取机制。

    参数:
        file_path: 文件路径
        source_label: 数据来源/批次标签，默认取文件名（不含扩展名）

    返回结构：
    {
        'pilots': [{
            'name': str,
            'check_date': str, # YYYY-MM-DD
            'aircraft_type': str,
            'technical_rank': str,
            'scores': {'KNO': 4.2, 'PRO': 3.8, ...},
            'ob_items': [{'label': 'COM - OB1_xxx', 'mark': '赞'}, ...],
            'comments': str,
            'examiner': str,
            'source_label': str,
            'training_type': str,
            'overall_result': str,
            'final_conclusion': str
        }, ...],
        'error': None or error_message
    }
    """
    try:
        df_raw = None
        file_name = os.path.basename(file_path)
        if source_label is None:
            source_label = os.path.splitext(file_name)[0]

        # 尝试多种编码读取
        encodings = ['utf-8', 'gbk', 'gb18030']
        if file_name.endswith('.csv'):
            for encoding in encodings:
                try:
                    df_raw = pd.read_csv(file_path, header=None, encoding=encoding, engine='python')
                    break
                except Exception:
                    continue
        else:
            df_raw = pd.read_excel(file_path, header=None)
            
        if df_raw is None or len(df_raw) < 3:
            return {'pilots': [], 'error': '无法读取文件或数据行数过少。'}

        # 解析双行表头
        header_0 = df_raw.iloc[0].astype(str).replace('nan', '').str.strip()
        header_1 = df_raw.iloc[1].astype(str).replace('nan', '').str.strip()

        valid_competency_headers = {
            '知识运用', '程序应用和遵守规章', '程序执行', '程序应用', '程序遵守',
            '自动航径管理', '自动航径', '自动化航径', '人工航径管理', '人工航径', '手动航径',
            '沟通', '领导力和团队合作', '情景意识与信息管理', '情景意识', '工作负荷管理',
            '工作负荷', '问题解决和决策', '问题解决',
            'KNO', 'PRO', 'FPA', 'FPM', 'COM', 'LTW', 'SAW', 'WLM', 'PSD'
        }

        current_cat = ""
        new_header_0 = []
        for h0, h1 in zip(header_0, header_1):
            if h0:
                current_cat = h0
            elif h1 and h1 in valid_competency_headers:
                current_cat = h1
            new_header_0.append(current_cat)
            
        final_cols = []
        col_counts = {}
        
        for h0, h1 in zip(new_header_0, header_1):
            if h1 == "" or h1 == h0:
                col_name = h0
            else:
                col_name = f"{h0}_{h1}"
            
            if not col_name:
                col_name = "Unknown"
            
            if col_name in col_counts:
                col_counts[col_name] += 1
                col_name = f"{col_name}.{col_counts[col_name]}"
            else:
                col_counts[col_name] = 0
                
            final_cols.append(col_name)
            
        df = df_raw.iloc[2:].reset_index(drop=True)
        df.columns = final_cols
        
        # 识别【姓名】列
        name_col = next((c for c in df.columns if '姓名' in c and '检查员' not in c), None)
        if not name_col:
            name_col = next((c for c in df.columns if '姓名' in c), None)
        if not name_col:
            return {'pilots': [], 'error': '未找到【姓名】列。'}

        df = df[df[name_col].notna()]
        df = df[df[name_col].astype(str) != name_col]

        # 重映射列
        rename_map = {name_col: '姓名'}
        date_col = next((c for c in df.columns if '时间' in c or '日期' in c), None)
        if date_col:
            rename_map[date_col] = '检查时间'
        fleet_col = next((c for c in df.columns if '机型' in c and '训练' not in c), None)
        if fleet_col:
            rename_map[fleet_col] = '机型'
        rank_col = next((c for c in df.columns if '等级' in c or '技术' in c), None)
        if rank_col:
            rename_map[rank_col] = '技术等级'
        
        total_cols = len(df.columns)
        if total_cols > 9:
            rename_map[df.columns[9]] = '训练类型'
        else:
            type_col = next((c for c in df.columns if '类型' in c or '性质' in c), None)
            if type_col:
                rename_map[type_col] = '训练类型'

        if total_cols > 13:
            rename_map[df.columns[13]] = '检查员工号'
        if total_cols > 14:
            rename_map[df.columns[14]] = '检查员姓名'
        else:
            inst_name = next((c for c in df.columns if '检查员' in c and '姓名' in c), None)
            if inst_name:
                rename_map[inst_name] = '检查员姓名'
        if total_cols > 25:
            rename_map[df.columns[25]] = '总体合格率结果'
        if total_cols > 27:
            rename_map[df.columns[27]] = '最终结论分布'

        df = df.rename(columns=rename_map)

        # 胜任力列名称与代码映射
        competency_cols = list(COMPETENCY_COL_MAP.keys())
        comp_map = COMPETENCY_COL_MAP.copy()

        # 1. 尝试精确名称匹配
        available_comp_cols = []
        for col in competency_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                if df[col].notna().sum() > 0:
                    available_comp_cols.append(col)

        # 2. 模糊匹配
        if not available_comp_cols:
            extra_rename = {}
            found_canonical = set()
            for col in df.columns:
                for kw, canonical in COMPETENCY_KEYWORDS:
                    if kw in col and canonical not in found_canonical:
                        extra_rename[col] = canonical
                        found_canonical.add(canonical)
                        break
            if extra_rename:
                df = df.rename(columns=extra_rename)
                for canonical in found_canonical:
                    if canonical in df.columns:
                        df[canonical] = pd.to_numeric(df[canonical], errors='coerce')
                        if df[canonical].notna().sum() > 0:
                            available_comp_cols.append(canonical)

        # 3. 按位置回退
        if not available_comp_cols and total_cols > 23:
            pos_rename = {}
            for i, canonical in enumerate(COMPETENCY_POSITIONAL):
                orig = df.columns[15 + i]
                if canonical not in df.columns:
                    pos_rename[orig] = canonical
            if pos_rename:
                df = df.rename(columns=pos_rename)
            for canonical in COMPETENCY_POSITIONAL:
                if canonical in df.columns:
                    df[canonical] = pd.to_numeric(df[canonical], errors='coerce')
                    if df[canonical].notna().sum() > 0:
                        available_comp_cols.append(canonical)

        # OB 列检测
        ob_cols_list = []
        # 策略1
        for col in df.columns:
            if "OB" in col and "评语" not in col and "_" in col:
                parts = col.split("_")
                if len(parts) >= 2:
                    competency = parts[0]
                    if competency == '' or competency.lower() == 'nan' or competency not in valid_competency_headers:
                        col_idx = df.columns.get_loc(col)
                        for i in range(col_idx - 1, -1, -1):
                            prev_col = df.columns[i]
                            if "_" in prev_col:
                                prev_parts = prev_col.split("_")
                                if len(prev_parts) >= 2 and prev_parts[0] in valid_competency_headers:
                                    competency = prev_parts[0]
                                    break
                        else:
                            competency = 'Unknown'
                    ob_cols_list.append({
                        'col_name': col,
                        'competency': comp_map.get(competency, competency),
                        'ob_item': parts[1]
                    })
        # 策略2
        if not ob_cols_list:
            ap_start = 41
            for col_idx, col in enumerate(df.columns):
                if col_idx < ap_start:
                    continue
                if any(skip in col for skip in ('评语', '评价', '总体', '结论', '合格')):
                    continue
                cell_vals = df[col].astype(str)
                if cell_vals.str.contains('赞|踩', na=False).any():
                    parts = col.split("_") if "_" in col else [col, f"行为{col_idx - ap_start + 1}"]
                    competency = parts[0]
                    if competency == '' or competency.lower() == 'nan' or competency not in valid_competency_headers:
                        for i in range(col_idx - 1, -1, -1):
                            prev_col = df.columns[i]
                            if "_" in prev_col:
                                prev_parts = prev_col.split("_")
                                if len(prev_parts) >= 2 and prev_parts[0] in valid_competency_headers:
                                    competency = prev_parts[0]
                                    break
                        else:
                            competency = 'Unknown'
                    ob_cols_list.append({
                        'col_name': col,
                        'competency': comp_map.get(competency, competency),
                        'ob_item': parts[-1]
                    })

        # 收集评论候选列
        candidate_keywords = ['总体','评语','评价','备注','飞行阶段','说明','Comment','Remark']
        comment_cols = [c for c in df.columns if any(k in str(c) for k in candidate_keywords)]
        if not comment_cols and len(df.columns) > 26:
            comment_cols = [df.columns[26]]
        if not comment_cols:
            comment_cols = [c for c in df.columns if ('评价' in str(c) or '评语' in str(c))]

        # 收集飞行员数据
        pilots = []
        for idx, row in df.iterrows():
            # 格式化日期
            date_val = ""
            if '检查时间' in df.columns:
                val = row['检查时间']
                if pd.notna(val):
                    if isinstance(val, datetime):
                        date_val = val.strftime('%Y-%m-%d')
                    else:
                        try:
                            date_val = pd.to_datetime(val).strftime('%Y-%m-%d')
                        except Exception:
                            date_val = str(val)[:10]

            # 评分提取
            scores = {}
            for col in available_comp_cols:
                code = comp_map.get(col, col)
                val = row[col]
                try:
                    scores[code] = float(val) if pd.notna(val) else 0.0
                except (ValueError, TypeError):
                    scores[code] = 0.0
            
            # OB 提取
            ob_items = []
            for ob in ob_cols_list:
                col_name = ob['col_name']
                cell_val = str(row.get(col_name, ''))
                if '赞' in cell_val:
                    ob_items.append({
                        'label': f"{ob['competency']} - {ob['ob_item']}",
                        'mark': '赞'
                    })
                elif '踩' in cell_val:
                    ob_items.append({
                        'label': f"{ob['competency']} - {ob['ob_item']}",
                        'mark': '踩'
                    })

            # 评语合并
            comment_vals = []
            for col in comment_cols:
                val = row.get(col)
                if pd.notna(val) and str(val).strip() not in ('', 'nan'):
                    comment_vals.append(str(val).strip())
            comments_str = " | ".join(comment_vals) if comment_vals else ""

            pilot_data = {
                'name': str(row['姓名']).strip(),
                'check_date': date_val,
                'aircraft_type': str(row.get('机型', '')).strip(),
                'technical_rank': str(row.get('技术等级', '')).strip(),
                'scores': scores,
                'ob_items': ob_items,
                'comments': comments_str,
                'examiner': str(row.get('检查员姓名', '')).strip(),
                'source_label': source_label,
                'training_type': str(row.get('训练类型', '')).strip(),
                'overall_result': str(row.get('总体合格率结果', '')).strip(),
                'final_conclusion': str(row.get('最终结论分布', '')).strip(),
            }
            pilots.append(pilot_data)

        return {'pilots': pilots, 'error': None}
        
    except Exception as e:
        return {'pilots': [], 'error': str(e)}


# ==================== 训练主题分类 ====================

def classify_scenario_by_keyword(text: str) -> str:
    """
    改进的关键词分类算法：采用分层加权计分制并加入兜底匹配。
    - L0 (核心词) 权重=3
    - L1 (重要词) 权重=2
    - L2 (上下文词) 权重=1

    返回最匹配的训练主题名称；若无法匹配返回 '其他'。
    """
    if not text or str(text).strip() in ('', 'nan', 'None'):
        return '其他'

    raw_text = str(text)
    text_lower = raw_text.lower()

    has_negation = any(neg in text_lower for neg in NEGATION_WORDS)

    scores = {}
    for scenario, layers in EBT_SCENARIO_KEYWORDS_HIERARCHICAL.items():
        score = 0.0
        score += sum(1 for kw in layers.get("L0", []) if kw.lower() in text_lower) * 3
        score += sum(1 for kw in layers.get("L1", []) if kw.lower() in text_lower) * 2
        score += sum(1 for kw in layers.get("L2", []) if kw.lower() in text_lower) * 1
        if has_negation and 0 < score < 5:
            score *= 0.5
        if score > 0:
            scores[scenario] = score

    if scores:
        best_scenario = max(scores, key=scores.get)
        if scores[best_scenario] >= 1.0:
            return best_scenario

    # 兜底：分词匹配
    try:
        tokens = jieba.lcut(raw_text)
    except Exception:
        tokens = raw_text.split()

    token_hits = {}
    for t in tokens:
        if len(t) <= 1:
            continue
        tl = t.lower()
        for scenario, kws in EBT_SCENARIO_KEYWORDS.items():
            if any(k.lower() == tl or tl in k.lower() for k in kws):
                token_hits[scenario] = token_hits.get(scenario, 0) + 1

    if token_hits:
        return max(token_hits, key=token_hits.get)

    return '其他'


def classify_scenarios_batch(comments: List[str]) -> List[str]:
    """批量对评语进行关键词分类，返回主题列表。"""
    return [classify_scenario_by_keyword(c) for c in comments]


# ==================== OB 行为提取 ====================

def extract_obs_from_text(comment: str, comp_code: str) -> List[str]:
    """
    从评语中提取 OB 行为指标。
    1. 优先匹配显式标签（如 OB1、OB-2）。
    2. 否则使用 OB_KEYS 词库进行语义匹配。
    """
    if not comment or str(comment).strip() in ("nan", "无", "-", ""):
        return []

    # 显式标签
    explicit = re.findall(r'OB[-\s]?0?([1-9])', str(comment), re.IGNORECASE)
    if explicit:
        return list(set(f"{comp_code}-OB{m}" for m in explicit))

    # NLP 语义匹配
    nlp_obs = []
    if comp_code in OB_KEYS:
        for ob_id, kws in OB_KEYS[comp_code].items():
            if any(kw in str(comment) for kw in kws):
                nlp_obs.append(f"{comp_code}-{ob_id.split('_')[0]}")

    return list(set(nlp_obs))


# ==================== 评语质量评分 ====================

def calc_comment_quality(comment: str) -> Dict:
    """
    计算单条评语的质量指标。
    返回字数、关键词命中数、质量等级。
    """
    if not comment or str(comment).strip() in ('', 'nan'):
        return {'length': 0, 'keyword_score': 0, 'quality_level': 'empty'}

    text = str(comment)
    length = len(text)
    keywords = ['着陆', '进近', '自动', '单发', '失效', 'SOP', '喊话', '复飞', '爬升',
                '沟通', '程序', 'CRM', '决策', '负荷', '情景意识', '标准', '检查单']
    keyword_score = sum(1 for k in keywords if k in text)

    if length >= 80 and keyword_score >= 2:
        quality_level = 'high'
    elif length >= 40 or keyword_score >= 1:
        quality_level = 'medium'
    elif length > 0:
        quality_level = 'low'
    else:
        quality_level = 'empty'

    return {'length': length, 'keyword_score': keyword_score, 'quality_level': quality_level}


# ==================== NLP 分析 ====================

def analyze_comments_smart(comments: List[str]) -> Dict:
    """
    基于民航标准 (ICAO / IATA / Doc 9995) 的多维智能评语 NLP 分析。

    返回：
    {
        'total_comments': int,
        'keywords': [{'word': str, 'frequency': int}],
        'iata_risk': {'CFIT': int, 'LOC-I': int, ...},
        'icao_threat': {'威胁识别': int, ...},
        'flight_phase': {'进近': int, ...},
        'doc9995_theme': {'自动化依赖与FMA失察': int, ...},
        'risk_tags': {'进近与着陆': int, ...}, # 向后兼容
        'sentiment': 'mixed',
        'full_text': str
    }
    """
    text_series = pd.Series(comments).dropna().astype(str)
    valid_comments = text_series[text_series.str.strip() != ''].tolist()
    full_text = " ".join(valid_comments)

    clean_text = re.sub(r'[^\w\s]', '', full_text)
    words = jieba.lcut(clean_text)
    stop = ['的', '了', '在', '是', '和', '对', '及', '与', '等', '有', '未',
            '能够', '进行', '需', '加强', '建议', '优点', '不足', 'OB',
            '1', '2', '3', '4', '5', '0', '没有', '使用', '完成', '检查',
            '程序', '情况', '操作', '执行', '总体', '评价', '飞行', '训练', 'nan', '注意']
    filtered = [w for w in words if len(w) > 1 and w not in stop]
    word_counts = Counter(filtered).most_common(20)
    keywords = [{'word': kw, 'frequency': cnt} for kw, cnt in word_counts]

    # 1. IATA 风险分类
    iata_scenarios = {
        "CFIT (可控撞地)": ['CFIT', '撞地', '地形', '近地警告', 'GPWS', 'TAWS', '五边', '下滑道', '盲降', '高度失察', '偏低', '拉陡', '拉平', '高度'],
        "LOC-I (空中失控)": ['LOCI', '失控', '失速', '大姿态', '倾角', '滚转', '非预期', '气动', '极限', '舵面', '失速警告', '姿态', '仰角', '俯仰', '修正粗暴', '操纵'],
        "RE (跑道冲出/偏出)": ['RE', '冲出', '偏出', '接地过远', '长接地', '刹车', '反推', '滑行道', '湿滑', '积水', '大侧风接地', '偏远', '脱离', '减速', '接地'],
        "MAC (空中相撞)": ['MAC', '相撞', 'TCAS', '空中间隔', '防撞', '调频', '防防撞', '危险接近', 'RA告警', 'TA告警', '避让'],
        "RI (跑道侵入)": ['RI', '跑道侵入', '穿越跑道', '误入', '等待线', '地面冲突', '指令偏差', '未经许可'],
        "TURB (强颠簸/风切变)": ['TURB', '颠簸', '积雨云', '雷雨', '风切变', '结冰', '大风', '侧风', '下击暴流', '气流', '阵风', '低能见', '雾'],
        "SYS (系统/部件故障)": ['SYS', '故障', '失效', '火警', '液压', '电气', '发动机', '单发', '警告', 'ECAM', 'EICAS', '发告警', '防冰', '过火警', '起落架']
    }

    # 2. ICAO 事故/威胁分类 (TEM)
    icao_scenarios = {
        "环境与航线威胁 (Threats)": ['环境', '天气', 'ATC', '管制', '复杂机场', '夜间', '时限', '地形', '鸟击', '繁忙', '雷雨', '侧风', '拥堵'],
        "机组操作差错 (Errors)": ['差错', '失误', '看错', '漏做', '误按', '误拔', '操作不当', '偏差', '遗漏', '混乱', '误解', '迟缓', '粗暴'],
        "恶劣天气影响 (Weather)": ['雷雨', '风切变', '结冰', '低能见', '大侧风', '颠簸', '雾', '强降水', '云', '阵风'],
        "机载系统与设备 (Systems)": ['单发', '故障', '火警', '液压', '警告', '失效', '减速板', '显示异常', '检查单', '起落架', '告警', 'ECAM'],
        "SOP与标准规范 (SOP)": ['SOP', '喊话', '检查单', '标准', '简令', '交叉检查', '偏离', '规范', '呼唤', '预位', '证实', '动作', '程序'],
        "CRM与团队沟通 (CRM)": ['CRM', '沟通', '协同', '主导', '倾听', '断层', '配合', '组长', '交流', '提醒', '决策', '接管', '表达']
    }

    # 3. 飞行阶段分类
    flight_phases = {
        "地面准备/滑行": ['航前', '地面', '滑行', '推车', '始发', '准备', '离块', '开车', '离场前的', '检查单', '离场'],
        "起飞/初始爬升": ['起飞', '离地', 'V1', 'VR', 'V2', '中断起飞', '初始爬升', '起飞滑跑', '抬前轮', '收轮', '收襟翼'],
        "巡航/下降": ['巡航', '改平', '下降', '顶高', '梯次', '过渡', '减速', '高高度', '巡航阶段'],
        "进近阶段": ['进近', '五边', '盲降', '下滑道', '复飞点', '目视进近', '截获', '高进近', 'RNP', '进近阶段'],
        "着陆/接地": ['着陆', '接地', '拉平', '反推', '刹车', '减速', '姿态Hold', '触地', '脱离', '接地位置'],
        "复飞阶段": ['复飞', '中断进近', '拉升', 'Go Around', '复飞爬升', 'TOGA', '复飞程序']
    }

    # 4. ICAO Doc 9995 评估与训练主题矩阵 (Official Doc 9995 Assessment & Training Themes)
    doc9995_themes = {
        "恶劣天气与环境 (Adverse Weather)": ['雷雨', '风切变', '结冰', '低能见', '大侧风', '颠簸', '下击暴流', '强阵风', '雾', '恶劣天气', '气流'],
        "航空器系统故障 (Aircraft Systems)": ['系统故障', '液压', '电气', '降级', 'ECAM', 'EICAS', 'MEL', '显示器', '控制卡阻', '减速板', '放气故障', '故障'],
        "发动机故障与失灵 (Engine Failures)": ['发动机故障', '单发', 'V1以上', 'V1以下', '发动机失灵', '推力损失', '停车', '切油', '推力'],
        "火灾与烟雾处置 (Fire & Smoke)": ['火灾', '烟雾', '起火', '货舱起火', '客舱起火', '驾驶舱烟雾', '烟气', '过热', '火警'],
        "失常状态矫正 (UPRT / Upset)": ['失常状态', '失速', '大姿态', '倾角', '超速', '尾流', '失速恢复', '俯仰', '姿态矫正', '修正粗暴', '姿态'],
        "地形防撞与 GPWS (Terrain / TAWS)": ['地形', 'GPWS', 'TAWS', '近地警告', '地形回避', '离地高度', '山地', '高度'],
        "空中交通与 TCAS 避让 (Traffic / TCAS)": ['TCAS', '交通冲突', '防撞', '决断咨询', 'RA告警', '间隔损失', '空中交通', '回避'],
        "导航降级与失效 (Navigation)": ['导航故障', 'GPS丢失', 'RNP', 'ANP', '导航降级', '外部导航', '盲降信号', 'FMA', 'VNAV', 'LNAV', '自动化'],
        "通信失效与 ATC 差错 (Comms & ATC)": ['通信失效', 'ATC差错', '频率拥堵', '指令误传', '备用通信', '陆空通话', '呼号', 'ATC', '沟通'],
        "装载/燃油/性能差错 (Flight Prep & Fuel)": ['装载差错', '燃油泄漏', '性能数据', '计算错误', '配载', '载重单', '油量', 'FMC', 'CDU'],
        "驾驶员失能 (Pilot Incapacitation)": ['失能', '驾驶员失能', '进止决断', '控制权移交', '身体不适', '接管'],
        "跑道危险状况 (Runway Hazards)": ['积水跑道', '湿滑跑道', '跑道侵入', '跑道状况', '进止决断', '暴雨接地', '偏出跑道', '刹车', '跑道']
    }

    def _count_categories(scenario_dict):
        counts = {k: 0 for k in scenario_dict}
        for comment in valid_comments:
            for cat, kws in scenario_dict.items():
                if any(kw in comment for kw in kws):
                    counts[cat] += 1
        return counts

    iata_res = _count_categories(iata_scenarios)
    icao_res = _count_categories(icao_scenarios)
    phase_res = _count_categories(flight_phases)
    doc9995_res = _count_categories(doc9995_themes)

    # 旧版兼容 (安全读取，避免 KeyError)
    legacy_risk_tags = {
        "approach_landing": phase_res.get("进近阶段", 0) + phase_res.get("着陆/接地", 0),
        "automation": doc9995_res.get("导航降级与失效 (Navigation)", 0),
        "non_normal": doc9995_res.get("航空器系统故障 (Aircraft Systems)", 0) + doc9995_res.get("发动机故障与失灵 (Engine Failures)", 0),
        "sop_crm": icao_res.get("SOP与标准规范 (SOP)", 0) + icao_res.get("CRM与团队沟通 (CRM)", 0),
        "go_around_climb": phase_res.get("复飞阶段", 0) + phase_res.get("起飞/初始爬升", 0)
    }

    return {
        'total_comments': len(valid_comments),
        'keywords': keywords,
        'iata_risk': iata_res,
        'icao_threat': icao_res,
        'flight_phase': phase_res,
        'doc9995_theme': doc9995_res,
        'risk_tags': legacy_risk_tags,
        'sentiment': 'mixed',
        'full_text': full_text[:2000]
    }


# ==================== 统计与聚合 ====================

def calculate_statistics(pilots: List[Dict]) -> Dict:
    """
    计算飞行员数据的统计指标 (采用 EBT 系统的 5 分制分值标准。按人计算分布)
    
    返回：
    {
        'total_pilots': int,
        'average_scores': {'KNO': 3.5, ...},
        'score_distribution': {'excellent': 10, 'good': 20, ...},  # 按人数
        'risk_count': int,
        'risk_pilots': [...]
    }
    """
    if not pilots:
        return {}
    
    competency_codes = ['KNO', 'PRO', 'FPA', 'FPM', 'COM', 'LTW', 'SAW', 'WLM', 'PSD']
    
    # 各维度平均分
    average_scores = {}
    for code in competency_codes:
        scores = [p['scores'].get(code, 0) for p in pilots if p['scores'].get(code, 0) > 0]
        average_scores[code] = float(np.mean(scores)) if scores else 0.0
    
    # 总体平均分
    all_scores = []
    for p in pilots:
        all_scores.extend([s for s in p['scores'].values() if s > 0])
    overall_avg = float(np.mean(all_scores)) if all_scores else 0.0
    
    # 按飞行员个人平均分分布 (每人的所有维度平均分)
    pilot_avgs = []
    for p in pilots:
        valid_scores = [s for s in p['scores'].values() if s > 0]
        if valid_scores:
            pilot_avgs.append(float(np.mean(valid_scores)))

    score_distribution = {
        'excellent': sum(1 for s in pilot_avgs if s >= 4.5),   # 优秀: >= 4.5
        'good':      sum(1 for s in pilot_avgs if 3.5 <= s < 4.5),  # 良好: 3.5-4.5
        'fair':      sum(1 for s in pilot_avgs if 3.0 <= s < 3.5),  # 合格: 3.0-3.5
        'poor':      sum(1 for s in pilot_avgs if s < 3.0),     # 待改进: < 3.0
    }
    
    # 风险飞行员（任何维度 < 3.0）——去重
    risk_pilots = [p for p in pilots if any(s > 0 and s < 3.0 for s in p['scores'].values())]
    unique_risk_names = list(dict.fromkeys([p['name'] for p in risk_pilots]))
    
    return {
        'total_pilots': len(pilots),
        'average_scores': average_scores,
        'overall_average': overall_avg,
        'score_distribution': score_distribution,
        'risk_count': len(unique_risk_names),
        'risk_pilots': unique_risk_names,
    }


# ==================== 矩阵与风险分析 ====================

def pilots_to_dataframe(pilots: List[Dict]) -> pd.DataFrame:
    """将 pilots 字典列表转换为 DataFrame，用于矩阵分析。"""
    if not pilots:
        return pd.DataFrame()

    rows = []
    for p in pilots:
        row = {
            '姓名': p.get('name', ''),
            '检查时间': p.get('check_date', ''),
            '机型': p.get('aircraft_type', ''),
            '技术等级': p.get('technical_rank', ''),
            'source_label': p.get('source_label', ''),
            'comments': p.get('comments', ''),
            'examiner': p.get('examiner', ''),
        }
        for code in COMPETENCY_CODES:
            row[code] = p.get('scores', {}).get(code, 0.0)
        rows.append(row)

    df = pd.DataFrame(rows)
    for code in COMPETENCY_CODES:
        df[code] = pd.to_numeric(df[code], errors='coerce')
    return df


def add_scenario_column(df: pd.DataFrame, comment_col: str = 'comments') -> pd.DataFrame:
    """为 DataFrame 添加训练主题列（基于评语关键词分类）。"""
    if df.empty or comment_col not in df.columns:
        df['训练主题'] = '其他'
        return df
    df = df.copy()
    df['训练主题'] = df[comment_col].apply(classify_scenario_by_keyword)
    return df


def expand_to_risk(df: pd.DataFrame, scenario_col: str = '训练主题') -> pd.DataFrame:
    """将训练主题记录展开为核心风险记录（一对多展开）。"""
    rows = []
    for _, r in df.iterrows():
        theme = r.get(scenario_col, None)
        if isinstance(theme, (list, tuple)):
            theme = theme[0] if theme else None
        try:
            if theme is None or (isinstance(theme, float) and pd.isna(theme)):
                continue
            if not isinstance(theme, str):
                theme = str(theme)
            theme = theme.strip() if isinstance(theme, str) else None
            if not theme or theme in ('nan', 'None', ''):
                continue
            if theme not in SCENARIO_TO_CORE_RISK:
                continue
        except Exception:
            continue

        for rk in SCENARIO_TO_CORE_RISK[theme]:
            row = r.to_dict() if hasattr(r, 'to_dict') else dict(r)
            row["核心风险"] = rk
            rows.append(row)
    return pd.DataFrame(rows)


def build_heatmap_pivot(df: pd.DataFrame, threshold: int = 3) -> pd.DataFrame:
    """
    构建胜任力 × 训练主题的计数透视表。
    threshold 为 None 时统计所有有效评分；否则统计低于 threshold 的记录数。
    """
    if df.empty or '训练主题' not in df.columns:
        empty = pd.DataFrame(0, index=COMPETENCY_CODES, columns=THEME_ORDER)
        return empty

    sub = df[['训练主题'] + COMPETENCY_CODES].copy()
    sub = sub.dropna(subset=['训练主题'])

    records = []
    for _, row in sub.iterrows():
        scenario = row['训练主题']
        for code in COMPETENCY_CODES:
            score = row[code]
            try:
                score_val = float(score) if pd.notna(score) else None
                if threshold is None:
                    if score_val is not None:
                        records.append({'胜任力': code, '训练主题': scenario})
                else:
                    if score_val is not None and score_val < float(threshold):
                        records.append({'胜任力': code, '训练主题': scenario})
            except (ValueError, TypeError):
                pass

    if not records:
        return pd.DataFrame(0, index=COMPETENCY_CODES, columns=THEME_ORDER)

    pivot = (
        pd.DataFrame(records)
        .groupby(['胜任力', '训练主题'])
        .size()
        .unstack(fill_value=0)
    )

    pivot = pivot.reindex(COMPETENCY_CODES).fillna(0)
    for scenario in THEME_ORDER:
        if scenario not in pivot.columns:
            pivot[scenario] = 0
    pivot = pivot[THEME_ORDER]
    return pivot


def build_heatmap_pivot_with_risk(df: pd.DataFrame, threshold: int = 3) -> pd.DataFrame:
    """构建胜任力 × 核心风险的计数透视表。"""
    df_risk = expand_to_risk(df)
    if df_risk.empty:
        return pd.DataFrame(0, index=COMPETENCY_CODES, columns=RISK_ORDER)

    records = []
    for _, row in df_risk.iterrows():
        for code in COMPETENCY_CODES:
            score = row.get(code, None)
            if score is None or (isinstance(score, float) and pd.isna(score)):
                continue
            if threshold is None:
                include = True
            else:
                try:
                    include = float(score) < float(threshold)
                except Exception:
                    include = False
            if include:
                records.append({'胜任力': code, '核心风险': row['核心风险']})

    if not records:
        return pd.DataFrame(0, index=COMPETENCY_CODES, columns=RISK_ORDER)

    pivot = (
        pd.DataFrame(records)
        .groupby(['胜任力', '核心风险'])
        .size()
        .unstack(fill_value=0)
    )

    pivot = pivot.reindex(COMPETENCY_CODES).fillna(0)
    for risk in RISK_ORDER:
        if risk not in pivot.columns:
            pivot[risk] = 0
    pivot = pivot[RISK_ORDER]
    return pivot


def build_theme_risk_pivot(df: pd.DataFrame) -> pd.DataFrame:
    """构建训练主题 × 核心风险的计数透视表。"""
    df_risk = expand_to_risk(df)
    if df_risk.empty:
        return pd.DataFrame(0, index=THEME_ORDER, columns=RISK_ORDER)

    pivot = (
        df_risk.groupby(['训练主题', '核心风险'])
        .size()
        .unstack(fill_value=0)
    )

    row_order = [t for t in THEME_ORDER if t in pivot.index]
    pivot = pivot.reindex(index=row_order, fill_value=0)
    for risk in RISK_ORDER:
        if risk not in pivot.columns:
            pivot[risk] = 0
    pivot = pivot[RISK_ORDER]
    return pivot


def build_sankey_data(df: pd.DataFrame, scenario_col: str = '训练主题') -> Dict:
    """
    构建训练主题 → 核心风险的桑基图数据（JSON 可序列化）。
    返回 {nodes, links}。
    """
    df_risk = expand_to_risk(df, scenario_col)
    if df_risk.empty:
        return {'nodes': [], 'links': []}

    flow_counts = df_risk.groupby([scenario_col, '核心风险']).size().reset_index(name='count')
    scenarios = sorted(df_risk[scenario_col].unique())
    risks = sorted(df_risk['核心风险'].unique())

    nodes = [{'name': n} for n in scenarios + risks]
    node_idx = {n: i for i, n in enumerate(scenarios + risks)}

    links = []
    for _, row in flow_counts.iterrows():
        links.append({
            'source': node_idx[row[scenario_col]],
            'target': node_idx[row['核心风险']],
            'value': int(row['count'])
        })

    return {'nodes': nodes, 'links': links}


def build_sankey_3stage_data(df: pd.DataFrame, top_themes: int = 15) -> Dict:
    """
    构建胜任力 → 训练主题 → 核心风险的三级桑基图数据。
    返回 {nodes, links}。
    """
    df_risk = expand_to_risk(df)
    if df_risk.empty:
        return {'nodes': [], 'links': []}

    records = []
    for _, row in df_risk.iterrows():
        for code in COMPETENCY_CODES:
            score = row.get(code, None)
            if pd.notna(score):
                records.append({
                    '胜任力': code,
                    '训练主题': row['训练主题'],
                    '核心风险': row['核心风险'],
                })

    if not records:
        return {'nodes': [], 'links': []}

    flow_df = pd.DataFrame(records)
    comp_nodes = sorted(flow_df['胜任力'].unique())
    theme_nodes = sorted(flow_df['训练主题'].unique())[:top_themes]
    risk_nodes = sorted(flow_df['核心风险'].unique())

    flow_df = flow_df[flow_df['训练主题'].isin(theme_nodes)]
    flow1 = flow_df.groupby(['胜任力', '训练主题']).size().reset_index(name='count')
    flow2 = flow_df.groupby(['训练主题', '核心风险']).size().reset_index(name='count')

    all_nodes = comp_nodes + theme_nodes + risk_nodes
    node_idx = {n: i for i, n in enumerate(all_nodes)}

    links = []
    for _, row in flow1.iterrows():
        links.append({
            'source': node_idx[row['胜任力']],
            'target': node_idx[row['训练主题']],
            'value': int(row['count'])
        })
    for _, row in flow2.iterrows():
        links.append({
            'source': node_idx[row['训练主题']],
            'target': node_idx[row['核心风险']],
            'value': int(row['count'])
        })

    return {'nodes': [{'name': n} for n in all_nodes], 'links': links}


# ==================== AI 提示工程 ====================

def generate_ai_prompt(analysis_context: Dict, user_query: str) -> str:
    """
    为 Claude API 生成精心设计的提示词
    
    包含：
    - 背景信息（飞行员评估系统）
    - 数据摘要
    - 用户查询
    - 输出格式要求
    """
    
    prompt = f"""你是一位资深的飞行安全分析专家。你正在帮助一个飞行员胜任力评估系统（EBT）进行数据分析。

### 系统背景
EBT 系统通过以下 9 个维度评估飞行员：
1. KNO (知识运用) - 对飞行理论和规程的掌握
2. PRO (程序执行) - 按规程执行能力
3. FPA (飞行航迹管理-自动) - 自动驾驶使用
4. FPM (飞行航迹管理-手动) - 手动飞行能力
5. COM (沟通) - 与乘务组和空管通话
6. LTW (领导力与团队合作) - 机组协调
7. SAW (情景意识) - 对飞行状态的认知
8. WLM (工作负荷管理) - 任务优先级管理
9. PSD (问题解决与决策) - 应急决策能力

### 当前数据摘要
{json.dumps(analysis_context, ensure_ascii=False, indent=2)}

### 用户查询
{user_query}

### 请求格式
请提供专业、可行的分析：
1. 基于数据的客观发现
2. 识别的主要风险因素
3. 针对性的改进建议
4. 建议的培训重点

确保输出是有结构的、易读的、可执行的。"""
    
    return prompt


# ==================== 导出与报告 ====================

def export_to_excel(pilots: List[Dict], filename: str = 'pilots_analysis.xlsx') -> str:
    """将飞行员数据导出为 Excel 文件"""
    df = pd.DataFrame(pilots)
    df.to_excel(filename, index=False, engine='openpyxl')
    return filename


def export_to_csv(pilots: List[Dict], filename: str = 'pilots_analysis.csv') -> str:
    """将飞行员数据导出为 CSV 文件"""
    df = pd.DataFrame(pilots)
    df.to_csv(filename, index=False, encoding='utf-8-sig')
    return filename


def export_multi_sheet_report(
    pilots: List[Dict],
    filename: str = 'EBT_Analysis_Report.xlsx',
    threshold: int = 3
) -> str:
    """
    导出多 sheet 综合分析报告

    Sheet 1: 原始数据
    Sheet 2: 统计摘要
    Sheet 3: 胜任力 × 训练主题热力矩阵
    Sheet 4: 训练主题 × 核心风险矩阵
    Sheet 5: 教员给分宽严度
    """
    df = pilots_to_dataframe(pilots)

    with pd.ExcelWriter(filename, engine='openpyxl') as writer:
        # Sheet 1: 原始数据
        df.to_excel(writer, sheet_name='原始数据', index=False)

        # Sheet 2: 统计摘要
        stats = calculate_statistics(pilots)
        summary_rows = []
        summary_rows.append(['评估总人数', stats.get('total_pilots', 0)])
        summary_rows.append(['整体平均分', stats.get('overall_average', 0)])
        summary_rows.append(['风险标识人数', stats.get('risk_count', 0)])
        for code in COMPETENCY_CODES:
            summary_rows.append([f'{code} 平均分', stats.get('average_scores', {}).get(code, 0)])
        dist = stats.get('score_distribution', {})
        summary_rows.append(['优秀人数 (>=4.5)', dist.get('excellent', 0)])
        summary_rows.append(['良好人数 (3.5-4.5)', dist.get('good', 0)])
        summary_rows.append(['合格人数 (3.0-3.5)', dist.get('fair', 0)])
        summary_rows.append(['待改进人数 (<3.0)', dist.get('poor', 0)])
        pd.DataFrame(summary_rows, columns=['指标', '数值']).to_excel(writer, sheet_name='统计摘要', index=False)

        # Sheet 3: 胜任力 × 训练主题热力矩阵
        if not df.empty and 'comments' in df.columns:
            df_with_theme = add_scenario_column(df)
            heatmap = build_heatmap_pivot(df_with_theme, threshold=threshold)
            heatmap.to_excel(writer, sheet_name='胜任力主题矩阵')
        else:
            pd.DataFrame({'提示': ['数据为空或缺少评语，无法生成矩阵']}).to_excel(writer, sheet_name='胜任力主题矩阵', index=False)

        # Sheet 4: 训练主题 × 核心风险矩阵
        if not df.empty and 'comments' in df.columns:
            df_with_theme = add_scenario_column(df)
            risk_pivot = build_theme_risk_pivot(df_with_theme)
            risk_pivot.to_excel(writer, sheet_name='主题风险矩阵')
        else:
            pd.DataFrame({'提示': ['数据为空或缺少评语，无法生成风险矩阵']}).to_excel(writer, sheet_name='主题风险矩阵', index=False)

        # Sheet 5: 教员给分宽严度
        if not df.empty and 'examiner' in df.columns and df['examiner'].notna().any():
            examiner_stats = []
            for examiner, group in df.groupby('examiner'):
                scores = []
                for code in COMPETENCY_CODES:
                    scores.extend(group[code].dropna().tolist())
                if scores:
                    examiner_stats.append({
                        '教员': examiner,
                        '评估次数': len(group),
                        '平均给分': round(float(np.mean(scores)), 3),
                        '最低维度': min(COMPETENCY_CODES, key=lambda c: group[c].mean() if not group[c].empty else 999),
                        '最高维度': max(COMPETENCY_CODES, key=lambda c: group[c].mean() if not group[c].empty else -1),
                    })
            pd.DataFrame(examiner_stats).sort_values('平均给分').to_excel(writer, sheet_name='教员给分宽严度', index=False)
        else:
            pd.DataFrame({'提示': ['无教员数据']}).to_excel(writer, sheet_name='教员给分宽严度', index=False)

    return filename
