@echo off
chcp 65001 > nul
title TeamFlow - Tizim Holati
cd /d D:\Task
powershell.exe -ExecutionPolicy Bypass -NoProfile -File D:\Task\status.ps1
pause
