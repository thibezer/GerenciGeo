---
description: Atualiza o código-fonte via Git e sincroniza os dados com a Nuvem Hub
globs: 
---

# Workflow: Atualização do Sistema e Sincronização

Sempre que o usuário solicitar para **atualizar o sistema**, **baixar atualizações** ou usar `/atualizar-sistema`:

## 1. Puxar o Código Mais Recente
Execute no terminal:
```powershell
git pull origin main
```

## 2. Recompilar o Frontend
Caso haja arquivos modificados no diretório `frontend/`:
```powershell
cd frontend
npm run build
cd ..
```

## 3. Sincronizar o Banco de Dados com a Nuvem Hub (Hostinger)
Dispare o pipeline de sincronização para atualizar o `gerencigeo.db` local com os dados mais recentes de outros computadores:
```powershell
python -c "import asyncio; from services.gestores.nuvem_sync import sincronizar_tudo; print(asyncio.run(sincronizar_tudo()))"
```

## 4. Validar Integridade
Execute a suíte de testes unitários:
```powershell
python -m unittest discover -s tests -p "test_*.py"
```

Apresente um resumo claro das atualizações de código e de registros sincronizados para o usuário.
