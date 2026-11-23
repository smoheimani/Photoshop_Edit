@echo off
setlocal
set "ROOT=%~dp0"
set "PYTHON=%LOCALAPPDATA%\Photoshop_Edit\.venv\Scripts\python.exe"
set "SCRIPT=%ROOT%Prepare_Render_Masks.py"

if not exist "%PYTHON%" (
    echo Your Photoshop_Edit Python environment was not found at:
    echo %PYTHON%
    echo.
    echo Create the workspace environment and install requirements.txt first.
    pause
    exit /b 1
)

"%PYTHON%" "%SCRIPT%"
if errorlevel 1 (
    echo.
    echo Mask preparation failed. Review the error above.
    pause
    exit /b 1
)

echo.
pause
