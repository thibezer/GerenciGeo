---
description: Atualização rápida e autônoma do código-fonte e sincronização com a Nuvem Hub
globs: 
---

# Workflow: Atualização Rápida do Sistema

Sempre que o usuário solicitar para **atualizar o sistema**, **baixar atualizações**, **sincronizar** ou usar `/atualizar-sistema`:

> ⚠️ **ATENÇÃO IA**: NÃO leia arquivos da base de código, NÃO monte planos complexos e NÃO execute testes demorados.

## Execução em 1 Passo:
Execute no terminal imediatamente:
```powershell
python atualizar.py
```

Esse script executa automaticamente de forma otimizada:
1. `git pull origin main`
2. Recompila o frontend (`npm run build`) se houver alterações
3. Sincroniza o banco de dados local com o Hub na Nuvem (Hostinger)

Apresente um resumo de 2 linhas ao usuário e finalize a resposta.
