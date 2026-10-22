@echo off
title GerenciGeo - Servidor Local
echo =========================================
echo  Iniciando GerenciGeo (Python 64-bit Admin)
echo =========================================
cd /d "%~dp0"
powershell -NoProfile -Command "$py = if (Test-Path 'C:\Users\Thiago\AppData\Local\Programs\Python\Python312\python.exe') { 'C:\Users\Thiago\AppData\Local\Programs\Python\Python312\python.exe' } elseif (Test-Path \"$env:LOCALAPPDATA\Programs\Python\Python312\python.exe\") { \"$env:LOCALAPPDATA\Programs\Python\Python312\python.exe\" } else { (Get-Command python -ErrorAction SilentlyContinue).Source }; if (-not $py) { $py = 'python' }; Start-Process $py -ArgumentList '\"%~dp0main.py\"' -WorkingDirectory '%~dp0'"
