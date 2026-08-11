# 📌 Aprendizados Arquiteturais e Diretrizes de Estabilidade (Jules & Antigravity)

Este arquivo registra lições aprendidas e padrões obrigatórios para evitar regressões, garantindo que recursos fundamentais do GerenciGeo continuem funcionando perfeitamente em atualizações futuras.

---

## 1. Prevenção de Erros de Desmontagem DOM em Navegações SPA (Leaflet / `invalidateSize`)
- **Problema**: Callbacks agendados via `setTimeout` ou registrados em ouvintes de eventos (scroll do container, resize de splitters) continuando ativos após a transição de telas no SPA Vanilla. Quando o usuário sai de uma tela (ex: da Mesa de Trabalho para Levantamentos), o objeto do mapa (`ctx.triagemMap`) ou seu container DOM é zerado (`null`). O uso de asserções não nulas (`ctx.triagemMap!.invalidateSize()`) provocava erro fatal em tempo de execução: `TypeError: Cannot read properties of null (reading 'invalidateSize')`.
- **Regra Obrigatória**:
  1. Nunca usar asserção de não-nulo `!` em métodos de mapas chamados de forma assíncrona ou em eventos de layout.
  2. Utilizar obrigatoriamente navegação opcional encadeada: `ctx.triagemMap?.invalidateSize?.()`.
  3. No método `invalidateSize()` das classes centrais ([mapa_core.ts](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho/mapa/mapa_core.ts) e [mapa_controller.ts](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho/mapa/mapa_controller.ts)), sempre encapsular a chamada ao Leaflet em blocos `try { ... } catch (err) {}` para absorver desanexações do DOM silenciosamente.

---

## 2. Comparação Robusta de Identificadores (String vs Number em JS/TS)
- **Problema**: APIs REST JSON e payloads SQLite podem retornar chaves primárias ou estrangeiras (`id`, `ponto_inicio_id`, `matricula_id`) alternando entre tipos `number` e `string`. O uso de igualdade estrita (`p.id === s.ponto_inicio_id`) causava falha silenciosa em `Array.prototype.find()`, impedindo o cruzamento dos vértices com os segmentos e fazendo com que a polilinha desaparecesse no mapa.
- **Regra Obrigatória**:
  1. Em qualquer filtro, busca ou associação por ID no frontend, sempre normalizar a comparação usando conversão explícita para string: `String(p.id) === String(s.ponto_inicio_id)`.
  2. Adicionar suporte a campos equivalentes/legados (ex: `s.tipo_limite_sigef || s.tipo_limite`).

---

## 3. Invariantes de Exibição Geométrica e Fallbacks Visuais
- **Problema**: Telas e organizadores (ex: Organizador de Perímetro) que dependem exclusivamente de dados persistidos no banco (como a tabela `segmentos`) deixavam o mapa em branco quando a ordem perimetral ainda não havia sido salva ou quando a requisição de segmentos retornava lista vazia.
- **Regra Obrigatória**:
  1. Todo visualizador de mapa perimetral deve possuir um mecanismo de fallback visual.
  2. Se a lista de segmentos estiver vazia ou indisponível (`!segmentos || segmentos.length === 0`), a view deve invocar imediatamente a renderização temporária (`plotPolilinhaTemporaria(pontosMat)`), garantindo que os vértices do imóvel rural fiquem visíveis sob qualquer condição.

---

## 4. Reorganização do Painel Lateral e Integridade dos IDs de Eventos
- **Problema**: Ao deslocar o **Ordenador Manual** para a barra lateral de propriedades (`#painel-propriedades`) durante a etapa `cartorio` (Organizador de Perímetro), a ocultação via classe utilitária `hidden` conflitou com a distribuição vertical de altura do Flexbox (`flex: 1; min-height: 0`), fazendo com que o container interno colapsasse e a lista de pontos/botões não aparecessem (ficando com altura 0px).
- **Regra Obrigatória**:
  1. Todos os IDs originais do Ordenador Manual (`input-search-ordenador`, `btn-inverter-sentido-ordenador`, `btn-auto-ordenar-vizinho`, `btn-travar-sequencia-pontos`, `btn-destravar-sequencia-pontos`, `lista-reordenar-simplificada`, `btn-salvar-ordem-simplificada`) devem ser rigorosamente preservados na estrutura `#props-panel-ordenador`.
  2. O container `#props-panel-ordenador` deve ser configurado com `style="display: none; flex: 1; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; padding: 8px;"` no HTML template.
  3. Ao alternar para a etapa `cartorio` em `ctx.alternarEtapa`, a visibilidade deve ser alternada ativando explicitamente `propsPanelOrdenador.style.display = 'flex'`, e a renderização da lista (`ctx.renderListaReordenarSimplificada()`) acionada dentro de um `setTimeout` de 30ms para garantir a distribuição prévia das dimensões calculadas da DOM.

---

## 5. Resolução de Pessoas e Invariante de Chave Estrangeira em Confrontantes (`pessoa_id`)
- **Problema**: A importação de planilhas ODS/INCRA/SIGEF pela rotina `resolver_confrontantes_planilha` ou `levantamento_manager` tentava inserir novos confrontantes diretamente na tabela `confrontantes` sem criar previamente o registro cadastral na tabela `pessoas`. Como a coluna `confrontantes.pessoa_id` possui restrição de chave estrangeira com obrigatoriedade, a instrução falhava no SQLite com `IntegrityError: NOT NULL constraint failed: confrontantes.pessoa_id`.
- **Regra Obrigatória**:
  1. Qualquer rotina do backend que crie um confrontante novo deve sempre inserir a pessoa primeiro na tabela `pessoas` (`INSERT INTO pessoas (nome) VALUES (?)`), capturar o `pessoa_id = cursor.lastrowid` e então registrar o confrontante passando `pessoa_id`.
  2. Nenhuma query de inserção em `confrontantes` deve omitir a chave estrangeira `pessoa_id`.

---

## 6. Alternância de Fonte de Dados de Pontos (Campo ⇆ Planilha Homologada SIGEF)
- **Problema**: O usuário precisava visualizar e comparar a tabela e a poligonal no mapa entre os pontos em processamento no campo (brutos/corrigidos) e os vértices homologados definitivos da planilha ODS/CSV importada na aba **Peças de Cartório**.
- **Regra Obrigatória**:
  1. O estado de exibição deve ser controlado centralmente por `ctx.bancoPontosExibido`.
  2. Ao ativar a visualização da planilha homologada, a lista `ctx.bancoPontosList` deve ser convertida para a estrutura de `Ponto` no frontend, mapeando `codigo_completo` para `nome_vertice` e marcando `status_correcao: 'CORRIGIDO'`.
  3. Ao desativar, o sistema deve restaurar instantaneamente a exibição dos pontos brutos/corrigidos do levantamento de campo.
  4. Ao alternar a fonte para `planilha`, o backend busca os dados em `obter_tabela_pontos_homologados(id)`, calculando os azimutes e distâncias a partir dos vértices homologados da planilha.

---

## 7. Restrição de Sintaxe do SQLite em Migrações (`ALTER TABLE ADD COLUMN`)
- **Problema**: A tentativa de executar `ALTER TABLE levantamentos ADD COLUMN codigo_compartilhamento TEXT UNIQUE` falha silenciosamente ou gera `OperationalError` no SQLite, pois o SQLite não permite adicionar restrições `UNIQUE` ou `PRIMARY KEY` diretamente através do `ALTER TABLE ADD COLUMN`.
- **Regra Obrigatória**:
  1. Ao adicionar novas colunas que necessitem de unicidade em tabelas SQLite existentes, adicione a coluna apenas com seu tipo básico (ex: `ALTER TABLE ... ADD COLUMN codigo_compartilhamento TEXT`).
  2. Crie a unicidade separadamente através de um índice único: `CREATE UNIQUE INDEX IF NOT EXISTS idx_... ON tabela(coluna) WHERE coluna IS NOT NULL`.

---

## 8. Parsing de Valores Numéricos em Planilhas ODS (`office:value` vs `text:p`)
- **Problema**: Ao importar planilhas ODS (LibreOffice Calc) no módulo de "Peças de Cartório" (`homologacao.py`), as coordenadas UTM (Norte/Este) ficavam `None` no `banco_pontos`, fazendo com que os pontos não aparecessem no mapa nem nas tabelas. A causa raiz era que o parser XML extraía o texto apenas dos elementos `<text:p>` dentro de `<table:table-cell>`. Porém, em planilhas ODS, células numéricas frequentemente armazenam o valor real no **atributo** `office:value` da tag `<table:table-cell>`, e o `<text:p>` pode conter apenas a representação visual formatada (ou estar vazio).
- **Regra Obrigatória**:
  1. Todo parsing de células ODS no GerenciGeo deve incluir um fallback para ler o atributo `{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value` quando o conteúdo textual de `<text:p>` está vazio.
  2. Aplicar esse fallback em **todos** os blocos de extração de células ODS em `homologacao.py` (existem múltiplos blocos de parsing para diferentes fluxos de importação).

---

## 9. Submissão de Formulários com Web Components (`<ui-botao>` e `<ui-campo-texto>`)
- **Problema**: 
  1. Componentes customizados `<ui-botao tipo-submit>` já possuem lógica interna para disparar `form.requestSubmit()`. Adicionar ouvintes extras de `click` e `ui-click` no botão que também chamam `form.requestSubmit()` gera tripla submissão simultânea (executando 3 inserções no backend).
  2. Incompatibilidade nos nomes dos campos entre frontend (`area_registrada_ha`, `codigo_ccir`, `codigo_itr`, `denominacao_gleba`) e backend (`area_ha`, `ccir`, `itr`, `denominacao`), fazendo com que o Pydantic utilizasse os valores default (0.0/None), salvando os registros zerados no banco de dados.
- **Regra Obrigatória**:
  1. O componente `<ui-botao>` dispara `form.requestSubmit()` automaticamente via atributo `tipo-submit` ou `type="submit"`. Não registre ouvintes manuais de `click` ou `ui-click` chamando `form.requestSubmit()` em botões que já estejam dentro do `<form>`.
  2. Toda Pydantic model (`MatriculaCreate`) e rotas de banco devem aceitar ambos os nomes de propriedades (tanto os nomes abreviados quanto os completos), e os utilitários de exibição no frontend (`renderMatriculasTabelaHtml`) devem verificar fallbacks (`m.area_registrada_ha ?? m.area_ha`).
  3. Toda rota REST deve possuir alias quando o frontend invoca caminhos com diferentes nomenclaturas (ex: `@router.post("/propriedades/{id}/clientes")` e `@router.post("/propriedades/{id}/proprietarios")`).

---

## 10. Ingestão de Planilhas de Limites/Polígonos SIGEF (WKT) vs. Vértices e Renderização no Leaflet
- **Problema**: Ao importar planilhas de **Limites/Polígonos** (ex: `Limites_...csv` contendo `GEOMETRIA_WKT`), a rotina `importar_vizinho_csv` identificava `is_poligono_only = True` e encerrava a execução inserindo apenas os metadados do confrontante, sem converter nem salvar os vértices do perímetro na tabela `pontos`. Como resultado, a importação isolada de arquivos de Limites não exibia nenhum ponto ou linha no mapa.
- **Regra Obrigatória**:
  1. A função `parse_wkt_geometry(wkt_str)` em `geodesia_parser.py` deve extrair as coordenadas `(X, Y)` / `(Lon, Lat)` de geometrias `POLYGON`, `MULTIPOLYGON` e `LINESTRING`.
  2. A ingestão em `importar_vizinho_csv` deve obrigatoriamente converter a geometria WKT em pontos do perímetro quando a lista de vértices explicítos estiver ausente, salvando-os na tabela `pontos` e vinculando-os ao confrontante.
  3. A consulta `GET /levantamentos/{id}/pontos-vizinhos` deve utilizar `LEFT JOIN` nas tabelas `confrontantes` e `pessoas` para assegurar que nenhum ponto seja omitido no retorno da API.
  4. No frontend, após a importação, o mapa deve plotar os novos pontos vizinhos e disparar o enquadramento automático `fitBounds` com recálculo seguro `invalidateSize()`.

---

## 11. Propagação do Fuso UTM na Importação de Vizinhos (CSV/ODS)
- **Problema**: A rota POST `/levantamentos/{id}/importar-vizinho-csv` chamava `resolver_coordenadas_robust()` sem passar o fuso UTM do levantamento, assumindo a Zona 22S por padrão. Quando o levantamento estava em outra zona (ex: 21S, 23S, 24S), arquivos de vizinhos com coordenadas UTM (Este/Norte) eram convertidos para a zona errada, caindo longe ou resultando em Lat/Lon inválidos que o frontend descartava no mapa.
- **Regra Obrigatória**:
  1. A rota POST `/levantamentos/{id}/importar-vizinho-csv` deve aceitar o parâmetro `fuso_utm: int = Query(22)` no backend e repassá-lo para todas as chamadas a `resolver_coordenadas_robust(..., fuso_utm)`.
  2. No frontend (`mesa_geodesica.ts`), a requisição `fetch` de importação de vizinhos deve anexar `?fuso_utm=${fusoAtual}` na URL, obtendo o fuso ativo via `ctx.mapaController?.fusoUtm || 22`.

---


## 12. Sincronização Bidirecional CAD (Comando GCOPIAR AutoLISP & Upsert de Pontos no GerenciGeo)
- **Problema**: Ao ajustar vértices ou criar pontos virtuais (`V`) no AutoCAD/TopoCAD2000, o usuário precisava reimportar cadernetas inteiras ou recadastrar manualmente.
- **Regra Obrigatória**:
  1. O comando AutoLISP `GCOPIAR` (ou `GCOPIA`) em [gerencigeo_sync.lsp](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/recursos/autocad/gerencigeo_sync.lsp) deve varrer blocos de vértices com atributos e gravar no Clipboard do Windows no formato de payload estruturado oficial (`ACAO=NOVO;BLOCO=...;X=...;Y=...;Z=...;ATRIB(...)`).
  2. O backend FastAPI `POST /levantamentos/{id}/pontos/sincronizar-cad` deve realizar o parse linha a linha, convertendo coordenadas UTM Zona 22S para Geodésica SIRGAS 2000.
  3. Aplica **Upsert**: se o ponto já existir no levantamento por `nome_vertice`, ele atualiza coordenadas $(Lat, Lon, Alt)$, tipo e metadados. Se não existir, ele cria o novo vértice (ex: tipo `'V'`), recalcula a ordem de caminhamento e regenera as divisas perimetrais sem duplicar os registros.

---

## 13. Integridade de Imports em Refatorações Modulares de Rotas e Serviços
- **Problema**: Refatorações automatizadas que dividem arquivos extensos do backend (como `routes/levantamento/pontos.py` em submódulos `pontos_crud.py`, `pontos_acoes.py`, etc.) podem omitir referências cruzadas ou funções utilitárias internas (como `sanitizar_ordens_duplicadas(id)` em `get_pontos`). Isso resulta em `NameError: name 'sanitizar_ordens_duplicadas' is not defined` capturado silenciosamente pela rota e retornado como HTTP 500, fazendo com que a listagem de pontos venha vazia (`pontosList = []`) e nenhum vértice apareça na tabela ou no mapa.
- **Regra Obrigatória**:
  1. Sempre verificar com auditoria de bytecode / introspecção de variáveis globais (`co_names` vs `__globals__`) se todas as funções dos novos módulos possuem seus símbolos e dependências devidamente importados.
  2. Executar testes de integração direta nas rotas (`get_pontos(levantamento_id)`) para validar que os dados reais do banco SQLite são serializados e retornados sem exceções.


