@echo off
chcp 65001 > nul
title TeamFlow To'xtatish
echo ========================================================
echo   TeamFlow Loyihasini To'xtatish...
echo ========================================================
cd /d "D:\Task"
docker compose stop
echo.
echo ========================================================
echo   TeamFlow konteynerlari to'xtatildi.
echo ========================================================
timeout /t 3
