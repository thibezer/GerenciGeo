# Arquitetura de Serviços do Backend (GerenciGeo)

Este documento descreve a organização da camada lógica do backend (`services/`), refatorada para seguir o Princípio da Responsabilidade Única (SRP) e o padrão Domain-Driven Design (DDD) básico. 

Todos os arquivos que antes ficavam concentrados de forma monolítica na pasta `business/` foram categorizados e segmentados em subpastas de acordo com o seu domínio funcional.

---

## 1. `services/documentacao/`
Responsável por toda a parte de exportação de peças técnicas, geração de shapefiles, laudos e documentos cartoriais.

- **`cartorio/` (Subpacote)**: Focado 100% na geração de documentos de cartório (requerimentos, anuências, laudos). Desmembrado para manter o SRP:
  - **`utils.py`**: Formatações de texto (CPF, datas) e cálculos geodésicos matemáticos nativos.
  - **`data_fetcher.py`**: Extração bruta de dados do SQLite (clientes, polígonos, confrontantes) via query.
  - **`anuencias.py`**: Relatórios focados nos vizinhos (Termos de Respeito de Divisas, Cartas de Confrontação, Anexos Gráficos).
  - **`laudos_imovel.py`**: Relatórios pertencentes estritamente ao próprio imóvel (Requerimentos, Manual do Proprietário, Laudos Técnicos).
- **`cartorio_generator.py`**: Atua exclusivamente como uma "Fachada" (Facade Pattern). Ele recebe a requisição das rotas FastAPI e a delega para os arquivos correspondentes na pasta `cartorio/`.
- **`exportacao_service.py`**: Orquestra a extração geral de documentos da nuvem, arquivos brutos ou pacotes de segurança.
- **`report_generator.py`**: Utilitário focado na injeção de dados para geração de arquivos DOCX ou laudos de fronteira genéricos.
- **`shape_exporter.py`**: Montador de Shapefiles. Transforma a geometria vetorial dos bancos de dados em pacotes compressos `.shp`, `.shx`, `.dbf`, injetando a projeção `.prj` correta de acordo com as normas.

---

## 2. `services/gestores/`
Arquivos do tipo `Manager`. São os orquestradores de regras de negócio estritas.

- **`cliente_manager.py`**: Lida com a criação, edição, atualização e formatação de proprietários, verificando duplicidades de CPFs e unificando contatos.
- **`confrontante_manager.py`**: Resolve o "Match" algorítmico entre vizinhos detectados no mapa (por exemplo de planilhas ODS) e os vizinhos cadastrados no banco de dados, cuidando para não criar confrontantes duplicados.
- **`levantamento_manager.py`**: O coração do projeto principal. Gerencia a exclusão e atualização em lote dos pontos do perímetro.
- **`workspace_manager.py`**: Gerenciamento do disco rígido e pastas dos projetos físicos do usuário (auditoria de espaço, deleção de arquivos inúteis, backup do banco de dados).
- **`cloud_sync.py`**: (Gestor de Sincronia) Conecta os metadados do projeto local com a nuvem (API externa).

---

## 3. `services/processamento/`
Focado no processamento de máquina "pesado", concorrência, geoprocessamento no elipsoide e manipulações espaciais.

- **`geoprocessamento.py`**: Translação tridimensional de pontos, conversão de Geodésicas para UTM (e vice-versa), cálculo de azimutes em grade e detecção automática de fuso e zona do equador.
- **`ppp_processor.py`**: Lida com o processamento assíncrono interagindo com a plataforma online do IBGE (PPP).
- **`gnss_worker.py`**: Trabalhador assíncrono executado em *Background Threads* (paralelismo) para processar cadernetas sem travar o painel de UI do usuário.
- **`historico_campo.py`**: Monta e registra a linha do tempo e a auditoria das translações e alterações sofridas em um perímetro ao longo do tempo.
- **`sigef_validator.py`**: Validador matemático e topológico puro. Verifica Sigma a 95% de confiança (Normas INCRA) e audita o perímetro buscando auto-interseções (polígono autocruzado).
- **`triagem_inteligente.py`**: Analisa arquivos brutos recém-colocados na mesa de trabalho, deduzindo do que se tratam pelo seu formato, leitura de cabeçalhos e metadados.

---

## 4. `services/parsers/`
Tradutores. Lêm arquivos brutos com codificações e layouts variados e os transformam em dados estruturados que o `GerenciGeo` entende.

- **`ccir_parser.py`**: Lê e extrai os dados oficiais formatados em relatórios CCIR/INCRA.
- **`txt_parser.py`**: Um grande canivete suíço para ler arquivos de texto (TXT/CSV), adivinhar se são pontos topográficos ou não, e injetá-los no motor de processamento.
- **`result_parser.py`**: Desempacota o `.zip` do processamento retornado pelo PPP do IBGE, achando o PDF do sumário e os arquivos de precisão associados.
- **`mem_editor.py`**: Processador rápido de descrições em memória, formatação legada ou manipulação textual temporária durante leituras intensas.
