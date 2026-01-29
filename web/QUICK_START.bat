@echo off
REM Examiner-CTM v5.2 Quick Start Batch Script
REM Usage: QUICK_START.bat

setlocal enabledelayedexpansion

echo.
echo ========================================================================
echo          Examiner-CTM v5.2 Quick Start Setup
echo ========================================================================
echo.

REM Get current directory
set "currentDir=%cd%"
echo Current directory: %currentDir%
echo.

REM Navigate to examiner-ctm directory
echo Navigating to examiner-ctm root directory...
echo.

REM Check if we're already in examiner-ctm
if "%~n0"=="QUICK_START.bat" (
    if exist "run_training.py" (
        echo.
        echo [OK] Already in examiner-ctm directory: %cd%
        goto :setup_info
    )
)

REM Try to find examiner-ctm
if exist "examiner-ctm\run_training.py" (
    cd examiner-ctm
    echo [OK] Found examiner-ctm subdirectory
    goto :setup_info
)

REM Try parent directory
cd ..
if exist "examiner-ctm\run_training.py" (
    cd examiner-ctm
    echo [OK] Found examiner-ctm in parent
    goto :setup_info
)

REM Try one more level up
cd ..
if exist "examiner-ctm\run_training.py" (
    cd examiner-ctm
    echo [OK] Found examiner-ctm two levels up
    goto :setup_info
)

echo [ERROR] Could not find examiner-ctm directory
echo Please ensure you're running this script from the correct location
pause
exit /b 1

:setup_info
echo.
echo Current location: %cd%
echo.
echo ========================================================================
echo Available Commands
echo ========================================================================
echo.

echo SETUP:
echo   1. Copy .env template:
echo      copy .env.example .env
echo   2. Edit .env with your API keys:
echo      notepad .env
echo.

echo TRAIN V5.2 WITH AUTO-GROUNDING:
echo   python run_training.py --steps 5000 --auto-pause --git-sync
echo.

echo MONITOR TRAINING:
echo   https://humanaiconvention.com/ctm-monitor/
echo.

echo DOCUMENTATION:
echo   - README.md (v5.2 architecture)
echo   - REPOSITORY_STRUCTURE.md (repository setup)
echo   - L4_DEPLOYMENT_GUIDE.md (cloud deployment)
echo.

echo ========================================================================
echo Files in this directory:
echo ========================================================================
echo.
echo   - *.py (training modules - 29 files)
echo   - README.md (complete documentation)
echo   - .env.example (configuration template)
echo   - run_training.py (training entry point)
echo   - docs/ (architecture guides)
echo.

echo ========================================================================
echo Ready to start training? Run:
echo ========================================================================
echo.
echo   python run_training.py --steps 5000 --auto-pause --git-sync
echo.

endlocal
