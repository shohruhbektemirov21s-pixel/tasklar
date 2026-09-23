@echo off
chcp 65001 > nul
title TeamFlow — Qayta Ishga Tushirish (Restart)
color 0E
cd /d "D:\Task"

echo ==============================================================================
echo       TEAMFLOW — QAYTA ISHGA TUSHIRISH (RESTART)
echo ==============================================================================
echo.
echo [*] Konteynerlar to'xtatilmoqda...
docker compose stop

echo.
echo [*] Konteynerlar qayta ishga tushirilmoqda...
docker compose up -d

echo.
echo [*] Konteynerlar holati tekshirilmoqda...
timeout /t 3 > nul
docker ps --filter "name=teamflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo ==============================================================================
echo   [OK] TeamFlow qayta ishga tushirildi!
echo   - Frontend:    http://localhost:5183/
echo   - Django API:  http://localhost:8010/api/
echo   - Admin Panel: http://localhost:8010/admin/
echo ==============================================================================
echo.
timeout /t 5
