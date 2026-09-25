# Guia Operacional para o Antigravity em Outro Computador (Setup & Atualização Contínua)

Este documento é a diretriz oficial para o agente **Antigravity (ou qualquer IA assistente)** configurar, instalar, sincronizar e atualizar o **GerenciGeo** em um segundo (ou novos) computador(es) da equipe.

---

## 1. Visão Geral da Arquitetura Distribuída

O GerenciGeo opera em arquitetura **Edge-First**:
- **Ambiente Local**: FastAPI + SQLite (`gerencigeo.db`) + PyWebView + Windows executando com alta performance gráfica e cálculos geodésicos offline.
- **Hub Nuvem (Hostinger)**: API centralizada com MySQL (`u941736878_gerencigeo`) protegida por autenticação (Bearer Token / BCrypt) que centraliza os dados e sincroniza alterações entre todas as máquinas autorizadas da equipe.

---

## 2. Instruções de Setup Inicial (Instalação em um Novo PC)

Quando o usuário solicitar: *"instale o sistema neste computador"* ou *"configure o GerenciGeo aqui"*:

### Passo 2.1: Obter o Código Fonte
```bash
git clone https://github.com/thibezer/GerenciGeo.git
cd GerenciGeo
```

### Passo 2.2: Instalar Dependências do Backend (Python)
Certifique-se de utilizar Python 3.12+ 64-bit no Windows:
```bash
pip install -r requirements.txt
```

### Passo 2.3: Compilar o Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

### Passo 2.4: Primeira Carga de Dados da Nuvem
Como o arquivo `gerencigeo.db` é protegido pelo `.gitignore`, o banco local iniciará vazio com as tabelas criadas automaticamente. Para carregar todos os dados da empresa:

1. Inicie o sistema:
   ```bash
   python main.py
   ```
2. Na barra superior/Ribbon da Mesa de Trabalho, clique no botão **Nuvem** (ou acesse via API `POST /nuvem/login`).
3. Informe as credenciais da empresa:
   - **E-mail**: `admin@gerencigeo.com.br` (ou o e-mail cadastrado pelo Thiago)
   - **Senha**: `admin123` (ou a senha corporativa definida)
4. Clique em **"Sincronizar Tudo"** (ou **"Baixar da Nuvem"**):
   O motor [`services/gestores/nuvem_sync.py`](file:///d:/Desenvolvimento/GerenciGeo/services/gestores/nuvem_sync.py) baixará todos os clientes, propriedades, matrículas, levantamentos, pontos e divisas para o `gerencigeo.db` local do novo computador!

---

## 3. Fluxo de Atualização Solicitado pelo Usuário

Sempre que o usuário solicitar no outro computador comandos como:
- *"Atualize o sistema"*
- *"Baixe as atualizações"*
- *"Puxe os dados novos"*
- Ou executar `/atualizar-sistema`

O Antigravity deve executar **obrigatoriamente e de forma autônoma** a seguinte sequência de 4 etapas:

### Etapa 1: Atualização do Código-Fonte (Git Pull)
```bash
git pull origin main
```
*Se houver conflitos locais, priorize as implementações mais recentes da branch remota.*

### Etapa 2: Recompilação do Frontend (se houver mudanças em `frontend/src/`)
```bash
cd frontend
npm run build
cd ..
```

### Etapa 3: Sincronização Bidirecional do Banco de Dados
Disparar a sincronização dos dados com o Hub na Nuvem para receber tudo o que foi cadastrado em outros computadores e subir o que este computador fez:

**Opção A — Via script Python autônomo:**
```python
import asyncio
from services.gestores.nuvem_sync import sincronizar_tudo

resultado = asyncio.run(sincronizar_tudo())
print(resultado)
```

**Opção B — Via endpoint da API local (se o servidor estiver rodando):**
```bash
curl -X POST http://127.0.0.1:8000/nuvem/sincronizar
```

### Etapa 4: Validação de Estabilidade
Executar a suíte completa de testes para certificar que o ambiente está 100% operacional:
```bash
python -m unittest discover -s tests -p "test_*.py"
```

---

## 4. Endpoints e Credenciais da Nuvem Hostinger

- **Hub URL**: `https://darkgray-duck-674813.hostingersite.com/api.php`
- **Status da Conexão**: `GET /nuvem/status`
- **Login**: `POST /nuvem/login` com payload `{"email": "...", "password": "..."}`
- **Sincronizar Tudo**: `POST /nuvem/sincronizar`
- **Baixar Dados (Pull)**: `POST /nuvem/pull`
- **Enviar Dados (Push)**: `POST /nuvem/push`

---

## 5. Regras de Ouro de Segurança para o Antigravity
1. **Proteção do SQLite**: Nunca execute comandos destrutivos sem cláusula `WHERE` ou que apaguem `gerencigeo.db`.
2. **Tokens Seguros**: O arquivo de sessão local `nuvem_session.json` armazena o token do usuário logado e nunca deve ser commitado no repositório.
3. **Respostas em Português do Brasil**: Sempre se comunique com o usuário em PT-BR.
