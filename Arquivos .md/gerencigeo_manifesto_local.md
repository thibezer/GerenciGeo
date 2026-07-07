# 💻 Manifesto de Especificação Técnica: Ambiente Desktop Local (Edge-First) — GerenciGeo v2.4

Este documento estabelece as diretrizes de arquitetura, modelagem de dados, automações locais e regras de cálculo espacial de alta precisão executadas diretamente na máquina do usuário (Edge-First).

---

## 🏗️ 1. Diretriz de Infraestrutura e Topologia Local
O ambiente local opera como uma aplicação **100% autônoma e de produção robusta**, responsável por toda a carga pesada de processamento geodésico, RPA do Windows e geração de peças regulatórias.

- **Engine de Negócio:** Servidor FastAPI local (`api.py` / `uvicorn`), orquestrando scripts e rotinas em `business/` (`txt_parser.py`, `geoprocessamento.py`, `cartorio_generator.py`).
- **Persistência de Alta Precisão:** SQLite físico local (`database/gerencigeo.db`), armazenando coordenadas brutas/corrigidas, matrizes de covariância M-Sigma, dados cadastrais e logs de auditoria.
- **Interface Desktop Nativa:** Wrapper em `pywebview` gerenciado em `ui/app.py` com garantia de UAC (User Account Control). Ele exige privilégios de Administrador no Windows para manipular portas físicas de coletores RTK (USB/COM) e comandar a ferramenta OLE/RPA do HGO.

---

## 🛠️ 2. Esteira GNSS, RPA e Organizador HGO
O ambiente local centraliza as rotinas de importação de campo e triagem inteligente:

### A. RPA do Conversor Hi-Target (ConvertRinex.exe)
- **Caminho Padrão:** `C:\Program Files (x86)\Hi-Target Geomatics Office\bin\ConvertRinex.exe`.
- **Fila com Debounce:** Acumula os uploads recebidos em lote por um período de **4.0 segundos** (`DebouncedHGOConverter`) antes de disparar uma única instância, evitando conflitos de foco e concorrência de janelas.
- **Exclusão Mútua (`hgo_global_execution_lock`):** Uma trava de concorrência que impede a quebra de chamadas do `pywinauto`.
- **Clipboard Nível Baixo:** Injeta os caminhos no clipboard do Windows via WinAPI Unicode (`user32.dll` / `kernel32.dll` via `ctypes`) para evitar truncamento em caminhos longos de rede.

### B. Algoritmo de Triagem e Organizador HGO (`triagem_inteligente.py`)
- **Filtro Filesize QC:** Rejeita arquivos RINEX/GNS menores que **50KB** (grava como falho no banco para liberação de espaço e auditoria).
- **Leitura Cronológica:** Abre e lê os cabeçalhos de observação RINEX para extrair `MARKER NAME`, `APPROX POSITION XYZ` (convertendo para lat/lon) e `TIME OF FIRST OBS`.
- **Fallback de Duração:** Varre reversamente os últimos 8KB do arquivo observacional em busca de registros de satélites para obter o `TIME OF LAST OBS` em caso de cabeçalhos incompletos.
- **Eleição de Bases e Associação de Rovers:** 
  - Arquivos com duração $\ge$ **1 hora (3.600 segundos)** são classificados como **Bases Estáticas**.
  - O sistema associa cada Rover $R$ à sua respectiva Base $B$ caso o tempo operacional do Rover esteja contido no da Base.
  - Copia o lote (Bases + Rovers + binários `.GNS` originais de campo) para pastas físicas dedicadas preparadas para importação direta no software HGO.

---

## 📐 3. Motor Geodésico, Translação e Faixa de Fronteira

### A. Translação Tridimensional ECEF
O processamento geodésico propaga a correção centimétrica da Base (pós-processada no IBGE-PPP) para todos os Rovers vinculados:
1. Converte a coordenada precisa da Base (Lat/Lon) em coordenadas planas UTM (Zona 22S / EPSG:31982).
2. Calcula o vetor Delta plano ($\Delta_E, \Delta_N, \Delta_H$) com base na diferença entre o processado e o bruto.
3. Aplica a translação em lote a todos os rovers.
4. Efetua a projeção reversa tridimensional (Bowring no elipsoide GRS80) salvando as coordenadas corrigidas no banco de dados SQLite.

### B. Invariante Matemática de Faixa de Fronteira (Módulo 8)
- **Regra de Isolamento:** O cálculo da distância determinística de 150 km do imóvel rural até a divisa internacional (Brasil-Paraguai) é estritamente elipsoidal. Aproximações planas simples são proibidas.
- **Fórmula de Cálculo:** Utiliza a biblioteca `pyproj.Geod(ellps="GRS80")` a partir da coordenada do marco de apoio base (tipo `'M'` prioritariamente corrigido) até o limite fixo internacional Brasil-Paraguai estabelecido na coordenada:
  - **Lat:** `-24.0671222`
  - **Lon:** `-54.2868778`
- **Geração de Peças:** Produz dinamicamente os Laudos de Localização em Faixa de Fronteira e os Requerimentos de Ratificação em formato HTML formatado pronto para impressão física via `window.print()`.

---

## 💾 4. Banco de Dados e Mapeamento do Banco CCIR

### A. Invariantes de Persistência (SQLite)
A tabela `pontos` local suporta atributos avançados de rastreabilidade:
- `status_ponto` (`TEXT`): Restrito a `('BRUTO', 'CORRIGIDO')` via CHECK constraint.
- `ponto_base_id` (`INTEGER`): Chave estrangeira que referencia a Base do levantamento que serviu de apoio.
- **Tranca Read-Only:** Projetos no status `'ARQUIVADO'` barram requisições de escrita (POST/PUT/DELETE) em pontos, segmentos e confrontantes.

### B. Mapeamento de CCIR
- Módulo de parsing de planilhas e banco de dados local para CCIR.
- Cruzamento e validação de CPFs/CNPJs de confrontantes e herdeiros com histórico cadastral.
- Armazenamento físico de caminhos de arquivos PDF das certidões cadastrais do INCRA e cruzamento com matrículas do cartório.
