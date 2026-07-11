# Plano de Ação

## FASE 1: Refinamento de UX, Listeners e Tratamento no Frontend
1. *Auditoria de Event Listeners:*
   - Em `frontend/src/views/mesa_trabalho/painel_propriedades.ts`, na função `atualizarPainelPropriedades`, usar a técnica de `.cloneNode(true)` para resetar listeners anexados dinamicamente nos botões principais (`btn-props-salvar`, `btn-props-descartar`) e inputs de controle geral, a fim de evitar sobreposição de chamadas.
   - Tratar também o listener associado ao id `prop-multi-ignorar-poligono` com a mesma técnica (clonando e substituindo) para garantir que não haja callbacks duplicados disparando lógicas de atualização de array indevidas.
2. *Feedback Visual de Salvamento em Lote:*
   - Na função anexada ao novo clone do botão de salvamento em lote (`novoBtn.onclick`), inserir o tracking de progresso dentro do bloco try que itera a promessa de fetch: alterando a cada repetição (`for (const pid of ctx.selectedPontoIds)`) a label do botão para `Salvando \${++processados} de \${totalCount}...` mantendo no `finally` o recuo de estilo/texto originais.
3. *Tratamento de Campos Indeterminate:*
   - Modificar o manipulador de eventos de `prop-multi-ignorar-poligono` para explicitamente forçar `checkPoliEl.indeterminate = false` no momento da interação, propagando esse `checked` unificado nos payloads assíncronos que são enviados individualmente para a API.
4. *Rastreabilidade (Nome Original):*
   - Exploraremos os DTOs do Py pydantic (em `routes/levantamento/pontos.py`) e SQLite tables (em `database/models.py`) ou o model default renderizado na view (`p.nome_vertice` vs `p.nome_campo` ou equivalente) usando o terminal, e em seguida adicionaremos este campo readonly no painel HTML injetado.

## FASE 2: Validação de Payload, Conversão e Regras no Backend
1. *Conversão UTM ↔ Geodésica:*
   - Em `business/levantamento_manager.py` função `atualizar_ponto_geodesico`, vamos assegurar que pontos tipo 'P' e 'V' passem pelo conversor pyproj. Utilizaremos o EPSG local dinâmico (`f"319{60 + zona}"`) para referenciar a projeção UTM, e extrairemos com total integridade de Float as tuplas de long/lat.
2. *Unicidade de Nomes Oficiais:*
   - Modificar `business/levantamento_manager.py` na validação de unicidade contida em `atualizar_ponto_geodesico`. Certificar-se que a query SQLite de verificação devolva false para tuplas iguais de nome sob o mesmo `matricula_id` e dispare um return dict formatado com erro, que o frontend mapeie para toast.
3. *Integridade da Associação de Confrontantes:*
   - Revisar `frontend/src/views/mesa_trabalho/painel_propriedades.ts` (linha 1024 a 1110) e checar os POST/PUT de confrontantes para ter uma rotina de Try/Catch unificada por linha salvada, evitando requests de segmento órfãs (caso falhe o confronto, pule a vinculação no segmento ou aborte). 

## FASE 3: Testes e Submission
1. *Testes*:
   - Executar os testes locais de backend instanciando validadores se necessário.
   - Executar `npm run build` na pasta `frontend/` com obrigatoriedade de 0 warnings TS.
2. *Pre Commit*:
   - Complete pre commit steps to ensure proper testing, verification, review, and reflection are done.
3. *Submit*:
   - Submeter o Pull Request sob a branch `feat/auditoria-painel-propriedades`.
