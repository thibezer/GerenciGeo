## 2024-07-20 - Massive DOM element update performance bottleneck
**Learning:** When updating large sets of DOM elements concurrently (like map markers or table rows for mass selection), track previously selected IDs using a `Set` and exclusively update elements whose status has changed. Avoid clearing all elements globally (e.g., via generic `querySelectorAll`) as it causes severe performance freezes.
**Action:** Use specific DOM queries like `document.getElementById` and track previous state when performing bulk visual updates instead of selecting and iterating over all DOM nodes of a particular class.
## 2024-07-20 - N+1 Bottleneck in API Endpoints using execute_query loops
**Learning:** This codebase frequently relies on a `execute_query` utility function which returns lists of dictionaries. Due to this wrapper's simple synchronous nature without an ORM, relations (like fetching property clients or counts) are sometimes built using tight Python `for` loops containing multiple inner `execute_query` calls, creating severe N+1 latency bottlenecks.
**Action:** When optimizing data fetch operations, look for loops containing `execute_query`. Convert the logic to fetch all base items in one query (using subqueries for simple counts) and fetch related items via a single batch query using an `IN (...)` clause. Then, perform the grouping/mapping entirely in Python using `collections.defaultdict`. Also noted: `pywinauto` dependency breaks tests in Linux environments due to missing `pywin32`; run dependencies individually to bypass.
## 2024-05-24 - N+1 Bottleneck Fixed in GET /clientes\n**Learning:** Replaced N$ looped queries inside  with batch queries using  and memory grouping ().\n**Action:** Confirmed that N+1 bottlenecks in SQLite wrappers should be solved with  batched parameters combined with Python's dictionary mapping, removing database latency on iterating elements.
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
