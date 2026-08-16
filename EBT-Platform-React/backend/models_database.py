"""
数据库模型定义 - SQLAlchemy ORM

用于持久化存储：
- 飞行员评估数据
- 上传历史
- AI 分析记录
- 用户操作日志
"""

from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
import sys


def get_data_dir() -> str:
    """获取数据持久化目录：开发时用 backend 目录，打包后用 exe 所在目录。"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


# 数据库配置 — 使用绝对路径，确保无论从哪个工作目录启动都指向同一个文件
_DB_DIR = get_data_dir()
_DB_FILE = os.path.join(_DB_DIR, 'ebt_analysis.db')
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{_DB_FILE}')

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if 'sqlite' in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# ==================== 数据模型 ====================

class Pilot(Base):
    """飞行员基本信息与评估数据"""
    __tablename__ = "pilots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    check_date = Column(DateTime, default=datetime.utcnow)
    aircraft_type = Column(String)
    technical_rank = Column(String)
    
    # 9 维评分
    kno_score = Column(Float, default=0)  # 知识运用
    pro_score = Column(Float, default=0)  # 程序执行
    fpa_score = Column(Float, default=0)  # 飞行航迹管理-自动
    fpm_score = Column(Float, default=0)  # 飞行航迹管理-手动
    com_score = Column(Float, default=0)  # 沟通
    ltw_score = Column(Float, default=0)  # 领导力与团队合作
    saw_score = Column(Float, default=0)  # 情景意识
    wlm_score = Column(Float, default=0)  # 工作负荷管理
    psd_score = Column(Float, default=0)  # 问题解决与决策
    
    comments = Column(Text)
    examiner = Column(String)
    ob_items = Column(JSON)  # 行为观察项
    
    # 扩展字段（用于批次管理和多维度筛选）
    source_label = Column(String, index=True)  # 数据来源/批次标签
    training_type = Column(String)  # 训练类型（如 LOFT、LOE）
    overall_result = Column(String)  # 总体合格率结果
    final_conclusion = Column(String)  # 最终结论分布
    
    # 关系
    upload_id = Column(Integer, ForeignKey('uploads.id'))
    upload = relationship("Upload", back_populates="pilots")


class Upload(Base):
    """文件上传记录"""
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_path = Column(String)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    row_count = Column(Integer)
    source_label = Column(String)  # 批次标签（默认取文件名或自定义）
    
    pilots = relationship("Pilot", back_populates="upload")


class AiAnalysis(Base):
    """AI 分析记录"""
    __tablename__ = "ai_analyses"

    id = Column(Integer, primary_key=True, index=True)
    prompt = Column(Text)
    response = Column(Text)
    context_data = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    model_used = Column(String)


class UserAction(Base):
    """用户操作日志"""
    __tablename__ = "user_actions"

    id = Column(Integer, primary_key=True, index=True)
    action_type = Column(String)  # 'upload', 'filter', 'export', 'ai_query'
    details = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)


# 初始化数据库
def init_db():
    """创建所有表"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
