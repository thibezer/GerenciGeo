@echo off
title GerenciGeo - Servidor Local
echo =========================================
echo  Iniciando GerenciGeo (Python 64-bit Admin)
echo =========================================
cd /d "%~dp0"
powershell -Command "Start-Process 'C:\Users\Thiago\AppData\Local\Programs\Python\Python312\python.exe' -ArgumentList '\"%~dp0main.py\"' -Verb RunAs -WorkingDirectory '%~dp0'"
