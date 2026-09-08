@echo off
chcp 65001 > nul
title TeamFlow GitHub Push
cd /d "D:\Task"

echo ================================================================
echo   TeamFlow loyihasini GitHub ga yuklash boshlandi...
echo   (Brauzer yoki login oynasi ochilsa, "Authorize" tugmasini bosing)
echo ================================================================
echo.

git push origin main

echo.
echo ================================================================
if %ERRORLEVEL% EQU 0 (
    echo   MUVAFFAQINATLI YUKLANDI! Barcha kodlar GitHub da.
) else (
    echo   Xatolik yuz berdi. Iltimos, yuqoridagi xabarni o'qing.
)
echo ================================================================
echo.
pause
