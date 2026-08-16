@echo off
REM EBT Analysis Platform - One-click Build Script
REM Output: dist-exe/EBT_Platform.exe

setlocal enabledelayedexpansion

set PROJECT_DIR=%cd%
set FRONTEND_DIR=%PROJECT_DIR%\EBT-Platform-React
set BACKEND_DIR=%FRONTEND_DIR%\backend
set OUTPUT_DIR=%PROJECT_DIR%\dist-exe

echo.
echo ============================================
echo  EBT Analysis Platform - One-click Build
echo ============================================
echo.

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found
    pause
    exit /b 1
)

REM Check PyInstaller
python -c "import PyInstaller" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing PyInstaller...
    pip install pyinstaller
)

echo.
echo [1/4] Installing frontend dependencies...
cd /d %FRONTEND_DIR%
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Frontend npm install failed
    pause
    exit /b 1
)

echo.
echo [2/4] Building frontend production bundle...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)

echo.
echo [3/4] Copying frontend dist to backend...
if exist "%BACKEND_DIR%\dist" rmdir /s /q "%BACKEND_DIR%\dist"
xcopy /e /i /q "%FRONTEND_DIR%\dist" "%BACKEND_DIR%\dist"
if %errorlevel% neq 0 (
    echo [ERROR] Copy dist failed
    pause
    exit /b 1
)

echo.
echo [4/4] Running PyInstaller to package backend + frontend...
cd /d %BACKEND_DIR%
if exist "build" rmdir /s /q "build"
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
python -m PyInstaller EBT_Platform.spec --noconfirm --distpath %OUTPUT_DIR%
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller build failed
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Build completed
echo  Output: %OUTPUT_DIR%\EBT_Platform.exe
echo ============================================
echo.
pause
