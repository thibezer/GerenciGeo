# 📌 Aprendizados Arquiteturais e Diretrizes de Estabilidade (Jules & Antigravity)

Este arquivo registra lições aprendidas e padrões obrigatórios para evitar regressões, garantindo que recursos fundamentais do GerenciGeo continuem funcionando perfeitamente em atualizações futuras.

---

## 1. Prevenção de Erros de Desmontagem DOM em Navegações SPA (Leaflet / `invalidateSize` / `_leaflet_pos`)
- **Problema**: 
  1. Callbacks agendados via `setTimeout` ou registrados em ouvintes de eventos (`moveend`, `zoomend`, `resize`, scroll) continuando ativos após a transição de telas no SPA Vanilla. Quando o usuário sai de uma tela (ex: do Dashboard para Clientes), `mapInstance.remove()` ou a troca de container HTML desanexa o `_mapPane` do Leaflet.
  2. Ao disparar eventos residuais ou tentar chamar `map.getCenter()`, `map.getBounds()`, `invalidateSize()` com o pane desanexado, o Leaflet invoca internamente `L.DomUtil.getPosition(this._mapPane)`, que tenta ler `undefined._leaflet_pos`, provocando erro fatal em tempo de execução: `TypeError: Cannot read properties of undefined (reading '_leaflet_pos')`.
- **Regra Obrigatória**:
  1. Nunca usar asserção de não-nulo `!` em métodos de mapas chamados de forma assíncrona ou em eventos de layout.
  2. Em qualquer ouvinte de evento de mapa (`moveend`, `zoomend`, etc.), sempre checar se `map` e `map._mapPane` existem antes de chamar `getCenter()` ou `getBounds()`, e encapsular a lógica em blocos `try { ... } catch (e) {}`.
  3. No método `cleanup` das rotas com mapa, sempre executar `mapInstance.off()` para desregistrar todos os ouvintes de eventos antes de chamar `mapInstance.remove()`.
  4. No método `invalidateSize()` das classes centrais ([mapa_core.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho/mapa/mapa_core.ts) e [mapa_controller.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho/mapa/mapa_controller.ts)), sempre encapsular a chamada ao Leaflet em blocos `try { ... } catch (err) {}` para absorver desanexações do DOM silenciosamente.

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

---

## 14. Custódia de Senhas GOV e Integridade de Dados Civis de Clientes
- **Problema**: O campo `senha_gov` era renderizado em texto puro nas tabelas e modais, violando boas práticas de segurança, e `data_nascimento_fundacao` era omitido nos comandos de `INSERT`/`UPDATE`/`SELECT`, além de `ExportacaoService` omitir os dados civis da pessoa no `DADOS_GERAIS.json`.
- **Regra Obrigatória**:
  1. A `senha_gov` deve ser mascarada por padrão no frontend (`••••••••`) e sua revelação deve exigir confirmação explícita do usuário via popup.
  2. O arquivo `DADOS_GERAIS.json` do workspace deve realizar `JOIN` na tabela `pessoas` para compilar o conjunto completo de dados civis dos proprietários e cônjuges, e **nunca** deve conter o campo `senha_gov`.
  3. Toda coluna declarada no modelo Pydantic e banco de clientes (`data_nascimento_fundacao`) deve ser obrigatoriamente persistida, consultada e vinculada aos formulários de cadastro e edição.

---

## 15. Isolamento Estrito do Banco de Testes e Proteção Anti-Wipeout
- **Problema**: Testes unitários rodando sem isolamento explícito de banco poderiam executar `DELETE` acidentalmente no arquivo `gerencigeo.db` de produção.
- **Regra Obrigatória**:
  1. A detecção de ambiente de testes em `config.py` e `tests/__init__.py` força automaticamente o uso de `gerencigeo_test.db` ao detectar runners de teste (`unittest`, `pytest`).
  2. O driver `database/connection.py` gera backups atômicos automáticos antes de conexões de escrita e intercepta/bloqueia qualquer comando `DELETE FROM <tabela_vital>` sem `WHERE` na base de produção.
  3. Todo arquivo de teste unitário deve utilizar dados com identificadores controlados e limpar estritamente os registros que criou (`DELETE FROM ... WHERE id IN (...)`), nunca limpando tabelas inteiras.

---

## 16. Criptografia em Repouso, Auditoria de Credenciais Sensíveis e Gestão Cadastral PF/PJ
- **Problema**: 
# 📌 Aprendizados Arquiteturais e Diretrizes de Estabilidade (Jules & Antigravity)

Este arquivo registra lições aprendidas e padrões obrigatórios para evitar regressões, garantindo que recursos fundamentais do GerenciGeo continuem funcionando perfeitamente em atualizações futuras.

---

## 1. Prevenção de Erros de Desmontagem DOM em Navegações SPA (Leaflet / `invalidateSize` / `_leaflet_pos`)
- **Problema**: 
  1. Callbacks agendados via `setTimeout` ou registrados em ouvintes de eventos (`moveend`, `zoomend`, `resize`, scroll) continuando ativos após a transição de telas no SPA Vanilla. Quando o usuário sai de uma tela (ex: do Dashboard para Clientes), `mapInstance.remove()` ou a troca de container HTML desanexa o `_mapPane` do Leaflet.
  2. Ao disparar eventos residuais ou tentar chamar `map.getCenter()`, `map.getBounds()`, `invalidateSize()` com o pane desanexado, o Leaflet invoca internamente `L.DomUtil.getPosition(this._mapPane)`, que tenta ler `undefined._leaflet_pos`, provocando erro fatal em tempo de execução: `TypeError: Cannot read properties of undefined (reading '_leaflet_pos')`.
- **Regra Obrigatória**:
  1. Nunca usar asserção de não-nulo `!` em métodos de mapas chamados de forma assíncrona ou em eventos de layout.
  2. Em qualquer ouvinte de evento de mapa (`moveend`, `zoomend`, `resize`, etc.), sempre checar se `map` e `map._mapPane` existem antes de chamar `getCenter()` ou `getBounds()`, e encapsular a lógica em blocos `try { ... } catch (e) {}`.
  3. No método `cleanup` das rotas com mapa, sempre executar `mapInstance.off()` para desregistrar todos os ouvintes de eventos antes de chamar `mapInstance.remove()`.
  4. No método `invalidateSize()` das classes centrais ([mapa_core.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho/mapa/mapa_core.ts) e [mapa_controller.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho/mapa/mapa_controller.ts)), sempre encapsular a chamada ao Leaflet em blocos `try { ... } catch (err) {}` para absorver desanexações do DOM silenciosamente.

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

---

## 14. Custódia de Senhas GOV e Integridade de Dados Civis de Clientes
- **Problema**: O campo `senha_gov` era renderizado em texto puro nas tabelas e modais, violando boas práticas de segurança, e `data_nascimento_fundacao` era omitido nos comandos de `INSERT`/`UPDATE`/`SELECT`, além de `ExportacaoService` omitir os dados civis da pessoa no `DADOS_GERAIS.json`.
- **Regra Obrigatória**:
  1. A `senha_gov` deve ser mascarada por padrão no frontend (`••••••••`) e sua revelação deve exigir confirmação explícita do usuário via popup.
  2. O arquivo `DADOS_GERAIS.json` do workspace deve realizar `JOIN` na tabela `pessoas` para compilar o conjunto completo de dados civis dos proprietários e cônjuges, e **nunca** deve conter o campo `senha_gov`.
  3. Toda coluna declarada no modelo Pydantic e banco de clientes (`data_nascimento_fundacao`) deve ser obrigatoriamente persistida, consultada e vinculada aos formulários de cadastro e edição.

---

## 15. Isolamento Estrito do Banco de Testes e Proteção Anti-Wipeout
- **Problema**: Testes unitários rodando sem isolamento explícito de banco poderiam executar `DELETE` acidentalmente no arquivo `gerencigeo.db` de produção.
- **Regra Obrigatória**:
  1. A detecção de ambiente de testes em `config.py` e `tests/__init__.py` força automaticamente o uso de `gerencigeo_test.db` ao detectar runners de teste (`unittest`, `pytest`).
  2. O driver `database/connection.py` gera backups atômicos automáticos antes de conexões de escrita e intercepta/bloqueia qualquer comando `DELETE FROM <tabela_vital>` sem `WHERE` na base de produção.
  3. Todo arquivo de teste unitário deve utilizar dados com identificadores controlados e limpar estritamente os registros que criou (`DELETE FROM ... WHERE id IN (...)`), nunca limpando tabelas inteiras.

---

## 16. Criptografia em Repouso, Auditoria de Credenciais Sensíveis e Gestão Cadastral PF/PJ
- **Problema**: 
  1. Credenciais sensíveis (ex: senha GOV) persistidas em texto plano no banco de dados violavam padrões de segurança e compliance, sem trilha de auditoria sobre quem acessou ou revelou a informação.
  2. Modais com grids de colunas fixas (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6`) colidiam títulos longos ("NACIONALIDADEPROFISSÃO") em diferentes resoluções.
  3. Falta de suporte estruturado a Pessoas Jurídicas (Razão Social, Nome Fantasia, IE, IM, Representante Legal) e múltiplos documentos com validade (ex: CNH, CREA).
- **Regra Obrigatória**:
  1. **Criptografia Simétrica em Repouso**: Dados sensíveis (senhas GOV) devem ser cifrados antes do `INSERT`/`UPDATE` usando CTR stream cipher + HMAC-SHA256 (`services/seguranca/crypto_service.py`) com prefixo identificador (`ENC:G4G2:`). A chave é gerenciada em `app_secrets.key` ou variável de ambiente.
  2. **Mascaramento por Padrão e Revelação Auditada**: O endpoint público `GET /clientes` nunca retorna a senha em texto claro (retorna `••••••••` e `tem_senha_gov: true`). A revelação ocorre estritamente via endpoint dedicado `POST /clientes/{id}/revelar-senha`, que registra o operador, IP e timestamp na tabela `cliente_acesso_logs`.
  3. **Layout Flexível Auto-Fit**: Grids de dados em modais devem usar `grid [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]` com `min-w-0`, `break-words` e `white-space: normal`, evitando qualquer colisão ou sobreposição de labels.
  4. **Suporte Completo PF/PJ & Documentos**: Formulários devem oferecer alternância PF/PJ com soft-hide (preservando preenchimento), vinculação de Representante Legal PF para empresas PJ, e tabela dinâmica `cliente_documentos` com detecção visual e badge de alerta para CNH vencida.

---

## 17. Design Corporativo de Alta Densidade, CSS Grid Defensivo e Microinterações Operacionais
- **Problema**:
  1. Em telas de power users (1280px a 1920px), textos e campos de identificação civil ficavam aglutinados ou sobrepostos quando exibidos em grids com largura estática ou sem `min-w-0`.
  2. Operadores técnicos de georreferenciamento precisavam alternar rapidamente entre dados de CNH, RG com Órgão/UF, Naturalidade e Matrícula de Casamento para preenchimento de peças de cartório e INCRA, exigindo cópias manuais propensas a erro e troca frequente de janelas para contatar clientes via WhatsApp.
- **Regra Obrigatória**:
  1. **CSS Grid Defensivo de 4 Colunas**: Utilizar `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` com `min-w-0` em todas as células filhas e truncagem/quebra responsiva, eliminando sobreposições.
  2. **Hierarquia Tipográfica Assimétrica**: Rótulos/Labels em `text-[11px] font-medium tracking-wider uppercase text-white/40` e Valores em `text-sm font-semibold text-white`.
  3. **Seletor de Documentos (Tabs/Pills)**: Alternador Pill (`[ RG ]` / `[ CNH ]`) permitindo alternância fluida de contexto visual com detecção de CNH vencida.
  4. **Microinterações Operacionais (1-Click Copy & WhatsApp)**:
     - Botões de cópia direta nos campos de documentos (CPF, CNPJ, CNH, RG, Senha GOV) com feedback visual de 2 segundos (ícone de check verde e tooltip).
  5. **Renderização Condicional Notarial**: Exibir o bloco de Cônjuge, Regime de Bens e Certidão de Casamento/Matrícula estritamente quando `estado_civil` for `Casado(a)` ou `União Estável`.

---

## 18. Importação Inteligente de PDFs de Identidade (Auto-OCR / PyMuPDF) e Modais Ultra-Largos
- **Problema**:
  1. O preenchimento manual de documentos civis e notariais (RG, Órgão, CNH, Categoria, Validade, CPF, Naturalidade) era lento e suscetível a erros de digitação.
  2. Modais com limites de largura padrão ficavam visualmente comprimidos e com scroll desnecessário em telas widescreen.
- **Regra Obrigatória**:
  1. **Parsing Inteligente com PyMuPDF (`fitz`)**: Usar extração de texto em memória e regex com heurísticas brasileiras para identificar tipo de documento (CNH vs RG), número, órgãos emissores, categoria, validade e naturalidade.
  2. **Persistência de Anexos e Atualização Não-Destrutiva**:
     - Salvar o arquivo PDF em diretório seguro (`uploads/documentos_clientes/{id}/`).
     - Registrar o anexo na tabela `cliente_documentos` com caminho e nome original.
     - Atualizar dados cadastrais de forma não-destrutiva (`COALESCE(campo, ?)`), preenchendo apenas campos ausentes.
     - Disponibilizar endpoint `GET /clientes/{id}/documentos/{doc_id}/arquivo` para download/visualização direta em nova aba.
  3. **Modais Ultra-Largos (1040px - 1080px)**: Configurar `--ui-modal-largura: 1040px !important; max-width: 1040px !important;` com drag & drop integrado e botão de ação rápida no cabeçalho.

---

## 19. Resolução de Conflitos em Importação de Pontos Homologados (UPSERT SQLite e Filtragem de Metadados)
- **Problema**:
  1. Ao importar planilhas homologadas/aprovadas do SIGEF (ODS ou CSV) para uma matrícula que já continha pontos de campo brutos (`origem_homologada = 0`), a rotina `DELETE ... AND origem_homologada = 1` não removia os pontos de campo, e a inserção subsequente com `INSERT INTO pontos` falhava com `IntegrityError: UNIQUE constraint failed: pontos.levantamento_id, pontos.matricula_id, pontos.nome_vertice, pontos.tipo_ponto`.
  2. Linhas de cabeçalhos descritivos ou metadados de planilhas ODS (como `"Sistema de referência SIRGAS2000"`, `"Tabela de Perímetro"`, etc.) eram falsamente capturadas pelo fallback de vértice genérico em `extract_codigo_parts` e inseridas no banco sem coordenadas válidas (`None`).
- **Regra Obrigatória**:
  1. **UPSERT na Inserção de Pontos Homologados**: Em `persistir_pontos_homologados`, sempre utilizar `INSERT INTO pontos (...) VALUES (...) ON CONFLICT(levantamento_id, matricula_id, nome_vertice, tipo_ponto) DO UPDATE SET ...` para atualizar coordenadas, `status_ponto = 'CORRIGIDO'`, `status_correcao = 'CORRIGIDO'`, `ordem_caminhamento` e `origem_homologada = 1` sem colidir com pontos preexistentes.
  2. **Filtragem Estrita de Metadados e Cabeçalhos**: Em `extract_codigo_parts` (`geodesia_parser.py`), bloquear tokens e frases descritivas contendo palavras-chave de cabeçalho (`sistema`, `referencia`, `sirgas`, `perimetro`, `tabela`, `coordenada`, etc.) ou com comprimento excessivo.
  3. **Validação Obrigatória de Coordenadas na Ingestão**: Em parsers ODS e CSV de pontos aprovados, ignorar qualquer linha cujas coordenadas resolvidas resultem em `None` (`lat is None or lon is None or este is None or norte is None`).

---

## 20. Isolamento de Perímetros na Importação de Múltiplas Planilhas / Abas
- **Problema**:
  1. Ao importar múltiplas planilhas (CSV/TXT) ou múltiplas abas de um arquivo ODS para a mesma matrícula ou levantamento, a rotina de lote concatenava todos os vértices de todas as planilhas em um único array de pontos ordenados (`pontos_processados[mat_id]`), unindo os nomes como `"Planilha1 + Planilha2"`.
  2. O gerador de segmentos conectava o último ponto da Planilha 1 com o primeiro ponto da Planilha 2 e fechava o último ponto da Planilha 2 de volta ao primeiro da Planilha 1, fundindo áreas/glebas distintas em um único perímetro cruzado gigante.
  3. No mapa Leaflet (`mapa_linhas.ts`), as polilinhas agrupavam os pontos apenas por `matricula_id`, traçando uma única linha de fechamento ao redor de todas as planilhas da mesma matrícula.
- **Regra Obrigatória**:
  1. **Processamento e Persistência Isolada por Planilha/Aba**: Cada arquivo ou aba `(filename, table_name)` deve ser tratado como uma unidade de perímetro independente (`nome_planilha`), persistido separadamente com seu próprio `arquivo_origem` / `planilha_origem` e gerando seu próprio ciclo fechado de segmentos ($P_0 \rightarrow P_1 \dots P_{N-1} \rightarrow P_0$).
  2. **Remoção Escopada de Segmentos**: Ao salvar os segmentos de uma planilha, a query de limpeza deve remover estritamente os segmentos pertencentes aos pontos daquela planilha/perímetro (`ponto_inicio_id IN (...) OR ponto_fim_id IN (...)`), sem apagar os segmentos das demais planilhas da mesma matrícula.
  3. **Agrupamento Composto no Mapa**: No frontend (`mapa_linhas.ts`), tanto `plotPolilinhaTemporaria` quanto `plotPoligonalHomologada` devem agrupar os vértices pela chave composta `matricula_id` + `arquivo_origem`/`planilha_origem` (`${matKey}___${origKey}`), garantindo que cada planilha/gleba trace seu próprio polígono fechado de forma independente.

---

## 21. Integridade de Builds no Hub Web Cloud (Hostinger) e Segurança de Proxy
- **Problema**: 
  1. O bundle compilado para a Hostinger falhava em produção com `Uncaught TypeError: Failed to resolve module specifier "ui-components-kit"` gerando tela preta. O navegador não suporta *bare imports* sem import map nativo quando pacotes externos não são resolvidos e embutidos diretamente pelo Rollup/Vite.
  2. Chamadas de proxy WMS para o INCRA/SIGEF necessitam de proteção estrita para evitar vulnerabilidades de SSRF (Server-Side Request Forgery) no servidor Apache/LiteSpeed.
- **Regra Obrigatória**:
  1. Antes de publicar qualquer build para o servidor web remoto, assegurar via `npm run build` que o arquivo JS final gerado em `frontend/dist/assets/` não contenha declarações soltas de `import "nome-do-pacote";`. Todas as dependências compartilhadas devem ser embutidas no pacote estático.
  2. O script `api.php` do servidor Hostinger atua como Hub Web Cloud seguro:
     - Deve responder HTTP 200 no health check raiz e em `?action=status`.
     - O endpoint `?action=proxy_sigef&url=...` deve validar rigorosamente via `parse_url()` que o protocolo é exclusivamente `https` e o host pertence à whitelist de domínios governamentais autorizados (`acervofundiario.incra.gov.br`, `sigef.incra.gov.br`, `servicodados.ibge.gov.br`), respondendo 403 para qualquer outro destino.
     - O endpoint de gravação POST deve limitar o payload a 5MB e sanitizar estritamente o código do projeto (`[a-zA-Z0-9]`).

---

## 22. Paridade de Campos e Validação Resiliente de Clientes (Frontend, Hub PHP e API Python)
- **Problema**: 
  1. Ao cadastrar um cliente no sistema online (Hostinger), mesmo preenchendo o nome no formulário, a API retornava o erro: `{"error": "Nome do cliente é obrigatório."}`.
  2. O formulário do frontend enviava no payload `nome_completo: nomeCompleto` (e não a chave `nome`), enquanto o backend PHP (`api.php`) no endpoint `POST /clientes` validava estritamente `$nome = trim($input['nome'] ?? '')`, resultando em string vazia e disparando HTTP 400. No endpoint `PUT /clientes/{id}`, apenas `$input['nome']` era considerado para atualizar `pessoas.nome`.
  3. Além disso, a extração via `new FormData(e.target)` de Web Components (`<ui-campo-texto>`) se beneficia de fallbacks diretos para as propriedades `value` dos elementos DOM (`(inputNomeCompleto as any)?.value`), garantindo que o valor seja sempre capturado.
  4. Ao salvar um cliente sem informar CPF/CNPJ, o backend MySQL retornava `SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry '' for key 'cpf_cnpj'`. No MySQL, campos `UNIQUE` permitem múltiplos valores `NULL`, mas não aceitam mais de uma string vazia `''`.
- **Regra Obrigatória**:
  1. **Dual-Key Payload no Frontend**: Na submissão de clientes em `frontend/src/views/clientes.ts`, sempre enviar ambas as propriedades no payload: `nome: nomeCompleto` e `nome_completo: nomeCompleto`, mantendo `nome?: string;` na interface `ClientePayload` em `frontend/src/types.ts`.
  2. **Tratamento Estrito de NULL em Campos UNIQUE (MySQL)**:
     - No `api.php`, usar `emptyToNull()` em todos os campos opcionais (especialmente `cpf_cnpj`, `cpf_conjuge`, `rg`, datas e chaves únicas). Strings vazias ou formadas apenas por espaços devem ser convertidas estritamente para `null`.
     - Em `ensureSchema`, manter migração idempotente: `UPDATE pessoas SET cpf_cnpj = NULL WHERE cpf_cnpj = '' OR TRIM(cpf_cnpj) = ''`.
     - No frontend (`clientes.ts`), normalizar `cpf_cnpj` para `null` caso vazio: `const cpfCnpjVal = cpfCnpjRaw !== '' ? cpfCnpjRaw : null;`.
  3. **Validação Flexível nos Backends (PHP e Python)**:
     - No `api.php`: `$nome = trim((string)($input['nome_completo'] ?? $input['nome'] ?? $input['razao_social'] ?? ''));`. Se vazio, rejeita com 400. Em `PUT /clientes/{id}`, atualizar com `$nome !== '' ? $nome : null`.
     - Em `api.php`, os comandos `INSERT INTO pessoas` e `UPDATE pessoas` devem contemplar todos os campos estendidos de pessoa física e jurídica (tipo_pessoa, razao_social, nome_fantasia, inscrições, CNH, RG, casamento, endereço, metadados).
     - No backend Python (`routes/clientes.py` e `services/gestores/cliente_manager.py`): o modelo `ClienteCreate` aceita `nome_completo` e `nome`, normalizando `nome_completo = cli_data.get("nome_completo") or cli_data.get("nome")` e `cpf_cnpj = Optional[str] = None`.
  4. **Fallbacks de Leitura no Formulário**: Na leitura de campos do formulário com Web Components, compor `rawPayload.campo || (domElement as any)?.value || ''` para evitar valores nulos caso a associação ao formulário sofra atraso no ciclo de eventos.

---

## 23. Perímetros Topológicos em Cartas de Anuência e Matrículas com Georreferenciamento Compartilhado (Gleba Unificada)
- **Problema**:
  1. **Efeito "Teia de Aranha" no Croqui de Limites (Anexo Gráfico Leaflet)**: A consulta de vértices para traçar o limite geral do imóvel ordenava todos os pontos apenas por `ordem_caminhamento ASC`. Quando uma matrícula continha tanto pontos homologados oficiais (`origem_homologada = 1`) quanto pontos de apoio brutos de campo (`origem_homologada = 0`), a ordenação simples misturava pontos de rio e estações de apoio com o perímetro, traçando linhas cruzadas diagonais que deformavam o mapa.
  2. **Glebas com Georreferenciamento Conjunto ("Geo Junto" / Matrículas Unificadas)**: Na prática cartorária e topográfica, é comum duas ou mais matrículas contíguas serem levantadas e certificadas juntas em um único perímetro unificado (ex: Matrículas 679 e 682 da Fazenda Serra dos Dourados). Como apenas uma das matrículas continha o arquivo ODS com os vértices cadastrados, a matrícula secundária não encontrava vértices, e os documentos (Cartas de Anuência, Requerimentos, Laudos e Termos SIGEF) não refletiam os números conjuntos das matrículas e omitiam a fundamentação jurídica de unificação territorial.
- **Regra Obrigatória**:
  1. **Encadeamento Topológico de Segmentos**: O polígono perimétrico do Anexo Gráfico (`gerar_anexo_grafico_html`) deve ser reconstruído prioritariamente seguindo a cadeia fechada da tabela `segmentos` (`ponto_inicio_id -> ponto_fim_id`). Da mesma forma, a divisa lindeira do confrontante deve ser ordenada como um grafo encadeado a partir do vértice inicial que não é ponta final, garantindo continuidade linear estrita.
  2. **Vínculo de Desenho Compartilhado (`matricula_origem_desenho_id`)**:
     - A tabela `matriculas` possui a coluna `matricula_origem_desenho_id INTEGER REFERENCES matriculas(id)` indexada por `idx_matriculas_origem_desenho`.
     - Toda busca de dados cartoriais e topográficos (`obter_dados_comuns`, `obter_segmentos_detalhados_confrontante`, `get_pontos_homologados_matricula`, `get_confrontantes_ativos_matricula`) deve resolver `mat_desenho_id = matricula_origem_desenho_id or matricula_id`.
     - Quando `is_unificada` for True:
       - Rótulo dinâmico: `"Matrículas nºs {num1} e {num2}"`
       - Soma das áreas registradas consolidadas de todas as matrículas do grupo
       - Injeção obrigatória do **Parágrafo Único – Da Unificação e Continuidade Territorial** nas Cartas de Anuência e consolidação das tabelas de glebas nos Requerimentos de Cartório, Declarações de Responsabilidade, Laudos Técnicos e Termos do SIGEF.
  3. **Importação ODS Inteligente**: Ao importar planilhas em lote, caso o nome da aba mencione múltiplas matrículas (ex: `679 e 682.ODS`), o sistema detecta e associa a gleba unificada automaticamente, vinculando as matrículas secundárias à principal.

---

## 24. Layout e Posicionamento de Assinaturas em Documentos e Declarações Cartoriais (Declaração de Anuência)
- **Problema**: 
  O uso de `flex flex-col justify-between` e `mt-auto` no container principal de impressão A4 da declaração de anuência forçava o bloco de data e assinaturas para o limite absoluto inferior da folha A4 (29.7cm). Em declarações com poucos vértices ou tabelas curtas, isso gerava um abismo de espaço vazio no centro do documento, deixando a data e as assinaturas coladas no rodapé da folha de forma desarmônica e sem espaço vertical adequado (`mt-3`) para a aposição da assinatura física/digital.
- **Regra Obrigatória**:
  1. Em templates de impressão cartorial (`declaracao_anuencia.html`), a página (`.page`) deve seguir fluxo natural (`display: block !important;` no `@media print` e `flex flex-col` sem `justify-between` na tela).
  2. O bloco de fechamento (`.bloco-assinaturas-fechamento`) deve utilizar margem superior harmônica (`mt-8` / `margin-top: 1.2cm !important;`) com `break-inside: avoid !important;`, assegurando que a data e as assinaturas sigam imediatamente após o texto e tabelas de confrontação com espaçamento equilibrado.
  3. No bloco de assinaturas (`anuencias.py`), utilizar `mt-6 mb-1.5` nas linhas de assinatura para assegurar área livre vertical confortável para aposição de assinatura manual ou certificado digital.

---

## 25. Módulo de Autenticação e Controle de Sessão (UI_Componentes ⇆ GerenciGeo)
- **Problema**: 
  1. A importação do módulo de login do ecossistema privado `UI_Componentes` para o GerenciGeo precisava conciliar a arquitetura server-side em Express/EJS com o frontend SPA em Vite/TypeScript e o backend duplo (FastAPI local e MySQL na nuvem Hostinger).
  2. Endpoints de login tradicionais sofrem de vulnerabilidade de Timing Attack para enumeração de usuários cadastrados quando a comparação de bcrypt só é disparada se o e-mail existir no banco.
- **Regra Obrigatória**:
  1. **Mitigação Estrita de Timing Attacks**: Em caso de usuário inexistente no endpoint `/auth/login` (tanto em Python quanto no `api.php`), sempre executar `bcrypt.checkpw(password, DUMMY_HASH)` ou `password_verify($password, $dummyHash)` para equalizar a latência da resposta.
  2. **Sanitização de Payloads de Usuário**: O hash de senha (`password`), `reset_password_token` e `reset_password_expires` nunca devem ser transmitidos para o frontend ou persistidos em sessões.
  3. **Adesão aos Web Components**: A tela de login SPA deve empregar `<ui-campo-texto>`, `<ui-checkbox>` e `<ui-botao>` da biblioteca `ui-components-kit`, gerenciando a sessão centralmente via `AuthService` com suporte a persistência por 30 dias (`remember_me`).
  4. **Proteção de Rotas SPA**: Em `main.ts`, qualquer tentativa de navegação desautenticada em rotas protegidas deve redirecionar instantaneamente para `#login`, ocultando a barra lateral.

---

## 26. Heurística de Detecção Óptica de Ícone em `ui-botao` e Padronização da Tela de Login
- **Problema**:
  1. **Efeito Moldura Dupla no Botão de Ação**: Aplicar classes utilitárias de padding vertical (`py-3`) e sombras (`shadow-[...]`) diretamente na tag do Custom Element `<ui-botao>` estilizava o elemento `:host` (bloco escuro) em vez do `<button>` interno da Shadow DOM, gerando uma moldura cinza/escura com o botão verde achatado no interior.
  2. **Contração para 1:1 (Bug de Botão Quadrado com Texto Quebrado)**: A heurística interna de `opticalState` do `ui-components-kit` avalia os nós atribuídos ao slot. Ao encapsular o ícone e o texto dentro de um único elemento contêiner (`<span><i data-lucide="log-in"></i>Texto</span>`), o navegador computa `children.length === 1` (o SVG), ignorando o nó de texto (que não reside em `.children`). A lib classificava o botão incorretamente como `ui-botao-primario--icon-only`, forçando `aspect-ratio: 1` e largura de 46px.
  3. **Ícones Ausentes no Lucide**: Ícones como `mail`, `eye-off` e `log-in` não eram exibidos na interface caso não estivessem mapeados explicitamente no dicionário do `createIcons` em `utils.ts`.
- **Regra Obrigatória**:
  1. **Nós Irmãos Separados no `<ui-botao>`**: Nunca envolver ícone e texto de botão em uma única tag `<span>`. Declarar sempre como irmãos diretos no slot do `<ui-botao>`:
     ```html
     <ui-botao tipo-submit variante="primario" altura="46" class="w-full">
       <i data-lucide="log-in" class="w-4 h-4"></i>
       <span>Entrar no Sistema</span>
     </ui-botao>
     ```
  2. **Controle de Dimensão sem Padding no Host**: A altura de `<ui-botao>` e `<ui-campo-texto>` deve ser controlada via atributo `altura="44"` / `altura="46"` (que injeta `--ui-campo-altura`), sem classes como `py-*` aplicadas diretamente ao Custom Element.
  3. **Campos com Ícones em Slots Nativos**: Utilizar `slot="icone-esquerda"` e `slot="icone-direita"` nativos do `<ui-campo-texto>` para ícones de e-mail, senha e alternância de visibilidade.
  4. **Importação Centralizada em `utils.ts`**: Qualquer novo ícone adicionado ao projeto via Lucide (`data-lucide="..."`) deve ser obrigatoriamente importado e registrado na função `initIcons()` em `frontend/src/utils.ts`.
  5. **Fluxo de Auto-Cadastro Unificado**: O endpoint `/auth/register` (em Python e no `api.php`) valida unicidade de e-mail, comprimento mínimo de senha e cria a conta gerando a sessão e logando imediatamente, permitindo que a tela de login alterne dinamicamente entre login e cadastro.
   6. **Resiliência de Resposta de Autenticação e Roteamento de Healthcheck**:
      - Em AuthService, o retorno da API nunca deve ser lido assumindo cegamente a existência da chave data.user (ex: const rawUser = data.user || data.data || (data.name ? data : null)). Se o usuário for inválido ou ausente, deve lançar exceção informativa impedindo que a função retorne undefined.
      - Em views de login e no main.ts, todas as referências ao nome do usuário devem utilizar fallback defensivo ((user && user.name) ? user.name : 'Usuário') para mitigar Cannot read properties of undefined (reading 'name').
      - No pi.php de produção/nuvem, rotas de healthcheck com $route === '/' devem ser condicionadas a empty(['action']) para que endpoints acionados via query parameters (pi.php?action=login ou 
egister) não sejam precipitadamente interceptados pelo status healthcheck com HTTP 200.

---

## 27. Módulo de Confrontantes: Qualificação Completa, Integridade de Pessoas e Ciclo de Vida do Formulário
- **Problema**:
  1. O botão de salvar qualificação do confrontante na Aba 3 (Cartório/Anuência) falhava ou não respondia silenciosamente devido ao binding frágil em selectAnuencia.value, retornando antecipadamente sem feedback ao usuário.
  2. O elemento btnSalvarConf é um Custom Element <ui-botao>. A manipulação de .innerHTML e a propriedade .disabled = true interferiam na Shadow DOM do componente.
  3. No backend (segmentos.py), a atualização via PUT /confrontantes/{cid} disparava sqlite3.IntegrityError: UNIQUE constraint failed: pessoas.cpf_cnpj quando o confrontante era atualizado para um CPF já cadastrado em outra linha da tabela pessoas.
  4. O endpoint GET /levantamentos/{id}/confrontantes usava INNER JOIN pessoas, ocultando confrontantes com pessoa_id = NULL e omitia os campos genero, genero_conjuge, nacionalidade_conjuge e profissao_conjuge.
  5. A tabela confrontantes não possui a coluna genero (armazenada em pessoas.genero). A tentativa de selecionar c.genero no gerador de anuências cartoriais causava erro operacional sqlite3.OperationalError: no such column: c.genero.
- **Regra Obrigatória**:
  1. **Controle de Estado em <ui-botao>**: Para indicar estado de processamento/carregamento em componentes <ui-botao>, utilize estritamente btn.setAttribute('carregando', '') e btn.setAttribute('disabled', ''). Remova os atributos no finally. Escute tanto o evento nativo click quanto o Custom Event ui-click.
  2. **Persistência em Duas Camadas (confrontantes ⇆ pessoas)**:
     - Atributos pessoais e do cônjuge (genero, genero_conjuge, nacionalidade_conjuge, profissao_conjuge) residem na tabela pessoas.
     - Atributos espaciais e notariais (matricula_imovel, cns_confrontante, caminho_matricula_pdf, tipo_relacao) residem na tabela confrontantes.
     - Consultas devem usar LEFT JOIN pessoas p ON c.pessoa_id = p.id com COALESCE(p.campo, c.campo) para garantir que registros legados não sejam perdidos.
  3. **Resolução de Conflitos UNIQUE em Atualizações de CPF**: No update_confrontante, se o CPF informado já existir em pessoas sob outro ID, a rota deve vincular c.pessoa_id ao registro existente e atualizar seus dados, em vez de tentar um UPDATE pessoas direto que viole a restrição única.
  4. **Feedback Visual e Sanitização de Erros**: Toda resposta de erro da API deve extrair data.detail (suportando strings e arrays do Pydantic) e exibir feedback visual via showToast(msg, 'error') ou 'success'.
  5. **Sincronização Inter-Abas**: O cadastro ou edição de confrontantes (seja rápido na Aba 2 ou detalhado na Aba 3) deve obrigatoriamente chamar await ctx.carregarConfrontantesAtivosSelect() e recarregar os dados do levantamento, mantendo seletores e tabelas perfeitamente sincronizados.
