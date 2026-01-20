# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for Abrams13F

import os

block_cipher = None

# Get the project root directory
project_root = os.path.dirname(os.path.abspath(SPEC))

# Data files to include
datas = [
    # UI static files (built React app)
    (os.path.join(project_root, 'ui', 'dist'), 'ui/dist'),
    # CUSIP mapping data
    (os.path.join(project_root, 'CUSIP.csv'), '.'),
    # Backend data files
    (os.path.join(project_root, 'backend', 'data', 'CUSIP.csv'), 'backend/data'),
    (os.path.join(project_root, 'backend', 'data', 'sp500_sectors.csv'), 'backend/data'),
    (os.path.join(project_root, 'backend', 'data', 'manual_cusip.csv'), 'backend/data'),
    # Include the entire backend directory (with services module) as source
    (os.path.join(project_root, 'backend'), 'backend'),
]

# Filter out non-existent files
datas = [(src, dst) for src, dst in datas if os.path.exists(src)]

a = Analysis(
    ['launcher.py'],
    pathex=[project_root, os.path.join(project_root, 'backend')],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'fastapi',
        'starlette',
        'pydantic',
        'webview',
        'clr_loader',
        'pythonnet',
        # Services as top-level (how main.py imports them)
        'services',
        'services.database',
        'services.orchestrator',
        'services.parser',
        'services.sec_client',
        'services.cusip_mapper',
        'services.sector_mapper',
        'services.benchmark',
        'services.prices',
        'services.mimic_performance',
        # Also include backend.services paths
        'backend',
        'backend.main',
        'backend.services',
        'backend.services.database',
        'backend.services.orchestrator',
        'backend.services.parser',
        'backend.services.sec_client',
        'backend.services.cusip_mapper',
        'backend.services.sector_mapper',
        'backend.services.benchmark',
        'backend.services.prices',
        'backend.services.mimic_performance',
        'dotenv',
        'httpx',
        'yfinance',
        'pandas',
        'aiosqlite',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[os.path.join(project_root, 'runtime_hook.py')],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Abrams13F',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # No console window - pure GUI app
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(project_root, 'app_icon.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Abrams13F',
)
