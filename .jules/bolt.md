## 2024-07-20 - Massive DOM element update performance bottleneck
**Learning:** When updating large sets of DOM elements concurrently (like map markers or table rows for mass selection), track previously selected IDs using a `Set` and exclusively update elements whose status has changed. Avoid clearing all elements globally (e.g., via generic `querySelectorAll`) as it causes severe performance freezes.
**Action:** Use specific DOM queries like `document.getElementById` and track previous state when performing bulk visual updates instead of selecting and iterating over all DOM nodes of a particular class.
## 2024-07-20 - N+1 Bottleneck in API Endpoints using execute_query loops
**Learning:** This codebase frequently relies on a `execute_query` utility function which returns lists of dictionaries. Due to this wrapper's simple synchronous nature without an ORM, relations (like fetching property clients or counts) are sometimes built using tight Python `for` loops containing multiple inner `execute_query` calls, creating severe N+1 latency bottlenecks.
**Action:** When optimizing data fetch operations, look for loops containing `execute_query`. Convert the logic to fetch all base items in one query (using subqueries for simple counts) and fetch related items via a single batch query using an `IN (...)` clause. Then, perform the grouping/mapping entirely in Python using `collections.defaultdict`. Also noted: `pywinauto` dependency breaks tests in Linux environments due to missing `pywin32`; run dependencies individually to bypass.
## 2024-05-24 - N+1 Bottleneck Fixed in GET /clientes
**Learning:** Replaced 4N looped queries inside get_clientes with batch queries using IN (...) and memory grouping (defaultdict).
**Action:** Confirmed that N+1 bottlenecks in SQLite wrappers should be solved with IN batched parameters combined with Python's dictionary mapping, removing database latency on iterating elements.
## 2024-07-23 - Batching queries with composite logic
**Learning:** When attempting to resolve N+1 queries in SQLite by fetching child relations associated with multiple parent identifiers (e.g. fetching points for a set of `matricula_id` and `levantamento_id` pairs), remember that SQLite does not gracefully support tuple matching in `IN` clauses like `(levantamento_id, matricula_id) IN (...)`.
**Action:** When batching SQL queries in SQLite with composite keys, fetch using an `IN` clause on the primary distinct key (e.g., `matricula_id IN (...)`), and enforce secondary grouping and constraints (like `levantamento_id`) purely in Python memory using dictionaries.

## 2026-07-26 - Fixed N+1 queries in batch update loop
**Learning:** Replaced individual nested queries with batch fetching using `IN (...)` clauses when processing updates to geodesic points and their segments in bulk. SQLite does not elegantly handle multiple individual SELECTs inside loops, which creates significant performance overhead.
**Action:** Always verify batch processing functions, pre-fetch needed dependencies outside loops, and map data locally with Python dictionaries to eliminate N+1 bottlenecks.

## 2024-05-24 - N+1 Bottleneck in Dashboard and Homologacao
**Learning:** Found N+1 query patterns in `services/processamento/triagem_inteligente.py` (fetching UTM fusos and Base durations) and `routes/levantamento/homologacao.py` (deleting segments and calculating counters).
**Action:** Replaced looped queries with batch queries (`IN (...)`) and used `collections.defaultdict` for memory grouping, and aggregated multiple query operations into single DB transaction contexts.
## 2024-05-24 - Fixed N+1 Bottlenecks in Batch operations
**Learning:** This codebase frequently performs repeated `execute_query` calls inside loops for operations that process lists of items (e.g. `routes/levantamento/pontos.py`, `routes/levantamento/documentos.py`, `database/repository.py`, etc). This creates severe N+1 bottlenecks.
**Action:** Replaced these loops with optimized `cursor.executemany` operations for updates/inserts and combined `execute_query` with `IN (...)` parameters for reads, properly mapped to the entities using python `defaultdict`. This reduced operation times significantly and adheres to optimal SQLite connection patterns.

## 2024-07-28 - pyproj.Transformer bottleneck in backend loops
**Learning:** Initializing `pyproj.Transformer.from_crs` inside a `for` loop over points causes severe backend processing slowdowns, as creating a transformer involves loading and compiling coordinate reference systems.
**Action:** Always instantiate `pyproj.Transformer` objects before iterating over points or use a caching dictionary (e.g., `transformers_cache = {}`) inside the loop to reuse instances when dealing with variable EPSG codes based on UTM zones.


## 2024-07-29 - Fixed N+1 queries in homologacao
**Learning:** In routes/levantamento/homologacao.py, there were N+1 queries during the deletion of `planilhas-homologadas` which recalculated the professional's counter individually per point type (`M`, `P`, `V`) instead of batching. A similar pattern was present when suggesting point codes. Another issue involved looping updates for `ordem_caminhamento` when sanitizing duplicate points in `routes/levantamento/pontos.py` instead of executing a batch update.
**Action:** Use `IN` clauses for grouping types inside query conditions, aggregate data in memory, and use `executemany` for batch update procedures instead of looping individual `execute` statements.

## 2026-08-27 - Criptografia em repouso, auditoria de senhas e layout responsivo de clientes
**Learning:** Armazenar senhas e segredos em texto puro no SQLite compromete a segurança e não gera trilha de conformidade. Em interfaces com Web Components, layouts rígidos baseados em grids com colunas fixas geram sobreposição de textos longos (ex: "NACIONALIDADEPROFISSÃO").
**Action:** Implementado módulo de criptografia simétrica autenticada (`services/seguranca/crypto_service.py`), mascaramento estrito por padrão em `GET /clientes`, revelação pontual com auditoria (`POST /clientes/{id}/revelar-senha`), layout responsivo auto-fit com `break-words`, suporte estruturado a Pessoas Jurídicas (vínculo de Representante Legal PF) e tabela de documentos com alerta de CNH vencida.

## 2026-08-27 - Alta densidade de dados, CSS Grid Defensivo e Microinterações Operacionais no Módulo de Clientes
**Learning:** Modais de power users com dados cadastrais e notariais densos requerem CSS Grid defensivo (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` com `min-w-0` em todas as células filhas) e hierarquia tipográfica assimétrica (labels em `text-[11px] font-medium uppercase text-white/40` e valores em `text-sm font-semibold text-white`) para eliminar colisões visuais.
**Action:** Implementada estrutura de qualificação civil expandida (CNH com categoria, validade e órgão/UF, RG com órgão/UF, Naturalidade e Matrícula da Certidão de Casamento), alternador de Pills RG ⇆ CNH com detecção de validade, card de cônjuge condicional para Casado/União Estável, e microinterações de alta produtividade (1-Click Copy com feedback visual de 2s e link direto sanitizado para WhatsApp `https://wa.me/55...`).

## 2026-08-28 - Resolução de Conflitos UNIQUE e Filtragem de Metadados na Importação ODS/SIGEF
**Learning:** Ao importar planilhas ODS/CSV homologadas para matrículas com pontos de campo preexistentes (`origem_homologada = 0`), a inserção falhava com `UNIQUE constraint failed: pontos.levantamento_id, pontos.matricula_id, pontos.nome_vertice, pontos.tipo_ponto`. Além disso, cabeçalhos de metadados como `"Sistema de referência SIRGAS2000"` eram parseados indevidamente como vértices com coordenadas nulas.
**Action:** Implementado UPSERT via `INSERT INTO pontos (...) VALUES (...) ON CONFLICT(...) DO UPDATE SET ...` em `persistir_pontos_homologados`, adicionada lista de bloqueio de termos de cabeçalho em `extract_codigo_parts` e validação estrita de coordenadas não-nulas nos parsers ODS e CSV.

## 2026-08-28 - Isolamento e Segregação de Múltiplos Perímetros em Planilhas e Abas Distintas
**Learning:** Na importação em lote de planilhas ODS/CSV, associar múltiplas planilhas/abas à mesma matrícula agrupava todos os vértices em uma única lista contínua, concatenando nomes de arquivo e conectando o último ponto de uma planilha ao primeiro da outra, gerando um perímetro fundido e distorcido. No Leaflet, o agrupamento considerava apenas `matricula_id`, fechando uma única polilinha para todas as planilhas.
**Action:** O pipeline de importação agora processa e persiste cada planilha/aba como um perímetro independente (`nome_planilha`), gerando segmentos fechados isolados para cada polígono. No Leaflet (`mapa_linhas.ts`), as polilinhas temporárias e homologadas agrupam os pontos pela chave composta `matricula_id` + `arquivo_origem`/`planilha_origem`, renderizando cada perímetro separadamente.

## 2026-09-09 - Paridade de campos e validação de nome em cadastro de clientes (Hostinger Cloud e Local)
**Learning:** O frontend enviava `nome_completo` no payload de salvamento de cliente, mas o backend PHP (`api.php`) no servidor Hostinger checava estritamente `$input['nome']`, disparando erro 400 informando que o nome era obrigatório mesmo com o campo preenchido.
**Action:** Implementado payload com chaves duplas (`nome` e `nome_completo`) com fallbacks diretos para a propriedade `value` dos Web Components na view, validação flexível com coalescência nos backends (`api.php` e `routes/clientes.py`), e suporte a todos os campos estendidos de cadastro nas queries de inserção e atualização.

## 2026-09-09 - Prevenção de Violação de Chave Única no MySQL por Strings Vazias (Erro 1062)
**Learning:** No MySQL/InnoDB, campos com índice `UNIQUE` (como `pessoas.cpf_cnpj`) permitem múltiplos registros com valor `NULL`, mas tratam a string vazia `''` como um valor não-nulo e único, disparando o erro fatal `1062 Duplicate entry '' for key 'cpf_cnpj'` ao cadastrar um segundo registro sem documento.
**Action:** Criada função `emptyToNull()` no `api.php` para normalizar todas as strings vazias ou com apenas espaços em `null` antes de gravar no banco, adicionada migração idempotente em `ensureSchema` para converter registros preexistentes corrompidos com `''` em `NULL`, e sanitizado o envio no frontend (`clientes.ts`) para despachar `null` explicitamente.

## 2026-09-24 - Qualificação de Confrontantes, Integridade de Pessoas e Ciclo de Vida do Form
**Learning:** O botão de salvar qualificação do confrontante falhava silenciosamente por leitura dependente do selectAnuencia.value e por manipulação indevida de .innerHTML no Web Component <ui-botao>. No backend, ao atualizar um confrontante para um CPF já existente, ocorria violação de restrição UNIQUE em pessoas.cpf_cnpj, e queries de anuência quebravam com OperationalError: no such column: c.genero devido à ausência dessa coluna na tabela confrontantes (armazenada em pessoas).
**Action:** O form agora possui ID explícito no dataset/hidden input, suporte a modo Novo e Edição, feedback com showToast, controle de loading via atributos nativos do <ui-botao> (carregando/disabled), e reatividade completa em <ui-lista-flutuante>. O backend agora trata colisões de CPF reutilizando o ID da pessoa já existente sem quebrar UNIQUE, utiliza LEFT JOIN com COALESCE nas rotas de confrontantes e anuências, sincronizando instantaneamente seletores e tabelas inter-abas.

## 2026-09-24 - Satélite de Fundo Opcional na Mesa de Trabalho
**Learning:** O Leaflet trata o primeiro parâmetro de `L.control.layers` como `baseLayers` de seleção exclusiva (`radio`). Por ter apenas a imagem do Google cadastrada, o satélite de fundo tornava-se obrigatório na UI, impedindo topógrafos de desativá-lo para trabalhar na tela limpa CAD/vetorial e consumindo requisições de tiles em `preCarregarTilesRegiao`.
**Action:** A camada de satélite foi convertida para sobreposição (`overlay`), ganhando checkbox no controle de camadas, um botão de alternância rápida na barra de ferramentas unificada (`UnifiedToolbarControl`), sincronização bidirecional com a janela de configurações CAD (`config_mapa.html`), salvamento em `localStorage` (`LS_KEY_CAMADAS`) e salvaguarda em `preCarregarTilesRegiao` para pausar o download de tiles quando inativo.


---

## 30. Pré-visualização Interativa do Trecho da Divisa de Anuência (Leaflet + Topologia Lindeira)
- **Problema**:
  1. No fluxo cartorial de emissão de Anuência de Confrontantes, o profissional agrimensor emitia a declaração sem ter conferência visual prévia de qual trecho exato da propriedade (quais vértices, qual extensão em metros e quais azimutes) compunha a divisa com aquele confrontante específico.
  2. Caso houvesse algum erro de mapeamento na cadeia de segmentos ou confrontantes trocados, o erro só era percebido após abrir o PDF ou documento gerado, gerando retrabalho e risco notarial.
- **Regra Obrigatória**:
  1. **Separação Geométrica de Contexto vs. Foco**: A rota de preview (`GET /levantamentos/{id}/matriculas/{matricula_id}/confrontantes/{confrontante_id}/preview-divisa`) retorna separadamente:
     - `poligono_imovel`: o contorno geral completo do imóvel, renderizado como polígono sutil com linha tracejada e preenchimento discreto;
     - `lindeira_coords`: a polilinha dos segmentos que confrontam com o vizinho selecionado, destacada em cor vibrante neon (`#00f5a0`) com marcadores circulares nos nós;
     - `metricas` e `segmentos`: vértice inicial e final do trecho, extensão total métrica rigorosa (GRS80/SIRGAS 2000) e lista de azimutes e distâncias de cada segmento.
  2. **Ciclo de Vida do Leaflet em Modais**: Toda instância do Leaflet criada em modais flutuantes deve:
     - Destruir a instância anterior com `previewMap.remove()` antes de reinstanciar para evitar vazamento de memória e conflitos de canvas;
     - Invocar `previewMap.invalidateSize()` após 250ms de exibição do modal para que o Leaflet recalcule as dimensões reais do contêiner;
     - Fazer `fitBounds()` com margem de segurança (`padding: [40, 40]`) para que o trecho lindeiro e seu contexto fiquem centralizados.
  3. **Acesso Unificado**: O recurso de pré-visualização deve ser acessível por múltiplos pontos de entrada:
     - Botão "Ver Trecho" (`#btn-preview-anuencia`) no seletor de anuências cartoriais;
     - Botão "Ver no Mapa" (`#btn-preview-divisa-form`) no formulário de qualificação do confrontante;
     - Botão de anuência rápida (`.btn-emitir-anuencia-rapida`) em cada linha da tabela de divisas perimétricas.


## 2026-10-01 - Sincronização Bidirecional de Exclusões com Tombstones e Endpoint de Lote
**Learning:** Excluir clientes ou registros no app local removia do SQLite, mas no próximo ciclo de sincronização automática com a nuvem, o pull baixava novamente o registro do MySQL da Hostinger e o reinseria (efeito fantasma), pois o motor de sincronização operava apenas com UPSERT sem rastreamento de remoções. Além disso, o botão de exclusão em lote no frontend (/clientes/excluir-lote) não existia no PHP da Hostinger, caindo na validação de criação de clientes com erro 400.
**Action:** Criada a tabela registros_excluidos no SQLite e no MySQL para gravação de tombstones. Atualizado cliente_manager.py para registrar exclusões, nuvem_sync.py para ignorar IDs excluídos no upsert e propagar array de exclusoes no push e pull, e implementado o endpoint /clientes/excluir-lote e suporte a tombstones no api.php da Hostinger.

## 2026-10-20 - Espelhamento e Paridade Escopada com Telas Online (Hub Web Cloud)
**Learning:** Alterações feitas em telas compartilhadas entre Desktop e Nuvem (como Dashboard, Clientes, Propriedades, etc.) deixavam o ambiente online defasado quando não eram espelhadas, ou quebravam em tempo de execução quando tentavam acessar arquivos locais (C:\) ou rotas inexistentes no PHP/MySQL.
**Action:** Sempre que uma tela for modificada, espelhar as alterações para a versão online respeitando o filtro de escopo ("só o que tem que ter lá"): ocultar recursos restritos ao desktop local via `!isLocal` / `.local-only-route`, implementar paridade de endpoints e queries em `frontend/public/api.php`, atualizar colunas no MySQL via `ensureSchema()`, mapear campos no `nuvem_sync.py` e validar a compilação com `npm run build`.

## 2026-10-26 - Tolerância a Vértices com Mesmo Nome e Fechamento na Importação de Cadernetas TXT
**Learning:** Arquivos de campo frequentemente contêm vértices com o mesmo rótulo (ex: `divisa`, `divisa1` em posições perimetrais distintas) ou o marco inicial repetido na última linha para fechar a poligonal. O `TxtGeodesicParser` rejeitava a importação com erro 400 (`ValueError`), e a tentativa de inserção violava a restrição `UNIQUE` do SQLite. Além disso, linhas Topcon com vírgulas duplas (separador vazio) falhavam na conversão numérica.
**Action:** Implementada desambiguação automática com sufixos sequenciais (`divisa_1`, `divisa_2`), preservando o nome de campo em `nome_original`; detecção e descarte do vértice inicial redundante no fechamento perimetral; salvaguarda contra colisões `UNIQUE` com banco de dados; e tolerância a colunas vazias na detecção de sigmas no Topcon.


## 2026-11-03 - Desambiguação Automática e Prevenção de Violação UNIQUE em Vértices Virtuais (Offset em Lote)
**Learning:** O cálculo de offset paralelo em lote (`POST /vertices-virtuais/confirmar-lote`) gerava nomes a partir de `V-01`, que colidiam com vértices virtuais existentes na matrícula, resultando em erro `UNIQUE constraint failed: pontos.levantamento_id, pontos.matricula_id, pontos.nome_vertice, pontos.tipo_ponto`.
**Action:** Implementado método `gerar_nomes_unicos` com suporte a `indice_inicial` e `nomes_existentes` em `MotorVerticesVirtuais`. Atualizada a rota `calcular-offset-lote` para buscar nomes prévios na matrícula e sugerir os próximos índices livres, e adicionada blindagem atômica de desambiguação em `confirmar-lote` e `confirmar` antes do INSERT. No frontend, atualizados `ferramenta_offset_mapa.ts` e `modal_vertice_virtual.ts` para calcular reativamente o próximo número virtual no preview e nas requisições.


## 2026-11-04 - Estabilidade e Foco no Painel de Propriedades na Edição e Colagem de Coordenadas de Bases
**Learning:** Ao editar ou colar coordenadas corrigidas (Este/Norte/Alt) em uma base (`tipo_ponto = 'B'`), o debounce do salvamento acionava `loadLevantamentoDetails()` e `atualizarPainelPropriedades()`, que substituía `tabelaEl.categorias` e destruía os elementos HTML na Shadow DOM, fazendo o painel recarregar sozinho, roubando o foco e descartando valores sendo digitados ou colados. Além disso, números com vírgula decimal (`744213,541`) ou pares de coordenadas colados de relatórios (IBGE PPP) eram rejeitados por falha de parsing.
**Action:** Removida a recarga do painel de propriedades (`loadLevantamentoDetails` / `atualizarPainelPropriedades`) em alterações de coordenadas de base, substituindo por sincronização silenciosa em background dos rovers traduzidos. Adicionada guarda de foco ativo em `atualizarPainelPropriedades()` para não reconstruir o painel enquanto o usuário estiver editando o mesmo vértice. Normalizado o parser `parseNumberOrNull()` para aceitar vírgulas e adicionado listener inteligente de `paste` para autopreenchimento de pares UTM e Geodésicas.


## 2026-11-24 - Correções P0 de Exportação (Shapefile, SIGEF/CSV, Snapshot) e UI (CPF opcional / Gleba Unificada)
**Learning:** `ShapefileExporter` consultava `c.nome_completo` sem `JOIN pessoas` (quebrando com `OperationalError`), usava nomes de campo DBF com 11 chars (`PROFISSIONA`, `RT_REGISTRO`) e ignorava `propriedades.codigo_ccir`. Em `ExportacaoService`, `_coletar_linhas_perimetro` exportava `lat/lon/alt` brutos sem `COALESCE(lat_corrigido, lat)`, e `gerar_snapshot_arquivamento` omitia `JOIN pessoas` (sem dados civis e arriscando `senha_gov`). No frontend, `propriedades.ts` chamava `c.cpf_cnpj.includes(t)` quebrando quando havia cliente sem CPF, e `mesa_trabalho.ts` filtrava pontos por `currentMatriculaId` em vez de `effectiveMatId` em matrículas de gleba unificada.
**Action:** Aplicado `JOIN pessoas` em `ShapefileExporter` e `gerar_snapshot_arquivamento` (removendo `senha_gov`), fallback de `codigo_ccir` e campos DBF <= 10 chars (`PROFISSION`, `RT_REGISTR`); `COALESCE(lat_corrigido, lat)` em `_coletar_linhas_perimetro`; guardas nulas no combobox de proprietários em `propriedades.ts`; e resolução de `effectiveMatId` nos pontos/zoom da gleba unificada em `mesa_trabalho.ts`. Coberto por `tests/test_exportacoes_p0.py`.


## 2026-11-24 - Correções P1 de Integridade Referencial, Exclusões Seguras e Tranca Read-Only
**Learning:** O middleware `verificar_tranca_read_only` ignorava requisições `PATCH`; `POST /levantamentos`, `PUT /levantamentos/{id}` e as rotas de PDF de matrícula não bloqueavam propriedades arquivadas nem impediam troca de `propriedade_id` com pontos vinculados; `DELETE /matriculas/{mid}` destruía segmentos/banco_pontos silenciosamente; `DELETE /planilhas-homologadas` apagava também segmentos de campo (`origem_homologada = 0`); `DELETE /confrontantes/{cid}` e `excluir_cliente` podiam apagar `pessoas` ainda usadas em coproprietários/usufruto; `cliente_manager.py` gravava `profissional_id or 1` hardcoded e duplicava lápides em `registros_excluidos`.
**Action:** Incluído `PATCH` em `verificar_tranca_read_only` (`routes/deps.py`); protegidas rotas de PDF de matrícula e `POST/PUT /levantamentos` (403 arquivada / 409 troca com dados vinculados); bloqueada exclusão de matrícula com pontos/segmentos/banco_pontos (409); escopada limpeza de segmentos homologados em `homologacao.py` (`origem_homologada = 1` + pontos da planilha); conectado `apagar_pessoa_se_orfa` em `segmentos.py` e checagem de coproprietários/usufruto em `cliente_manager.py` (removendo `or 1` e lápides manuais duplicadas). Coberto por `tests/test_integridade_p1.py`.


## 2026-11-24 - Correções P2 de Paridade e Sync Online (nuvem_sync.py <-> api.php)
**Learning:** `arquivos_enviados_ia` subia no push mas estava ausente de `ordem_tabelas` no `pull_dados_nuvem`; `confrontante_envolvidos_usufruto` estava fora do sync; `/sync/batch` sobrescrevia `lat/lon/alt` brutos de `pontos` com os corrigidos; `ensureSyncSchema` travava em `schema_sync_v5` e faltavam colunas de paridade no MySQL (`alt_original`, `sigma_e`, `sigma_n`, `representante_json`, `titular_assina`, `conjuge_assina`, `assina`, `valor_itr`, `matricula_origem_desenho_id`, `cliente_documentos.pessoa_id`); `GET /clientes` usava `COALESCE(COUNT(*), COUNT(*))` que nunca acionava fallback; `GET /levantamentos/{id}/matriculas` consultava tabela fantasma `levantamento_matriculas`; e rotas de propriedades/matrículas no `api.php` omitiam `touchCloudSyncTimestamp` e bloqueios `409` na exclusão.
**Action:** Incluída `confrontante_envolvidos_usufruto` em `TABELAS_SINCRONIZAVEIS`, `SYNC_TABELAS_MYSQL` e `/sync/batch`; `pull_dados_nuvem` agora inclui `arquivos_enviados_ia`, `confrontante_envolvidos_usufruto` e deriva automaticamente qualquer tabela nova de `SYNC_TABLES`; `/sync/pull` usa `SYNC_TABELAS_MYSQL`; `/sync/batch` preserva `lat/lon/alt` brutos; `ensureSyncSchema` atualizado para `schema_sync_v6` com todas as colunas de paridade; e corrigidas as rotas de clientes, propriedades, matrículas e levantamentos no `api.php`. Coberto por `tests/test_sync_paridade_p2.py`.


## 2026-11-24 - Limpeza P3 de Código Morto, Rota Temporária e Arquivos Residuais
**Learning:** Existiam símbolos e rotas mortas acumuladas no backend (`/documentos/anuencia-forcada-james`, `ClienteRepo`/`PropriedadeRepo`/`PropriedadeClienteRepo` quebrados em `database/repository.py`, `gerar_requerimento_html`/`gerar_termo_anuencia_html` legados com `KeyError` em `levantamento_manager.py`, bloco inalcançável `corrigir_lote_rtk`, `ORIGINAL_TEMPLATES_DIR` apontando para Google Drive pessoal), além de 69 arquivos em `scratch/` e `pedido_prorrogacao_cripa_10189_11748.html` versionados no Git e 13 arquivos residuais soltos na raiz.
**Action:** Removidos os símbolos, modelos, imports e rotas mortas no backend; movidos os 7 HTMLs ad-hoc e 6 `.db` residuais da raiz para `Arquivos de teste/`; adicionados `scratch/` e `/pedido_prorrogacao_*.html` ao `.gitignore` e removidos do rastreamento Git (`git rm --cached`) preservando os arquivos localmente.
