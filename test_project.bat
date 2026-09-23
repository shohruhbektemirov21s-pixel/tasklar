@echo off
chcp 65001 > nul
title TeamFlow — Testlarni Yugurtirish
color 0D
cd /d "D:\Task"

echo ==============================================================================
echo       TEAMFLOW — AVTOMATIK TESTLARNI YUGURTIRISH
echo ==============================================================================
echo.

echo [1/2] FRONTEND TESTLARI (vitest)...
docker exec teamflow_frontend npm test
if %ERRORLEVEL% NEQ 0 (
    echo [FAIL] Frontend testlarida xatolik yuz berdi!
) else (
    echo [OK] Frontend testlari muvaffaqiyatli o'tdi!
)

echo.
echo ------------------------------------------------------------------------------
echo [2/2] BACKEND TESTLARI (Django test --noinput)...
docker exec teamflow_backend python manage.py test --noinput
if %ERRORLEVEL% NEQ 0 (
    echo [FAIL] Backend testlarida xatolik yuz berdi!
) else (
    echo [OK] Backend testlari muvaffaqiyatli o'tdi!
)

echo.
echo ==============================================================================
echo   Sinovlar yakunlandi.
echo ==============================================================================
pause
