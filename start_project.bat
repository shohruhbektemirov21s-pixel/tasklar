@echo off
chcp 65001 > nul
title TeamFlow Ishga Tushirish
echo ========================================================
echo   TeamFlow Loyihasi - Ishga Tushirish Skripti
echo ========================================================
echo.
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "D:\Task\autostart.ps1"
echo.
echo ========================================================
echo   TeamFlow tizimi tayyor!
echo   - Frontend:    http://localhost:5183/
echo   - Buyurtmalar: http://localhost:5183/buyurtmalar
echo   - Django API:  http://localhost:8010/
echo   - Admin Panel: http://localhost:8010/admin/
echo ========================================================
echo.
pause
