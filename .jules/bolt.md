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

## 2024-08-02 - pyproj.Transformer caching implemented centrally
**Learning:** Initializing `pyproj.Transformer.from_crs` is CPU/memory intensive and when placed inside loops (like coordinate transformation for sets of points) creates severe backend performance bottlenecks. Prior codebase contained several repeated calls to this and ad-hoc loop caching.
**Action:** Created `utils/transformer_cache.py` with `@functools.lru_cache` wrapping `Transformer.from_crs` and refactored all backend code to use this globally. This guarantees memory consistency and massive speed boosts during points manipulation or export loops. Always ensure cache keys are resilient (like handling string vs int for EPSG codes).
