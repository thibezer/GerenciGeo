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
