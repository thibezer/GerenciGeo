@echo off
chcp 65001 > nul
title GerenciGeo - Atualizador Rapido
echo ==================================================
echo       GERENCIGEO - ATUALIZANDO O SISTEMA...
echo ==================================================
python "%~dp0atualizar.py"
pause
