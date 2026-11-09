@echo off
title Datalift Launcher
echo ========================================================
echo   Lancement complet de Datalift (Sans Docker)
echo ========================================================
echo.
echo Ouverture du Backend dans une nouvelle fenetre...
start "Datalift Backend" cmd /k "%~dp0start-backend.bat"

echo Ouverture du Frontend dans une nouvelle fenetre...
start "Datalift Frontend" cmd /k "%~dp0start-frontend.bat"

echo.
echo ========================================================
echo   Les 2 services sont en cours de demarrage :
echo   - Backend FastAPI : http://127.0.0.1:8000 (Swagger: /docs)
echo   - Frontend React  : http://localhost:5173
echo ========================================================
echo Vous pouvez reduire cette fenetre.
pause

