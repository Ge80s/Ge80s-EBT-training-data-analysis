"""
FastAPI 后端 - 完整实现
整合从 Streamlit app.py 迁移的所有业务逻辑
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import asyncio
import json
from typing import List, Dict
import pandas as pd
import os
from datetime import datetime
import logging
import sys
import webbrowser
import threading
try:
    from docx import Document
except ImportError as e:
    raise ImportError("Missing dependency 'python-docx'. Install it with `pip install python-docx`.") from e

# PyInstaller 窗口程序没有 stdout/stderr，必须在日志配置前重定向，
# 否则 logging 的 StreamHandler 会拿到 None，运行时报 'NoneType' has no attribute 'write'
if getattr(sys, 'frozen', False) and (sys.stdout is None or sys.stderr is None):
    _log_dir = os.path.dirname(sys.executable)
    _log_path = os.path.join(_log_dir, 'ebt_run.log')
    sys.stdout = open(_log_path, 'a', encoding='utf-8')
    sys.stderr = sys.stdout

# 添加项目路径
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy.orm import Session
from models_database import init_db, get_db, get_data_dir, Pilot, Upload, AiAnalysis, UserAction

from business_logic import (
    load_single_file,
    analyze_comments_smart,
    calculate_statistics,
    generate_ai_prompt,
    export_to_excel,
    export_to_csv,
    export_multi_sheet_report,
    pilots_to_dataframe,
    add_scenario_column,
    build_heatmap_pivot,
    build_heatmap_pivot_with_risk,
    build_theme_risk_pivot,
    build_sankey_data,
    build_sankey_3stage_data,
    calc_comment_quality,
)
from constants import COMPETENCY_CODES, COMPETENCY_NAMES, RISK_NAMES, THEME_ORDER, RISK_ORDER
from ai_service import generate_ai_stream, load_ai_config, save_ai_config, test_ai_connection

# 日志配置
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_static_dir() -> str:
    """获取前端静态资源目录，兼容开发环境和 PyInstaller 打包环境。"""
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后运行时，资源位于 _MEIPASS
        base_path = sys._MEIPASS
        dist_path = os.path.join(base_path, 'dist')
    else:
        # 开发环境：从当前文件所在目录找 dist
        base_path = os.path.dirname(os.path.abspath(__file__))
        dist_path = os.path.join(base_path, 'dist')
    
    # 如果 dist 不存在，输出日志帮助诊断
    if not os.path.isdir(dist_path):
        logger.warning(f"Static dir not found at {dist_path}, base_path={base_path}, frozen={getattr(sys, 'frozen', False)}")
        # 尝试备用路径：在开发环境下，可能需要从 .. 找
        if not getattr(sys, 'frozen', False):
            alt_path = os.path.join(os.path.dirname(base_path), 'dist')
            if os.path.isdir(alt_path):
                logger.info(f"Using alternate static dir: {alt_path}")
                return alt_path
    else:
        logger.info(f"Using static dir: {dist_path}")
    
    return dist_path


def get_available_port(start_port: int = 8000, max_tries: int = 20) -> int:
    """从起始端口开始查找一个可用端口，避免端口冲突。"""
    import socket
    for port in range(start_port, start_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No available port found in range {start_port}-{start_port + max_tries - 1}")


def open_browser_delay(url: str, delay: float = 2.0):
    """延迟后自动打开浏览器，避免服务尚未启动。"""
    def _open():
        import time
        time.sleep(delay)
        try:
            webbrowser.open(url)
            logger.info(f"🌐 已自动打开浏览器: {url}")
        except Exception as e:
            logger.warning(f"自动打开浏览器失败: {e}")
    threading.Thread(target=_open, daemon=True).start()


# ==================== 初始化 ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("初始化数据库...")
    init_db()
    logger.info("✅ EBT Analysis Platform API 启动")
    port = int(os.getenv("EBT_PORT", "8000"))
    if os.getenv("EBT_OPEN_BROWSER", "true").lower() != "false":
        open_browser_delay(f"http://127.0.0.1:{port}")
    yield
    logger.info("❌ EBT Analysis Platform API 停止")


app = FastAPI(
    title="EBT Analysis Platform API",
    description="Evidence-Based Training Flight Analysis Backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite 开发服务器
        "http://127.0.0.1:5173",
        "http://localhost:3000",  # 备用前端端口
        "http://127.0.0.1:3000",
        "file://*",               # Electron 应用
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 内存数据存储 ====================

# 已废弃，现使用 SQLite 数据库持久化存储

# ==================== 路由：前端静态资源 ====================

# 移除显式的 @app.get("/") 路由，让 StaticFiles mount 处理，避免路由冲突
# 注意：@app.get() 声明的路由优先级高于 mount，会导致 mount 无法接收 / 请求

static_dir = get_static_dir()
if os.path.isdir(static_dir):
    # StaticFiles 挂载在 "/" 时，会优先处理 / 并返回 index.html（因为 html=True）
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    logger.info(f"✅ StaticFiles mounted at / from {static_dir}")
else:
    logger.warning(f"⚠️  Static directory not found at {static_dir} - frontend assets will not be served")
    # 提供回退路由，告知用户
    @app.get("/", response_class=FileResponse)
    async def serve_fallback():
        return {"error": "Frontend not built. Please run npm run build and rebuild the app."}



# ==================== 路由：健康检查 ====================

@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """健康检查端点"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "pilots_loaded": db.query(Pilot).count(),
        "files_uploaded": db.query(Upload).count()
    }


# ==================== 路由：文件上传 ====================

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    source_label: str = Query(None, description="数据来源/批次标签，默认取文件名"),
    db: Session = Depends(get_db)
):
    """
    处理 Excel/CSV 文件上传

    支持格式：.xlsx, .csv
    自动解析双行表头
    返回摘要信息
    """
    try:
        res = await _process_single_file(file, source_label, db)
        if not res["success"]:
            raise HTTPException(status_code=400, detail=res["error"])
        return {**res, "total_pilots_loaded": db.query(Pilot).count()}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 文件上传失败: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"文件处理失败: {str(e)}")


async def _process_single_file(file: UploadFile, source_label: str | None, db: Session):
    """内部辅助：处理单个文件上传并返回结果。"""
    if not file.filename:
        return {"success": False, "error": "文件名为空"}

    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.csv')):
        return {"success": False, "error": "仅支持 .xlsx 和 .csv 文件"}

    upload_dir = os.path.join(get_data_dir(), "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{datetime.now().timestamp()}_{file.filename}")

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    result = load_single_file(file_path, source_label=source_label)

    if result['error']:
        return {"success": False, "error": f"文件解析失败: {result['error']}"}

    pilots = result['pilots']
    label = source_label or (result['pilots'][0].get('source_label', file.filename) if pilots else file.filename)

    db_upload = Upload(
        filename=file.filename,
        file_path=file_path,
        uploaded_at=datetime.now(),
        row_count=len(pilots),
        source_label=label
    )
    db.add(db_upload)
    db.commit()
    db.refresh(db_upload)

    db_pilots = []
    for p in pilots:
        db_pilot = Pilot(
            name=p['name'],
            check_date=datetime.strptime(p['check_date'], '%Y-%m-%d') if p['check_date'] else datetime.utcnow(),
            aircraft_type=p['aircraft_type'],
            technical_rank=p['technical_rank'],
            kno_score=p['scores'].get('KNO', 0.0),
            pro_score=p['scores'].get('PRO', 0.0),
            fpa_score=p['scores'].get('FPA', 0.0),
            fpm_score=p['scores'].get('FPM', 0.0),
            com_score=p['scores'].get('COM', 0.0),
            ltw_score=p['scores'].get('LTW', 0.0),
            saw_score=p['scores'].get('SAW', 0.0),
            wlm_score=p['scores'].get('WLM', 0.0),
            psd_score=p['scores'].get('PSD', 0.0),
            comments=p['comments'],
            examiner=p['examiner'],
            ob_items=p['ob_items'],
            source_label=p.get('source_label', label),
            training_type=p.get('training_type', ''),
            overall_result=p.get('overall_result', ''),
            final_conclusion=p.get('final_conclusion', ''),
            upload_id=db_upload.id
        )
        db_pilots.append(db_pilot)

    db.bulk_save_objects(db_pilots)
    db.commit()

    logger.info(f"✅ 成功加载文件并存入数据库: {file.filename} ({len(pilots)} 条记录)")

    return {
        "success": True,
        "filename": file.filename,
        "source_label": label,
        "pilot_count": len(pilots),
        "message": f"成功加载 {len(pilots)} 条飞行员记录",
    }


@app.post("/api/upload-batch")
async def upload_batch(
    files: List[UploadFile] = File(...),
    source_label: str = Query(None, description="统一的数据来源/批次标签，默认取各文件名"),
    db: Session = Depends(get_db)
):
    """
    批量处理 Excel/CSV 文件上传
    """
    if not files:
        raise HTTPException(status_code=400, detail="未选择文件")

    results = []
    errors = []
    total_pilots = 0

    for file in files:
        try:
            res = await _process_single_file(file, source_label, db)
            if res["success"]:
                total_pilots += res["pilot_count"]
                results.append(res)
            else:
                errors.append({"filename": file.filename, "error": res["error"]})
        except Exception as e:
            logger.error(f"❌ 批量上传中文件失败: {file.filename} - {str(e)}")
            errors.append({"filename": file.filename, "error": str(e)})

    return {
        "success": len(errors) == 0,
        "total_files": len(files),
        "successful_files": len(results),
        "failed_files": len(errors),
        "total_pilots_loaded": total_pilots,
        "results": results,
        "errors": errors,
        "total_pilots_in_db": db.query(Pilot).count()
    }


# ==================== 路由：数据查询 ====================

@app.get("/api/uploads")
@app.get("/api/files/list")
async def list_uploads(db: Session = Depends(get_db)):
    """获取所有已导入的文件及批次列表"""
    uploads = db.query(Upload).order_by(Upload.uploaded_at.desc()).all()
    result = []
    for u in uploads:
        result.append({
            "id": u.id,
            "filename": u.filename,
            "source_label": u.source_label,
            "uploaded_at": u.uploaded_at.strftime('%Y-%m-%d %H:%M:%S') if u.uploaded_at else '',
            "row_count": u.row_count
        })
    return {"uploads": result, "total": len(result)}


@app.delete("/api/uploads/{upload_id}")
@app.delete("/api/files/{upload_id}")
async def delete_upload(upload_id: int, db: Session = Depends(get_db)):
    """删除指定的上传文件及关联飞行员数据"""
    upload = db.query(Upload).filter(Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="未找到该上传记录")
    
    # 删除关联的飞行员记录
    db.query(Pilot).filter(Pilot.upload_id == upload_id).delete(synchronize_session=False)
    
    # 删除上传记录
    db.delete(upload)
    
    # 尝试删除磁盘上的原始文件
    if upload.file_path and os.path.exists(upload.file_path):
        try:
            os.remove(upload.file_path)
        except Exception as e:
            logger.warning(f"删除物理文件失败: {e}")
            
    db.commit()
    return {"success": True, "message": f"已成功删除导入文件 '{upload.filename}' 及关联数据"}


@app.delete("/api/batches/{source_label}")
async def delete_batch(source_label: str, db: Session = Depends(get_db)):
    """根据批次名称删除整个批次的所有数据"""
    pilots_deleted = db.query(Pilot).filter(Pilot.source_label == source_label).delete(synchronize_session=False)
    uploads = db.query(Upload).filter(Upload.source_label == source_label).all()
    for u in uploads:
        if u.file_path and os.path.exists(u.file_path):
            try:
                os.remove(u.file_path)
            except Exception:
                pass
        db.delete(u)
    db.commit()
    return {"success": True, "message": f"已成功删除批次 '{source_label}' 及关联 {pilots_deleted} 条记录"}


@app.get("/api/data/pilots")
async def get_pilots(db: Session = Depends(get_db), skip: int = Query(0), limit: int = Query(2000)):
    """
    获取飞行员列表
    
    支持分页：
    - skip: 跳过前 N 条
    - limit: 返回 N 条
    """
    total = db.query(Pilot).count()
    pilots = db.query(Pilot).offset(skip).limit(limit).all()
    
    result_list = []
    for p in pilots:
        result_list.append({
            'id': p.id,
            'name': p.name,
            'check_date': p.check_date.strftime('%Y-%m-%d') if p.check_date else '',
            'aircraft_type': p.aircraft_type,
            'technical_rank': p.technical_rank,
            'scores': {
                'KNO': p.kno_score,
                'PRO': p.pro_score,
                'FPA': p.fpa_score,
                'FPM': p.fpm_score,
                'COM': p.com_score,
                'LTW': p.ltw_score,
                'SAW': p.saw_score,
                'WLM': p.wlm_score,
                'PSD': p.psd_score
            },
            'ob_items': p.ob_items,
            'comments': p.comments,
            'examiner': p.examiner,
            'source_label': p.source_label,
            'training_type': p.training_type,
            'overall_result': p.overall_result,
            'final_conclusion': p.final_conclusion,
            'upload_id': p.upload_id
        })
        
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "pilots": result_list
    }


@app.get("/api/data/summary")
async def get_summary(
    batch: str = Query(None, description="批次筛选"),
    aircraft_type: str = Query(None, description="机型筛选"),
    rank: str = Query(None, description="等级筛选"),
    db: Session = Depends(get_db)
):
    """
    获取仪表板摘要数据，支持按批次、机型、等级筛选
    """
    query = db.query(Pilot)
    if batch and batch != "all":
        query = query.filter(Pilot.source_label == batch)
    if aircraft_type and aircraft_type != "all":
        query = query.filter(Pilot.aircraft_type == aircraft_type)
    if rank and rank != "all":
        query = query.filter(Pilot.technical_rank == rank)

    pilots = query.all()
    if not pilots:
        return {
            "total_pilots": 0,
            "average_scores": {},
            "overall_average": 0,
            "score_distribution": {"excellent": 0, "good": 0, "fair": 0, "poor": 0},
            "risk_count": 0,
            "risk_pilots": [],
            "data_sources": db.query(Upload).count(),
            "last_updated": datetime.now().isoformat()
        }
    
    pilots_list = []
    for p in pilots:
        pilots_list.append({
            'name': p.name,
            'check_date': p.check_date.strftime('%Y-%m-%d') if p.check_date else '',
            'aircraft_type': p.aircraft_type,
            'technical_rank': p.technical_rank,
            'scores': {
                'KNO': p.kno_score,
                'PRO': p.pro_score,
                'FPA': p.fpa_score,
                'FPM': p.fpm_score,
                'COM': p.com_score,
                'LTW': p.ltw_score,
                'SAW': p.saw_score,
                'WLM': p.wlm_score,
                'PSD': p.psd_score
            },
            'ob_items': p.ob_items,
            'comments': p.comments,
            'examiner': p.examiner
        })
        
    stats = calculate_statistics(pilots_list)
    uploads_count = db.query(Upload).count()
    
    return {
        **stats,
        "data_sources": uploads_count,
        "last_updated": datetime.now().isoformat()
    }


@app.get("/api/data/pilot/{pilot_name}")
async def get_pilot_profile(pilot_name: str, db: Session = Depends(get_db)):
    """获取单个飞行员的详细档案"""
    p = db.query(Pilot).filter(Pilot.name == pilot_name).first()
    if not p:
        raise HTTPException(status_code=404, detail=f"飞行员 {pilot_name} 未找到")
    
    return {
        'id': p.id,
        'name': p.name,
        'check_date': p.check_date.strftime('%Y-%m-%d') if p.check_date else '',
        'aircraft_type': p.aircraft_type,
        'technical_rank': p.technical_rank,
        'scores': {
            'KNO': p.kno_score,
            'PRO': p.pro_score,
            'FPA': p.fpa_score,
            'FPM': p.fpm_score,
            'COM': p.com_score,
            'LTW': p.ltw_score,
            'SAW': p.saw_score,
            'WLM': p.wlm_score,
            'PSD': p.psd_score
        },
        'ob_items': p.ob_items,
        'comments': p.comments,
        'examiner': p.examiner,
        'source_label': p.source_label,
        'training_type': p.training_type,
        'overall_result': p.overall_result,
        'final_conclusion': p.final_conclusion,
        'upload_id': p.upload_id
    }


# ==================== 路由：批次与筛选选项 ====================

@app.get("/api/data/batches")
async def get_batches(db: Session = Depends(get_db)):
    """获取所有可用的批次、机型、技术等级选项（供前端动态筛选）。"""
    batches = [r[0] for r in db.query(Pilot.source_label).distinct().all() if r[0]]
    aircraft_types = [r[0] for r in db.query(Pilot.aircraft_type).distinct().all() if r[0]]
    ranks = [r[0] for r in db.query(Pilot.technical_rank).distinct().all() if r[0]]
    training_types = [r[0] for r in db.query(Pilot.training_type).distinct().all() if r[0]]
    examiners = [r[0] for r in db.query(Pilot.examiner).distinct().all() if r[0]]

    return {
        "batches": sorted(batches),
        "aircraft_types": sorted(aircraft_types),
        "ranks": sorted(ranks),
        "training_types": sorted(training_types),
        "examiners": sorted(examiners)
    }


@app.get("/api/data/pilot/{pilot_name}/history")
async def get_pilot_history(
    pilot_name: str,
    batch: str = Query(None),
    aircraft_type: str = Query(None),
    rank: str = Query(None),
    db: Session = Depends(get_db)
):
    """获取单个飞行员的所有历史评估记录，按时间排序。"""
    query = db.query(Pilot).filter(Pilot.name == pilot_name)
    if batch and batch != "all": query = query.filter(Pilot.source_label == batch)
    if aircraft_type and aircraft_type != "all": query = query.filter(Pilot.aircraft_type == aircraft_type)
    if rank and rank != "all": query = query.filter(Pilot.technical_rank == rank)
    pilots = query.order_by(Pilot.check_date).all()
    if not pilots:
        raise HTTPException(status_code=404, detail=f"飞行员 {pilot_name} 未找到")

    return {
        "name": pilot_name,
        "total_records": len(pilots),
        "records": [
            {
                "id": p.id,
                "check_date": p.check_date.strftime('%Y-%m-%d') if p.check_date else '',
                "aircraft_type": p.aircraft_type,
                "technical_rank": p.technical_rank,
                "source_label": p.source_label,
                "training_type": p.training_type,
                "examiner": p.examiner,
                "scores": {
                    'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score,
                    'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score,
                    'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score
                },
                "ob_items": p.ob_items,
                "comments": p.comments,
                "overall_result": p.overall_result,
                "final_conclusion": p.final_conclusion
            }
            for p in pilots
        ]
    }


# ==================== 路由：矩阵分析 ====================

def _serialize_pivot(pivot: pd.DataFrame) -> List[Dict]:
    """将透视表序列化为前端热力图可用的列表格式。"""
    result = []
    for idx, row in pivot.iterrows():
        for col, value in row.items():
            result.append({
                "x": col,
                "y": idx,
                "value": int(value)
            })
    return result


@app.post("/api/matrix/heatmap")
async def matrix_heatmap(
    request: dict = {"threshold": 3, "batch": None, "aircraft_type": None, "rank": None},
    db: Session = Depends(get_db)
):
    """
    胜任力 × 训练主题 热力矩阵。
    threshold 为 null/None 时统计所有有效评分。
    """
    threshold = request.get("threshold")
    if threshold is not None:
        threshold = float(threshold)

    query = db.query(Pilot)
    if request.get("batch"):
        query = query.filter(Pilot.source_label == request["batch"])
    if request.get("aircraft_type"):
        query = query.filter(Pilot.aircraft_type == request["aircraft_type"])
    if request.get("rank"):
        ranks = request["rank"] if isinstance(request["rank"], list) else [request["rank"]]
        query = query.filter(Pilot.technical_rank.in_(ranks))

    pilots = [{
        'name': p.name, 'check_date': p.check_date.strftime('%Y-%m-%d') if p.check_date else '',
        'aircraft_type': p.aircraft_type, 'technical_rank': p.technical_rank,
        'source_label': p.source_label, 'comments': p.comments, 'examiner': p.examiner,
        'scores': {
            'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score,
            'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score,
            'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score
        }
    } for p in query.all()]

    df = pilots_to_dataframe(pilots)
    df = add_scenario_column(df)
    pivot = build_heatmap_pivot(df, threshold=threshold)

    return {
        "competency_labels": COMPETENCY_NAMES,
        "theme_order": THEME_ORDER,
        "data": _serialize_pivot(pivot)
    }


@app.post("/api/matrix/risk")
async def matrix_risk(
    request: dict = {"threshold": 3, "batch": None, "aircraft_type": None, "rank": None},
    db: Session = Depends(get_db)
):
    """
    返回：
    - 胜任力 × 核心风险 热力矩阵
    - 训练主题 × 核心风险 热力矩阵
    """
    threshold = request.get("threshold")
    if threshold is not None:
        threshold = float(threshold)

    query = db.query(Pilot)
    if request.get("batch"):
        query = query.filter(Pilot.source_label == request["batch"])
    if request.get("aircraft_type"):
        query = query.filter(Pilot.aircraft_type == request["aircraft_type"])
    if request.get("rank"):
        ranks = request["rank"] if isinstance(request["rank"], list) else [request["rank"]]
        query = query.filter(Pilot.technical_rank.in_(ranks))

    pilots = [{
        'name': p.name, 'source_label': p.source_label, 'comments': p.comments, 'examiner': p.examiner,
        'scores': {
            'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score,
            'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score,
            'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score
        }
    } for p in query.all()]

    df = pilots_to_dataframe(pilots)
    df = add_scenario_column(df)

    comp_risk_pivot = build_heatmap_pivot_with_risk(df, threshold=threshold)
    theme_risk_pivot = build_theme_risk_pivot(df)

    return {
        "competency_risk": _serialize_pivot(comp_risk_pivot),
        "theme_risk": _serialize_pivot(theme_risk_pivot),
        "competency_labels": COMPETENCY_NAMES,
        "risk_names": RISK_NAMES,
        "risk_order": RISK_ORDER,
        "theme_order": THEME_ORDER
    }


@app.post("/api/matrix/sankey")
async def matrix_sankey(
    request: dict = {"type": "theme_risk", "batch": None, "aircraft_type": None, "rank": None},
    db: Session = Depends(get_db)
):
    """
    桑基图数据。
    type: theme_risk | three_stage
    """
    query = db.query(Pilot)
    if request.get("batch"):
        query = query.filter(Pilot.source_label == request["batch"])
    if request.get("aircraft_type"):
        query = query.filter(Pilot.aircraft_type == request["aircraft_type"])
    if request.get("rank"):
        ranks = request["rank"] if isinstance(request["rank"], list) else [request["rank"]]
        query = query.filter(Pilot.technical_rank.in_(ranks))

    pilots = [{
        'name': p.name, 'source_label': p.source_label, 'comments': p.comments,
        'scores': {
            'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score,
            'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score,
            'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score
        }
    } for p in query.all()]

    df = pilots_to_dataframe(pilots)
    df = add_scenario_column(df)

    sankey_type = request.get("type", "theme_risk")
    if sankey_type == "three_stage":
        data = build_sankey_3stage_data(df)
    else:
        data = build_sankey_data(df)

    return {
        "type": sankey_type,
        "data": data,
        "risk_names": RISK_NAMES
    }


# ==================== 路由：教员分析 ====================

@app.get("/api/examiner/heatmap")
async def examiner_heatmap(batch: str = Query(None), db: Session = Depends(get_db)):
    """教员 × 胜任力平均评分热力图数据，支持按批次筛选。"""
    query = db.query(
        Pilot.examiner,
        Pilot.kno_score, Pilot.pro_score, Pilot.fpa_score, Pilot.fpm_score,
        Pilot.com_score, Pilot.ltw_score, Pilot.saw_score, Pilot.wlm_score, Pilot.psd_score
    ).filter(Pilot.examiner.isnot(None), Pilot.examiner != '')
    if batch and batch != "all":
        query = query.filter(Pilot.source_label == batch)
    rows = query.all()

    if not rows:
        return {"data": []}

    df = pd.DataFrame(rows, columns=[
        'examiner', 'KNO', 'PRO', 'FPA', 'FPM', 'COM', 'LTW', 'SAW', 'WLM', 'PSD'
    ])
    df = df.groupby('examiner')[COMPETENCY_CODES].mean()

    data = []
    for examiner, row in df.iterrows():
        for code in COMPETENCY_CODES:
            data.append({
                "x": code,
                "y": examiner,
                "value": round(float(row[code]), 2)
            })

    return {"data": data, "competency_labels": COMPETENCY_NAMES}


@app.get("/api/examiner/quality")
async def examiner_quality(batch: str = Query(None), db: Session = Depends(get_db)):
    """教员评语质量统计，支持按批次筛选。"""
    query = db.query(Pilot.examiner, Pilot.comments).filter(
        Pilot.examiner.isnot(None), Pilot.examiner != ''
    )
    if batch and batch != "all":
        query = query.filter(Pilot.source_label == batch)
    rows = query.all()

    if not rows:
        return {"data": []}

    stats = {}
    for examiner, comment in rows:
        q = calc_comment_quality(comment)
        if examiner not in stats:
            stats[examiner] = {"count": 0, "total_length": 0, "total_keywords": 0}
        stats[examiner]["count"] += 1
        stats[examiner]["total_length"] += q['length']
        stats[examiner]["total_keywords"] += q['keyword_score']

    data = []
    for examiner, s in stats.items():
        data.append({
            "examiner": examiner,
            "count": s["count"],
            "avg_length": round(s["total_length"] / s["count"], 1),
            "avg_keywords": round(s["total_keywords"] / s["count"], 2)
        })

    return {"data": data}


# ==================== 路由：评语反查 ====================

@app.post("/api/comments/search")
async def search_comments(request: dict, db: Session = Depends(get_db)):
    """
    按维度+评分区间反查评语
    请求：{"competency": "KNO", "min_score": 0, "max_score": 3, "keyword": "着陆"}
    """
    competency = request.get("competency")
    min_score = request.get("min_score")
    max_score = request.get("max_score")
    keyword = request.get("keyword", "")

    score_col_map = {
        'KNO': Pilot.kno_score, 'PRO': Pilot.pro_score, 'FPA': Pilot.fpa_score,
        'FPM': Pilot.fpm_score, 'COM': Pilot.com_score, 'LTW': Pilot.ltw_score,
        'SAW': Pilot.saw_score, 'WLM': Pilot.wlm_score, 'PSD': Pilot.psd_score
    }

    query = db.query(Pilot).filter(Pilot.comments.isnot(None), Pilot.comments != '')

    if competency and competency in score_col_map:
        col = score_col_map[competency]
        if min_score is not None:
            query = query.filter(col >= float(min_score))
        if max_score is not None:
            query = query.filter(col <= float(max_score))

    if keyword:
        query = query.filter(Pilot.comments.contains(keyword))

    results = []
    for p in query.limit(50).all():
        results.append({
            "id": p.id,
            "name": p.name,
            "check_date": p.check_date.strftime('%Y-%m-%d') if p.check_date else '',
            "examiner": p.examiner,
            "source_label": p.source_label,
            "scores": {
                'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score,
                'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score,
                'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score
            },
            "comments": p.comments
        })

    return {"total": len(results), "results": results}


# ==================== 路由：AI 分析 ====================

@app.post("/api/ai/analyze")
async def ai_analyze_stream(request: dict, db: Session = Depends(get_db)):
    """
    AI 分析端点 - 流式返回结果
    
    使用 Server-Sent Events (SSE)
    前端通过 EventSource 订阅
    """
    user_prompt = request.get("prompt", "")
    
    if not user_prompt:
        raise HTTPException(status_code=400, detail="分析提示为空")
    
    # 获取与顶栏筛选一致的数据上下文
    filters = request.get("filters") or {}
    query = db.query(Pilot)
    batch = filters.get("batch")
    aircraft_type = filters.get("aircraftType")
    rank = filters.get("rank")
    if batch and batch != "all": query = query.filter(Pilot.source_label == batch)
    if aircraft_type and aircraft_type != "all": query = query.filter(Pilot.aircraft_type == aircraft_type)
    if rank and rank != "all": query = query.filter(Pilot.technical_rank == rank)
    pilots = query.all()
    pilots_list = []
    for p in pilots:
        pilots_list.append({
            'name': p.name,
            'scores': {
                'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score,
                'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score,
                'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score
            }
        })
    summary = calculate_statistics(pilots_list) if pilots_list else {}

    # 生成 AI 提示词
    ai_prompt = generate_ai_prompt(summary, user_prompt)

    async def generate():
        """流式响应生成器，同时累积完整响应用于存档"""
        full_response = []
        try:
            async for chunk in generate_ai_stream(ai_prompt, summary):
                full_response.append(chunk)
                yield f"data: {json.dumps({'token': chunk})}\n\n"

            # 保存 AI 分析记录
            try:
                db_analysis = AiAnalysis(
                    prompt=user_prompt,
                    response="".join(full_response),
                    context_data=summary,
                    created_at=datetime.now(),
                    model_used="configured"
                )
                db.add(db_analysis)
                db.commit()
            except Exception as db_err:
                logger.warning(f"AI 分析记录保存失败: {db_err}")

            yield "data: {\"done\": true}\n\n"

        except Exception as e:
            logger.error(f"❌ AI 分析失败: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ==================== 路由：导出 ====================

@app.post("/api/analysis/export")
async def export_analysis(format: str = Query("excel"), db: Session = Depends(get_db)):
    """
    导出分析结果
    支持格式：
    - excel: .xlsx
    - csv: .csv
    """
    try:
        pilots = db.query(Pilot).all()
        pilots_list = []
        for p in pilots:
            pilots_list.append({
                'name': p.name,
                'check_date': p.check_date.strftime('%Y-%m-%d') if p.check_date else '',
                'aircraft_type': p.aircraft_type,
                'technical_rank': p.technical_rank,
                'scores': {
                    'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score,
                    'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score,
                    'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score
                },
                'comments': p.comments,
                'examiner': p.examiner
            })

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if format == "excel":
            report_path = os.path.join(get_data_dir(), f"analysis_result_{timestamp}.xlsx")
            export_to_excel(pilots_list, filename=report_path)
            logger.info(f"✅ 导出 Excel: {report_path}")
            return FileResponse(
                report_path,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename="analysis_result.xlsx"
            )

        elif format == "csv":
            report_path = os.path.join(get_data_dir(), f"analysis_result_{timestamp}.csv")
            export_to_csv(pilots_list, filename=report_path)
            logger.info(f"✅ 导出 CSV: {report_path}")
            return FileResponse(
                report_path,
                media_type="text/csv; charset=utf-8-sig",
                filename="analysis_result.csv"
            )

        else:
            raise HTTPException(status_code=400, detail=f"不支持的格式: {format}")

    except Exception as e:
        logger.error(f"❌ 导出失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@app.post("/api/export/report")
async def export_report(
    request: dict = {"threshold": 3, "batch": None, "aircraft_type": None, "rank": None},
    db: Session = Depends(get_db)
):
    """
    导出多 sheet 综合分析报告
    """
    try:
        query = db.query(Pilot)
        if request.get("batch"):
            query = query.filter(Pilot.source_label == request["batch"])
        if request.get("aircraft_type"):
            query = query.filter(Pilot.aircraft_type == request["aircraft_type"])
        if request.get("rank"):
            ranks = request["rank"] if isinstance(request["rank"], list) else [request["rank"]]
            query = query.filter(Pilot.technical_rank.in_(ranks))

        pilots = query.all()
        pilots_list = []
        for p in pilots:
            pilots_list.append({
                'name': p.name,
                'check_date': p.check_date.strftime('%Y-%m-%d') if p.check_date else '',
                'aircraft_type': p.aircraft_type,
                'technical_rank': p.technical_rank,
                'scores': {
                    'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score,
                    'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score,
                    'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score
                },
                'comments': p.comments,
                'examiner': p.examiner,
                'source_label': p.source_label,
                'training_type': p.training_type,
                'overall_result': p.overall_result,
                'final_conclusion': p.final_conclusion,
            })

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = os.path.join(get_data_dir(), f"EBT_Analysis_Report_{timestamp}.xlsx")

        threshold = float(request.get("threshold", 3.0)) if request.get("threshold") else 3.0
        export_multi_sheet_report(pilots_list, report_path, threshold=threshold)

        return FileResponse(
            report_path,
            filename=f"EBT_Analysis_Report_{timestamp}.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        logger.error(f"❌ 导出报告失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"导出报告失败: {str(e)}")


@app.post("/api/export/ai-analysis-doc")
async def export_ai_analysis_doc(db: Session = Depends(get_db)):
    """导出已保存的 AI 分析结果为 Word 文档"""
    try:
        analyses = db.query(AiAnalysis).order_by(AiAnalysis.created_at.desc()).all()
        if not analyses:
            raise HTTPException(status_code=404, detail="当前没有可导出的 AI 分析记录。")

        doc = Document()
        doc.add_heading('EBT AI 分析导出报告', level=1)
        doc.add_paragraph(f'导出时间：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
        doc.add_paragraph(f'总分析条数：{len(analyses)}')
        doc.add_paragraph('')

        for idx, analysis in enumerate(analyses, start=1):
            doc.add_heading(f'分析 #{idx}', level=2)
            doc.add_paragraph(f'生成时间：{analysis.created_at.strftime("%Y-%m-%d %H:%M:%S") if analysis.created_at else "未知"}')
            doc.add_paragraph(f'模型：{analysis.model_used or "未知"}')
            doc.add_paragraph('提示词：')
            doc.add_paragraph(analysis.prompt or '', style='Intense Quote')
            doc.add_paragraph('分析结果：')
            for line in (analysis.response or '').split('\n'):
                doc.add_paragraph(line)
            doc.add_paragraph('---')

        filename = f"EBT_AI_Analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
        export_path = os.path.join(get_data_dir(), filename)
        doc.save(export_path)

        return FileResponse(
            export_path,
            filename=filename,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ AI 分析导出失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI 分析导出失败: {str(e)}")


# ==================== 路由：分析工具与 AI ====================

from ai_service import load_ai_config, save_ai_config, test_ai_connection, generate_ai_stream

@app.post("/api/analysis/comments")
async def analyze_comments_endpoint(
    batch: str = Query(None),
    aircraft_type: str = Query(None),
    rank: str = Query(None),
    db: Session = Depends(get_db)
):
    """
    分析所有飞行员的评论 (支持 ICAO / IATA / Doc 9995 多维分类)
    """
    query = db.query(Pilot)
    if batch and batch != "all": query = query.filter(Pilot.source_label == batch)
    if aircraft_type and aircraft_type != "all": query = query.filter(Pilot.aircraft_type == aircraft_type)
    if rank and rank != "all": query = query.filter(Pilot.technical_rank == rank)
    pilots = query.all()
    if not pilots:
        return {"error": "暂无飞行员数据"}
    
    comments = [p.comments for p in pilots if p.comments]
    if not comments:
        return {"error": "暂无评论数据"}
    
    result = analyze_comments_smart(comments)
    return result


@app.get("/api/ai/config")
async def get_ai_config_endpoint():
    """获取 AI 配置信息 (脱敏)"""
    cfg = load_ai_config()
    key = cfg.get("api_key", "")
    masked_key = f"{key[:4]}****{key[-4:]}" if len(key) >= 8 else ("****" if key else "")
    return {**cfg, "api_key_masked": masked_key}


@app.post("/api/ai/config")
async def save_ai_config_endpoint(config: dict):
    """保存 AI 配置信息"""
    saved = save_ai_config(config)
    key = saved.get("api_key", "")
    masked_key = f"{key[:4]}****{key[-4:]}" if len(key) >= 8 else ("****" if key else "")
    return {"status": "success", "config": {**saved, "api_key_masked": masked_key}}


@app.post("/api/ai/test")
async def test_ai_connection_endpoint(config: dict = None):
    """测试 AI 接口连通性"""
    res = await test_ai_connection(config)
    return res


@app.post("/api/ai/analyze")
async def ai_analyze_stream_endpoint(request: dict, db: Session = Depends(get_db)):
    """
    AI 智能对话 SSE 流式接口
    """
    prompt = request.get("prompt", "")
    filters = request.get("filters", {})
    
    summary_data = ""
    try:
        query = db.query(Pilot)
        if filters.get("batch") and filters["batch"] != "all":
            query = query.filter(Pilot.source_label == filters["batch"])
        if filters.get("aircraftType") and filters["aircraftType"] != "all":
            query = query.filter(Pilot.aircraft_type == filters["aircraftType"])
        if filters.get("rank") and filters["rank"] != "all":
            query = query.filter(Pilot.technical_rank == filters["rank"])
        pilots = query.all()
        if pilots:
            pilots_list = [{'name': p.name, 'check_date': str(p.check_date), 'aircraft_type': p.aircraft_type, 'technical_rank': p.technical_rank, 'scores': {'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score, 'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score, 'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score}, 'comments': p.comments} for p in pilots]
            stats = calculate_statistics(pilots_list)
            summary_data = f"当前筛选：飞行员总数 {stats.get('total_pilots')}, 平均分 {stats.get('overall_average'):.2f}, 高风险预警人数 {stats.get('risk_count')}, 风险名单: {', '.join(stats.get('risk_pilots', [])[:10])}."
    except Exception as e:
        summary_data = f"无法加载完整摘要: {str(e)}"

    async def sse_event_generator():
        try:
            async for chunk in generate_ai_stream(prompt, context_data=summary_data):
                if isinstance(chunk, str) and chunk.startswith("⚠️ [错误类型:"):
                    payload = json.dumps({"error": chunk, "done": False}, ensure_ascii=False)
                else:
                    payload = json.dumps({"token": chunk, "done": False}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        except Exception as e:
            err_msg = f"⚠️ [错误类型: 未知异常]\n\n{str(e)}"
            payload = json.dumps({"error": err_msg, "done": False}, ensure_ascii=False)
            yield f"data: {payload}\n\n"
        payload_done = json.dumps({"done": True}, ensure_ascii=False)
        yield f"data: {payload_done}\n\n"

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")


@app.post("/api/ai/deep-analysis")
async def ai_deep_analysis_endpoint(request: dict, db: Session = Depends(get_db)):
    """
    AI 深度分析接口 (学员发展/教员质量/群体训练需求)
    """
    analysis_type = request.get("type", "pilot_development")
    target_name = request.get("target_name", "")
    filters = request.get("filters", {})

    query = db.query(Pilot)
    if filters.get("batch") and filters["batch"] != "all":
        query = query.filter(Pilot.source_label == filters["batch"])
    if filters.get("aircraftType") and filters["aircraftType"] != "all":
        query = query.filter(Pilot.aircraft_type == filters["aircraftType"])
    if filters.get("rank") and filters["rank"] != "all":
        query = query.filter(Pilot.technical_rank == filters["rank"])
    
    pilots = query.all()
    if not pilots:
        raise HTTPException(status_code=404, detail="未查询到符合条件的评估数据")

    pilots_list = [{'name': p.name, 'check_date': str(p.check_date), 'aircraft_type': p.aircraft_type, 'technical_rank': p.technical_rank, 'scores': {'KNO': p.kno_score, 'PRO': p.pro_score, 'FPA': p.fpa_score, 'FPM': p.fpm_score, 'COM': p.com_score, 'LTW': p.ltw_score, 'SAW': p.saw_score, 'WLM': p.wlm_score, 'PSD': p.psd_score}, 'ob_items': p.ob_items, 'comments': p.comments, 'examiner': p.examiner} for p in pilots]

    context_str = ""
    prompt = ""

    if analysis_type == "pilot_development":
        target = target_name if target_name else (pilots_list[0]['name'] if pilots_list else "")
        target_pilots = [p for p in pilots_list if p['name'] == target]
        if not target_pilots:
            raise HTTPException(status_code=404, detail=f"未找到学员 [{target}] 的历史评估数据")
        
        context_str = f"学员姓名: {target}\n评估次数: {len(target_pilots)}\n"
        for idx, tp in enumerate(target_pilots, 1):
            context_str += f"第{idx}次评估 ({tp['check_date']}, {tp['technical_rank']}): 得分={tp['scores']}, 评语='{tp['comments']}', 教员='{tp['examiner']}'\n"
        
        prompt = (
            f"请为学员【{target}】撰写一份【EBT 学员个人发展诊断与成长路线图报告】。\n"
            "报告必须包含以下小节：\n"
            "1. 核心胜任力优势与短板诊断\n"
            "2. 历史评估表现趋势与波动分析\n"
            "3. 风险预警与高频问题 (基于评语和低分项)\n"
            "4. 个性化 EBT 针对性训练建议 (推荐 ICAO Doc 9995 场景)"
        )

    elif analysis_type == "examiner_quality":
        examiners = list(set([p['examiner'] for p in pilots_list if p['examiner']]))
        context_str = f"统计范围：共 {len(examiners)} 名教员，{len(pilots_list)} 条评估记录。\n"
        for ex in examiners[:10]:
            ex_pilots = [p for p in pilots_list if p['examiner'] == ex]
            avg_s = sum([sum(p['scores'].values())/9.0 for p in ex_pilots]) / len(ex_pilots) if ex_pilots else 0
            comments_sample = " | ".join([p['comments'] for p in ex_pilots if p['comments']][:3])
            context_str += f"教员 [{ex}]: 评估 {len(ex_pilots)} 人次, 给出平均分 {avg_s:.2f}, 评语样例: '{comments_sample}'\n"

        prompt = (
            "请撰写一份【教员评分严格度与评语质量分析报告】。\n"
            "报告必须包含以下小节：\n"
            "1. 教员评分分布与严格度/宽严偏置评估\n"
            "2. 评语书写质量分析 (具象化、建设性、可追踪性评分)\n"
            "3. 教员观察与评语撰写提升建议 (针对标准化与建设性)"
        )

    else:
        stats = calculate_statistics(pilots_list)
        comments = [p['comments'] for p in pilots_list if p['comments']]
        nlp_res = analyze_comments_smart(comments) if comments else {}

        context_str = (
            f"评估群体: 总人数 {stats.get('total_pilots')}, 总体均分 {stats.get('overall_average'):.2f}, 优秀率 {stats.get('score_distribution', {}).get('excellent', 0)} 人, 待改进 {stats.get('score_distribution', {}).get('poor', 0)} 人。\n"
            f"各胜任力维度平均分: {stats.get('average_scores')}\n"
            f"IATA 风险分布: {nlp_res.get('iata_risk')}\n"
            f"ICAO 威胁分布: {nlp_res.get('icao_threat')}\n"
            f"Doc 9995 训练主题占比: {nlp_res.get('doc9995_theme')}\n"
        )
        prompt = (
            "请撰写一份【整体及技术等级群体 EBT 训练需求分析与课程规划建议】。\n"
            "报告必须结合《ICAO Doc 9995 评估和培训主题矩阵》（包含恶劣天气与环境、航空器系统故障、发动机故障与失灵、火灾与烟雾处置、失常状态矫正UPRT、地形防撞与GPWS、空中交通与TCAS、导航降级与失效、通信失效与ATC差错、装载/燃油/性能差错、驾驶员失能、跑道危险状况等 12 大官方标准主题）：\n"
            "1. 整体胜任力短板与群体普遍风险总结\n"
            "2. 基于 IATA / ICAO 威胁分布的重点威胁研判\n"
            "3. 按技术等级 (如 Captain/FO, M3/F4) 的分类训练需求矩阵\n"
            "4. 针对性推荐 ICAO Doc 9995 评估与训练主题矩阵场景设计"
        )

    full_output = ""
    async for chunk in generate_ai_stream(prompt, context_data=context_str):
        full_output += chunk

    return {
        "type": analysis_type,
        "target_name": target_name,
        "report": full_output,
        "timestamp": datetime.now().isoformat()
    }


# ==================== 路由：分析工具 ====================

@app.post("/api/analysis/comments")
async def analyze_comments_endpoint(
    batch: str = Query(None),
    aircraft_type: str = Query(None),
    rank: str = Query(None),
    db: Session = Depends(get_db)
):
    """
    分析所有飞行员的评论
    
    返回：
    - 关键词频率
    - 风险标签分布
    - 情感倾向
    """
    index_file = os.path.join(get_static_dir(), "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="页面未找到")


# ==================== 主程序 ====================

if __name__ == "__main__":
    import uvicorn

    preferred_port = int(os.getenv("EBT_PORT", "8000"))

    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后：优先使用配置端口；若被占用，自动回退到下一个可用端口。
        try:
            uvicorn.run(
                app,
                host="127.0.0.1",
                port=preferred_port,
                log_level="info"
            )
        except OSError as exc:
            fallback_port = get_available_port(preferred_port)
            logger.warning(f"Port {preferred_port} is unavailable, retrying on port {fallback_port}: {exc}")
            uvicorn.run(
                app,
                host="127.0.0.1",
                port=fallback_port,
                log_level="info"
            )
    else:
        uvicorn.run(
            "main:app",
            host="127.0.0.1",
            port=preferred_port,
            reload=True,
            log_level="info"
        )
