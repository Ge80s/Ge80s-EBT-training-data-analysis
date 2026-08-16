# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for EBT Analysis Platform (FastAPI + React)

打包说明：
- 入口：main.py
- 包含：前端静态资源 backend/dist
- 输出：单文件 EBT_Platform.exe
- 运行后自动打开浏览器访问 http://127.0.0.1:8000
"""

from PyInstaller.utils.hooks import collect_all, copy_metadata
import os
import sys

block_cipher = None

# 收集核心依赖资源
datas = []
binaries = []
hiddenimports = []

for pkg in ['pandas', 'sqlalchemy', 'jieba', 'fastapi', 'uvicorn', 'starlette', 'pydantic', 'openpyxl']:
    try:
        tmp_ret = collect_all(pkg)
        datas += tmp_ret[0]
        binaries += tmp_ret[1]
        hiddenimports += tmp_ret[2]
    except Exception as e:
        print(f"Warning: collect_all({pkg}) failed: {e}")

# 复制关键元数据（防止运行时 DistributionNotFound）
for pkg in ['fastapi', 'uvicorn', 'pandas', 'openpyxl', 'jieba']:
    try:
        datas += copy_metadata(pkg)
    except Exception:
        pass

# 隐藏导入补充
hiddenimports += [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'sqlalchemy.ext.baked',
    'sqlalchemy.sql.default_comparator',
    'pandas._libs.tslibs.np_datetime',
    'pandas._libs.tslibs.timedeltas',
    'openpyxl',
    'openpyxl.cell._writer',
    'jieba',
    'jieba.posseg',
    'business_logic',
    'models_database',
    'constants',
    'ai_service',
]

# 修复 conda 环境下 MKL DLL 名称不匹配问题
conda_bin = r'D:\miniconda3\envs\CBTA\Library\bin'
if os.path.exists(os.path.join(conda_bin, 'mkl_rt.2.dll')):
    binaries.append((os.path.join(conda_bin, 'mkl_rt.2.dll'), 'mkl_rt.dll'))

# 过滤掉不需要的 MPI/ScaLAPACK 相关二进制，避免依赖缺失的 impi.dll / msmpi.dll
filtered_binaries = []
for src, dst in binaries:
    name = os.path.basename(src)
    if any(pattern in name for pattern in [
        'mkl_blacs_intelmpi', 'mkl_blacs_msmpi', 'mkl_scalapack', 'mkl_cdft_core'
    ]):
        print(f"Excluding MPI binary: {name}")
        continue
    filtered_binaries.append((src, dst))
binaries = filtered_binaries

# 添加前端静态资源 dist 目录
# 注意：spec 文件在执行时 __file__ 不可用，使用 os.getcwd() 获取当前工作目录
# PyInstaller 会从 backend 目录执行该 spec
backend_dir = os.getcwd()
dist_dir = os.path.join(backend_dir, 'dist')
if os.path.isdir(dist_dir):
    datas.append((dist_dir, 'dist'))
    print(f"Info: bundled frontend static assets from {dist_dir}")
else:
    print(f"Warning: dist directory not found at {dist_dir}")

a = Analysis(
    ['main.py'],
    pathex=[backend_dir],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'pandas.tests',
        'numpy.tests',
        'numpy.testing',
        'pytest',
        'unittest',
        'doctest',
        'tkinter',
        'matplotlib',
        'scipy',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='EBT_Platform',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(backend_dir, 'plane.ico') if os.path.exists(os.path.join(backend_dir, 'plane.ico')) else None,
)
