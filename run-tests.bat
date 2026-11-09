@echo off
title Datalift - Tests (Pytest)
echo ========================================================
echo   Execution de la suite de tests Datalift
echo ========================================================
cd /d "%~dp0\apps\backend"

echo [1/2] Verification des dependances de test...
python -m pip install pytest httpx

echo.
echo [2/2] Lancement de pytest...
echo.
python -m pytest -v
pause

