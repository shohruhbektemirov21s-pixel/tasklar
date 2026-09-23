@echo off
chcp 65001 > nul
title TeamFlow — To'xtatish
color 0C
cd /d "D:\Task"

echo ==============================================================================
echo       TEAMFLOW — TIZIMNI XAVFSIZ TO'XTATISH
echo ==============================================================================
echo.
echo [*] Konteynerlar to'xtatilmoqda (Db2 tranzaksiyalari saqlanmoqda)...
docker compose stop

echo.
echo ==============================================================================
echo   [OK] Barcha TeamFlow konteynerlari toza to'xtatildi!
echo   Baza holati xavfsiz holatda saqlandi.
echo ==============================================================================
echo.
timeout /t 3
