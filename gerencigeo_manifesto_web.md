# 🌐 Manifesto de Especificação Técnica: Ambiente Web Cloud (Hostinger) — GerenciGeo v2.4

Este documento estabelece as diretrizes de arquitetura, modelo de banco de dados MySQL e regras de negócio da aplicação na nuvem (Hostinger), atuando exclusivamente como um **Hub Central de Consulta Rápida**.

---

## 🏗️ 1. Diretriz de Infraestrutura e Topologia Web
A hospedagem online opera de forma enxuta e isolada, sem carregar ferramentas pesadas do Windows ou realizar processamento espacial complexo.

- **Engine Web Leve (`cloud_api.py`):** Backend FastAPI online projetado para rodar em servidores Linux compartilhados. É estritamente proibida a importação de bibliotecas espaciais complexas (como `pyproj` ou `pyshp`) ou de integração com Windows (como `pywinauto` ou `pythonnet`).
- **Desativação de Ingestão:** Toda rota de upload de arquivos GNSS brutos e processamentos regulatórios retorna **HTTP 403 Forbidden** com a mensagem `"Operação restrita ao Software Desktop Local."`.
- **Deteção de Ambiente:** A flag de controle global em produção é definida como `RUNNING_LOCAL = False`.

---

## 💾 2. Modelagem do Banco de Dados Cloud (MySQL)
O banco de dados na nuvem armazena apenas metadados simplificados para fins de acompanhamento e monitoramento móvel. Não há tabelas de covariância (Sigma), arquivos RINEX brutos ou dados cadastrais de herdeiros. A estrutura do banco de dados MySQL na Hostinger possui apenas uma tabela simplificada:

### Tabela: `imovel_cloud` (ou equivalente de consulta)
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `nome_propriedade` (VARCHAR(150) NOT NULL)
- `municipio` (VARCHAR(100) NOT NULL)
- `uf` (VARCHAR(2) NOT NULL)
- `area_ha` (DOUBLE/FLOAT NOT NULL)
- `status_levantamento` (VARCHAR(30) DEFAULT 'EM_ANDAMENTO')
- `numero_matricula` (VARCHAR(50) NOT NULL)
- `limite_perimetral` (LONGTEXT - Contorno vetorial fechado consolidado em string **GeoJSON** ou **WKT (Well-Known Text)** projetada em WGS84 para plotagem no mapa Leaflet/Google Maps móvel).

---

## 🔄 3. Protocolo de Sincronização Unidirecional

A comunicação entre a máquina local e o servidor cloud Hostinger ocorre de forma atômica e assíncrona, sendo acionada via API pelo botão "Sincronizar com a Nuvem" do desktop local.

### A. Rota do Endpoint (`POST /api/v1/sync/imovel`)
- **Autenticação:** O cabeçalho HTTP de todas as requisições deve conter a chave `X-API-KEY` com o token de segurança estático configurado (`G4G2_SECURE_SYNC_TOKEN_7D8E2B9A1C`). Requisições com token ausente ou inválido são barradas com **HTTP 401 Unauthorized**.
- **Processamento:** O backend lê o payload JSON e realiza uma operação de *Upsert* (Update ou Insert caso não exista) na tabela do banco de dados na nuvem, atualizando a visualização espacial instantaneamente.

---

## 🖥️ 4. Regras do Frontend Online (Mesa de Trabalho Ocultada)

O frontend Vite compilado servido pela Hostinger detecta a origem de acesso e aplica restrições de controle visual:

### A. Detecção de Host
- O sistema analisa a origem da requisição (`window.location.origin`).
- Se a origem apontar para o servidor web externo da Hostinger (não contendo `localhost`, `127.0.0.1` ou `::1`), o app assume o modo **Hub Cloud**.

### B. Ocultação Reativa de Componentes
Para evitar erros de conexão com serviços locais inexistentes na nuvem:
1. **Mesa de Ingestão Ocultada:** As áreas de drag-and-drop de arquivos RINEX/GNS (`#triagem-dropzone` e `#homologacao-dropzone`) são ocultadas visualmente e desativadas no DOM.
2. **Workspace GNSS Ocultado:** O painel contendo a visualização dos diretórios físicos do Windows (`#painel-workspace-gnss`) e os botões de controle de arquivos locais são completamente ocultados.
3. **Restrição de Emissão de Peças:** Botões destinados a rodar automações ou gerar documentos pesados no computador do usuário são desativados.
4. **Alerta de Contexto:** Injeção de mensagem informativa discreta no rodapé/barra de status superior: `"Modo de Consulta Hub Web Ativo. Operações de Ingestão Restritas ao App Desktop."`
