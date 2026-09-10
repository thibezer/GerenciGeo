# 📊 Relatório de Auditoria e Revisão de Código Adversarial: Módulo de Clientes

**Data:** 10 de Setembro de 2026  
**Escopo:** Banco de Dados SQLite, Regras de Negócio (Backend), API REST e Modal de Cadastro/Edição (Frontend)  
**Metodologia:** `/audit` (Avaliação 360° em 8 Vetores) & `/review` (Revisão Adversarial OWASP Top 10, Performance, SOLID)  

---

## 1. Resumo Executivo & Veredito

- **Veredito Geral:** ⚠️ **Aprovado com Ressalvas Críticas (Changes Requested - Ação Imediata Necessária)**
- **Nível de Risco:** **ALTO (Presença de 2 Blocker P0: Vazamento de Credencial em Log de Auditoria e Impossibilidade de Inserir CNPJ no Cadastro de PJ)**
- **Componentes Avaliados:**
  - `database/models.py` (DDL, Migrações e Índices)
  - `database/repository.py` (`ClienteRepo` e `PropriedadeClienteRepo`)
  - `services/gestores/cliente_manager.py` (Lógica de Domínio, Criptografia, Histórico e Auditoria)
  - `routes/clientes.py` (Endpoints FastAPI e Schemas Pydantic)
  - `frontend/src/views/clientes/clientes_template.ts` (Modal de Cadastro, Modal de Detalhes e Tabela)
  - `frontend/src/views/clientes.ts` (Controlador de UI, Validação, Máscaras e Submissão)
  - `frontend/src/views/clientes/clientes_service.ts` e `clientes_helpers.ts` (Serviços e Utilitários)
  - `tests/test_clientes_detalhes_seguranca.py` e `test_clientes_blockers.py` (Suíte de Testes)

---

## 2. Scorecard dos 8 Vetores de Qualidade (`/audit`)

| Vetor | Avaliação (0-10) | Status | Diagnóstico Resumido |
| :--- | :---: | :---: | :--- |
| **1. 🏛️ Arquitetura & Modularidade** | 6.5/10 | 🟡 Atenção | Desnormalização ambígua entre `pessoas`, `clientes` e `cliente_documentos` (colunas espelhadas com risco de *split-brain*). Bug latente em `PropriedadeClienteRepo.get_by_propriedade`. |
| **2. 🔒 Segurança & OWASP** | 5.0/10 | 🔴 Crítico | **Falha P0:** Senhas GOV em texto puro gravadas em `cliente_historico_logs` ao atualizar cadastro. Sem exclusão de PDFs confidenciais do disco ao deletar cliente. |
| **3. ⚡ Performance & Escalabilidade** | 6.0/10 | 🔴 Crítico | Ausência total de índices em chaves estrangeiras cruciais (`clientes.pessoa_id`, `cliente_metadados.id_cliente`, `cliente_documentos.pessoa_id`, `propriedade_clientes.cliente_id`). |
| **4. 🧪 Cobertura & Confiabilidade de Testes** | 6.5/10 | 🟡 Regular | Boa cobertura conceitual (15 testes), mas fragilidade de isolamento no `setUp` de `test_clientes_detalhes_seguranca.py` gerando falhas por resíduo de banco. |
| **5. 🧹 Manutenibilidade & UI/UX** | 5.5/10 | 🔴 Crítico | **Falha P0:** Modal de cadastro oculta o campo de CPF/CNPJ no modo PJ sem fornecer input alternativo. Atributo `required` em input oculto gera bloqueio nativo do browser. |
| **6. 📊 Observabilidade & Logging** | 7.5/10 | 🟢 Bom | Auditoria de acessos sensíveis (`cliente_acesso_logs`) muito bem desenhada, com IP e usuário, porém maculada pelo vazamento no histórico comparativo. |
| **7. 🛡️ Integridade de Tipagem & Contratos** | 7.0/10 | 🟡 Regular | Assimetria de contrato: `GET /clientes` traz `propriedades` e totais agregados, enquanto `GET /clientes/{id}` não traz. Campo `cnh_orgao_uf` tipado mas ausente no DOM do modal. |
| **8. 📖 Documentação & DX** | 8.0/10 | 🟢 Bom | Rotas intuitivas com aliases `/clientes` e `/api/clientes`, separação limpa de arquivos conforme manifesto do projeto. |

**Nota Geral Consolidada: 6.5 / 10**

---

## 3. Revisão Adversarial de Código (`/review`)

### 🔴 [BLOCKER 01] Vazamento Crítico de Senha GOV em Texto Puro no Log de Auditoria
- **Arquivo:** `services/gestores/cliente_manager.py:737-744`
- **Vulnerabilidade:** OWASP A02:2021 (Cryptographic Failures) / LGPD (Art. 46)
- **Problema:** Ao atualizar um cliente através de `atualizar_cliente(cliente_id, cli_data)`, o sistema executa um loop comparativo para registrar o histórico:
  ```python
  for campo, valor_novo in cli_data.items():
      if campo == 'metadados':
          continue
      valor_antigo = old_data.get(campo)
      ...
      if str_antigo != str_novo and valor_novo is not None:
          mgr.registrar_historico(cliente_id, campo, str_antigo, str_novo)
  ```
  Se o operador atualizar a senha GOV, `cli_data['senha_gov']` é enviado em texto puro. O loop compara com `old_data.get('senha_gov')` (que está criptografado `ENC:G4G2:...`), detecta diferença e **grava a senha em texto puro no banco de dados na coluna `valor_novo` de `cliente_historico_logs`**!
  Além disso, mesmo quando a senha **não é alterada**, o frontend envia `"••••••••"`, que é diferente da string criptografada, gerando um registro espúrio no histórico dizendo que a senha foi alterada para `"••••••••"`.
  O endpoint `GET /clientes/{id}/historico` expõe esses registros diretamente sem sanitização.
- **Correção Necessária:** Ignorar explicitamente o campo `'senha_gov'` no loop de histórico ou mascarar o valor:
  ```python
  if campo in ('metadados', 'senha_gov'):
      continue
  ```
  Se a senha foi realmente alterada, registrar apenas um evento discreto: `mgr.registrar_historico(cliente_id, 'senha_gov', '[CONFIDENCIAL]', '[ALTERADA]')`.

---

### 🔴 [BLOCKER 02] Modal de Cadastro: Campo CNPJ Inexistente no Bloco de Pessoa Jurídica (PJ)
- **Arquivo:** `frontend/src/views/clientes/clientes_template.ts:154-281` e `frontend/src/views/clientes.ts:109-136`
- **Severidade:** Usabilidade / Integridade de Dados / Quebra Funcional
- **Problema:** O campo com name `cpf_cnpj` (id `input-cpf-cnpj`, label "CPF") foi posicionado fisicamente dentro do contêiner `<div id="bloco-campos-pf">` (linha 174).
  Quando o usuário clica no alternador "Pessoa Jurídica (PJ)", a função `setTipoPessoa('PJ')` oculta `#bloco-campos-pf` com `classList.add('hidden')` e exibe `#bloco-campos-pj`.
  Entretanto, dentro de `#bloco-campos-pj` **não há campo de CNPJ** (apenas Razão Social, Fantasia, IE, IM, Data de Fundação e Representante).
  Consequências:
  1. O usuário não consegue inserir nem visualizar o CNPJ de uma empresa no modal de cadastro.
  2. O input `input-cpf-cnpj` possui o atributo nativo `required`. Ao estar oculto dentro de uma div `hidden`, alguns navegadores emitem o erro de submissão: `"An invalid form control with name='cpf_cnpj' is not focusable"`, impedindo a submissão do formulário.
- **Correção Necessária:** 
  Mover o campo `cpf_cnpj` para uma posição compartilhada ou replicar o campo no bloco PJ com label dinâmica "CPF" / "CNPJ" e máscara apropriada (14 dígitos), garantindo que no modo PJ o campo de CPF não fique required e invisível.

---

### 🟡 [WARNING 01] Ausência de Índices Secundários no Banco de Dados SQLite
- **Arquivo:** `database/models.py:49-137`
- **Impacto:** Degradação de desempenho $O(N)$ em listagens e filtros
- **Problema:** Uma inspeção via `PRAGMA index_list` revelou que as tabelas do ecossistema de clientes não possuem índices em chaves estrangeiras essenciais:
  - `clientes.pessoa_id`: FK utilizada em todos os JOINs com `pessoas`.
  - `cliente_metadados.id_cliente`: Utilizada na busca em lote `WHERE id_cliente IN (...)`.
  - `cliente_documentos.pessoa_id`: Utilizada na busca em lote `WHERE pessoa_id IN (...)`.
  - `cliente_historico_logs.id_cliente` e `cliente_acesso_logs.id_cliente`.
  - `propriedade_clientes.cliente_id`: Atualmente só existe índice composto iniciando por `propriedade_id`.
- **Correção Necessária:** Criar índices formais em `database/models.py`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_clientes_pessoa_id ON clientes(pessoa_id);
  CREATE INDEX IF NOT EXISTS idx_cliente_metadados_id ON cliente_metadados(id_cliente);
  CREATE INDEX IF NOT EXISTS idx_cliente_documentos_pessoa_id ON cliente_documentos(pessoa_id);
  CREATE INDEX IF NOT EXISTS idx_propriedade_clientes_cliente_id ON propriedade_clientes(cliente_id);
  CREATE INDEX IF NOT EXISTS idx_cliente_historico_id ON cliente_historico_logs(id_cliente);
  CREATE INDEX IF NOT EXISTS idx_cliente_acesso_id ON cliente_acesso_logs(id_cliente);
  ```

---

### 🟡 [WARNING 02] Desnormalização e Deriva de Dados entre `pessoas` e `clientes`
- **Arquivo:** `database/models.py`, `services/gestores/cliente_manager.py`
- **Problema:** Os seguintes campos foram adicionados tanto em `pessoas` quanto em `clientes`:
  `cnh_numero`, `cnh_categoria`, `cnh_validade`, `cnh_orgao_uf`, `rg_orgao`, `rg_uf`, `naturalidade`, `certidao_casamento_matricula`, `bairro`.
  Além disso, `cliente_documentos` também persiste documentos como RG e CNH.
  Ao cadastrar ou atualizar, `cliente_manager.py` grava simultaneamente em `pessoas` e em `clientes`. No entanto, na leitura (`GET /clientes`), a query busca exclusivamente de `pessoas` (`p.cnh_numero...`), ignorando os campos homônimos de `clientes`.
- **Risco:** Inconsistência de estado caso updates parciais ocorram em apenas uma das tabelas.
- **Correção Recomendada:** Definir `pessoas` como fonte única da verdade para dados civis/pessoais e manter em `clientes` estritamente dados comerciais e de relacionamento (`profissional_id`, `email`, `telefone`, `senha_gov`, `metadados`).

---

### 🟡 [WARNING 03] Assimetria nos Endpoints de Leitura (`GET /clientes` vs `GET /clientes/{id}`)
- **Arquivo:** `routes/clientes.py:164-321`
- **Problema:** O endpoint de listagem `GET /clientes` agrega e injeta:
  - `total_levantamentos`
  - `total_propriedades`
  - `propriedades` (lista detalhada com percentual de participação)
  - `documentos` e `metadados`
  Já o endpoint de detalhe individual `GET /clientes/{cliente_id}` busca apenas `documentos` e `metadados`, omitindo `propriedades`, `total_levantamentos` e `total_propriedades`.
- **Correção Necessária:** Uniformizar o retorno de `GET /clientes/{cliente_id}` para incluir as propriedades vinculadas e totais agregados.

---

### 🟡 [WARNING 04] Vazamento de Arquivos Físicos de Documentos em Disco (PDFs Órfãos)
- **Arquivo:** `services/gestores/cliente_manager.py:769-887`
- **Problema:** Ao excluir um cliente individualmente (`excluir_cliente`) ou em lote (`excluir_clientes_lote`), ou ao excluir um documento específico (`excluir_documento_cliente`), o sistema executa `DELETE` no banco de dados SQLite, mas **não apaga o diretório físico** de uploads (`uploads/documentos_clientes/<cliente_id>/`).
- **Risco:** Vazamento de armazenamento e permanência desnecessária de documentos sensíveis com foto (RG/CNH) após a exclusão do titular.
- **Correção Necessária:** Implementar limpeza segura do sistema de arquivos via `shutil.rmtree` no diretório do cliente ao remover o cadastro.

---

### 🟡 [WARNING 05] Fragilidade de Isolamento na Suíte de Testes
- **Arquivo:** `tests/test_clientes_detalhes_seguranca.py:20-43`
- **Problema:** O método `setUp` não limpa CPFs/CNPJs de teste previamente. Se um teste anterior falhar ou for interrompido antes do `tearDown`, a base `gerencigeo_test.db` mantém a pessoa cadastrada e todos os testes subsequentes que tentam cadastrar o mesmo CPF falham com `"CPF/CNPJ já cadastrado"`.
- **Correção Necessária:** Adicionar exclusão preventiva no `setUp` para todos os CPFs/CNPJs utilizados pela suíte.

---

### 🟢 [NITPICK 01] Bug Latente em `PropriedadeClienteRepo.get_by_propriedade`
- **Arquivo:** `database/repository.py:95-99`
- **Problema:** A query utiliza `SELECT pc.*, c.nome, c.id as cliente_id FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id`. A tabela `clientes` não possui coluna `nome` (está em `pessoas.nome`).
- **Correção Recomendada:** Ajustar para `JOIN clientes c ON pc.cliente_id = c.id JOIN pessoas p ON c.pessoa_id = p.id` e `p.nome`.

---

### 🟢 [NITPICK 02] Campo `cnh_orgao_uf` Ausente no Modal de Cadastro
- **Arquivo:** `frontend/src/views/clientes/clientes_template.ts:234-245`
- **Problema:** No bloco de CNH do modal de cadastro, existem inputs para Número, Categoria e Validade, mas falta o campo Órgão/UF (ex: DETRAN/PR), que já é suportado pelo backend e pelo modal de detalhes.

---

### 🟢 [NITPICK 03] Parse Frágil de Endereço na Edição
- **Arquivo:** `frontend/src/views/clientes.ts:768`
- **Problema:** Na função `abrirEdicaoCliente`, o código usa regex para separar logradouro e número a partir de `endereco_completo`:
  `const matchEnd = enderecoCompleto.match(/^(.*?)(?:,\s*([^,]+))?$/);`
  Sendo que `cli.endereco_sem_numero` e `cli.numero_endereco` já são retornados explicitamente pela API.
- **Correção Recomendada:** Priorizar o preenchimento direto a partir de `cli.endereco_sem_numero` e `cli.numero_endereco`.

---

## 4. Plano de Ação Priorizado (Roadmap)

### Prioridade P0 (Blockers Imediatos)
- [ ] **[Segurança]** Sanitizar o registro de histórico de auditoria em `cliente_manager.atualizar_cliente`, impedindo que `senha_gov` em texto puro seja salva em `cliente_historico_logs`.
- [ ] **[UI / Cadastro]** Corrigir o modal de cadastro em `clientes_template.ts` e `clientes.ts` para disponibilizar o campo de **CNPJ** quando o tipo for **PJ**, ajustando as validações e `required`.

### Prioridade P1 (Alta Prioridade)
- [ ] **[Banco de Dados]** Adicionar índices em `clientes(pessoa_id)`, `cliente_metadados(id_cliente)`, `cliente_documentos(pessoa_id)` e `propriedade_clientes(cliente_id)`.
- [ ] **[API / Contrato]** Sincronizar o endpoint `GET /clientes/{id}` para retornar propriedades vinculadas e totais de levantamentos/propriedades da mesma forma que `GET /clientes`.
- [ ] **[Testes]** Blindar o `setUp` de `test_clientes_detalhes_seguranca.py` com limpeza preventiva de CPFs/CNPJs de teste.

### Prioridade P2 (Média Prioridade)
- [ ] **[Storage / LGPD]** Implementar limpeza de arquivos físicos em disco ao excluir cliente ou documento.
- [ ] **[UI / Modal]** Adicionar campo `cnh_orgao_uf` no formulário de cadastro e utilizar `endereco_sem_numero`/`numero_endereco` nativos na edição.

### Prioridade P3 (Baixa Prioridade / Débito Técnico)
- [ ] **[Arquitetura]** Corrigir a query de `PropriedadeClienteRepo.get_by_propriedade` em `database/repository.py`.
- [ ] **[Database]** Planejar descontinuação gradual das colunas duplicadas em `clientes` em favor de `pessoas`.
