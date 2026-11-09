@echo off
title Datalift - Frontend (React + Vite)
echo ========================================================
echo   Demarrage de Datalift Frontend (React + TypeScript)
echo ========================================================
cd /d "%~dp0\apps\frontend"

echo [1/2] Installation des modules Node.js...
call npm install

echo.
echo [2/2] Lancement du serveur Vite sur http://localhost:5173 ...
echo.
call npm run dev
pause

