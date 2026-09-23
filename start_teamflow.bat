@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo [TeamFlow] Kompyuter yoqilganda avtomatik ishga tushirish
echo ========================================================

:: 1. Docker Desktop ishlayotganini tekshirish
tasklist /fi "imagename eq Docker Desktop.exe" | find /i "Docker Desktop.exe" >nul
if errorlevel 1 (
    echo [TeamFlow] Docker Desktop ishga tushirilmoqda...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
) else (
    echo [TeamFlow] Docker Desktop allaqachon ishlab turibdi.
)

:: 2. Docker daemon tayyor bo'lishini kutish (maksimal 120 soniya)
echo [TeamFlow] Docker tizimi tayyor bo'lishi kutilmoqda...
set /a attempts=0
:WAIT_DOCKER
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if errorlevel 1 (
    set /a attempts+=1
    if !attempts! geq 40 (
        echo [TeamFlow] Xatolik: Docker belgilangan vaqtda javob bermadi.
        exit /b 1
    )
    goto WAIT_DOCKER
)

echo [TeamFlow] Docker tayyor! Konteynerlar ishga tushirilmoqda...
cd /d "D:\Task"
docker compose up -d

echo ========================================================
echo [TeamFlow] Barcha servislar muvaffaqiyatli ishga tushirildi!
echo Frontend: http://localhost:5183
echo Backend API: http://localhost:8010/api/
echo ========================================================
