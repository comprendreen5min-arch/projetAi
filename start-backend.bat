@echo off
title Datalift - Backend (FastAPI)
echo ========================================================
echo   Demarrage de Datalift Backend (FastAPI + Parquet)
echo ========================================================
cd /d "%~dp0\apps\backend"

echo [1/2] Verification et installation des dependances Python...
python -m pip install -r requirements.txt

echo.
echo [2/2] Lancement du serveur FastAPI sur http://127.0.0.1:8000 ...
echo Documentation interactive Swagger: http://127.0.0.1:8000/docs
echo.
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
pause

