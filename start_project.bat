@echo off
chcp 65001 > nul
title TeamFlow — Ishga Tushirish
color 0A
cd /d "D:\Task"

echo ==============================================================================
echo       TEAMFLOW — ENTERPRISE TASK ^& PROJECT MANAGEMENT SYSTEM
echo ==============================================================================
echo.
echo [*] Konteynerlar ishga tushirilmoqda...
docker compose up -d

echo.
echo [*] Servislar holati tekshirilmoqda...
timeout /t 3 > nul
docker ps --filter "name=teamflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo ==============================================================================
echo   TIZIM MANZILLARI:
echo ==============================================================================
echo   - Bosh sahifa (Frontend):  http://localhost:5183/
echo   - Buyurtmalar:             http://localhost:5183/buyurtmalar
echo   - Loyihalar:               http://localhost:5183/loyihalar
echo   - Vazifalar:               http://localhost:5183/vazifalar
echo   - Takliflar:               http://localhost:5183/takliflar
echo   - Django REST API:         http://localhost:8010/api/
echo   - Django Ma'muriyat:       http://localhost:8010/admin/
echo ==============================================================================
echo.

set /p userChoice="[?] Brauzerda http://localhost:5183 ni ochishni xohlaysizmi? (h/y/ENTER = Ha, n = Yo'q): "
if /i "%userChoice%"=="n" goto end
start http://localhost:5183/

:end
echo.
echo TeamFlow ishlamoqda. To'xtatish uchun stop_project.bat ni ishlating.
timeout /t 5
