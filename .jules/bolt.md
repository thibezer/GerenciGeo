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

## 2026-08-27 - Importação Inteligente de PDFs de Identidade (Auto-OCR / PyMuPDF) e Modais Ultra-Largos
**Learning:** O upload de PDFs de RG e CNH permite auto-preenchimento cadastral e custódia segura de documentos digitalizados sem redundância ou lentidão de digitação.
**Action:** Desenvolvido parser regex com PyMuPDF (`fitz`) em `services/processamento/identidade_parser.py`, endpoint multipart `POST /clientes/{id}/importar-identidade-pdf`, download via `GET /clientes/{id}/documentos/{doc_id}/arquivo`, dropzone com drag & drop no frontend e ampliação da largura do modal para 1040px (`--ui-modal-largura: 1040px`).



