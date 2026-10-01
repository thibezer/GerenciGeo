# 📋 Plano de Implementação: Revisão, Correção e Modularização da Mesa de Trabalho

## 🎯 Objetivo
Revisar integralmente a **Mesa de Trabalho** do GerenciGeo, eliminando bugs críticos de execução e memória, aplicando as diretrizes de estabilidade do `.jules/learnings.md` e decompondo todos os arquivos monolíticos com mais de 300 linhas em módulos coesos com menos de 300 linhas cada, preservando 100% das funcionalidades e compatibilidade de testes.

---

## 🗂️ Arquivos Alvo da Modularização (> 300 Linhas)

| Arquivo Original | Linhas Atuais | Meta Pós-Modularização | Submódulos Planejados |
| :--- | :---: | :---: | :--- |
| `mesa_trabalho.ts` | 1.612 | ~180 linhas | `core/splitters.ts`, `core/drag_drop_global.ts`, `core/batch_actions_bar.ts`, `core/ribbon_interactions.ts` |
| `gerador_documentos.ts` | 1.604 | ~150 linhas | `documentos/homologacao_sigef.ts`, `documentos/ingestao_abas_planilha.ts`, `documentos/pecas_cartoriais.ts`, `documentos/confrontantes_modal.ts` |
| `painel_propriedades.ts` | 1.486 | ~160 linhas | `painel_propriedades/painel_geral.ts`, `painel_propriedades/painel_vertice_individual.ts`, `painel_propriedades/painel_multi_vertices.ts` |
| `mesa_geodesica.ts` | 1.331 | ~140 linhas | `geodesica/geodesica_tabela.ts`, `geodesica/geodesica_ingestao.ts`, `geodesica/geodesica_vizinhos.ts` |
| `mesa_trabalho_template.ts` | 1.131 | ~120 linhas | `templates/template_titlebar.ts`, `templates/template_ribbon.ts`, `templates/template_workspace.ts`, `templates/template_modais.ts` |
| `ordenador_ui.ts` | 537 | ~220 linhas | `ordenador_manual/ordenador_ui_dragdrop.ts`, `ordenador_manual/ordenador_ui_cards.ts` |
| `organizador_perimetro.ts` | 354 | ~200 linhas | `organizador_perimetro/divisas_eventos.ts`, `organizador_perimetro.ts` |

---

## 🚀 Fases de Execução

### Fase 1: Correção Imediata de Bugs e Inconsistências Críticas
Garante estabilidade imediata antes do desmembramento dos arquivos.

1. **Remoção de interceptadores de erro intrusivos**:
   - Eliminar os ouvintes globais `window.addEventListener('error')` e `unhandledrejection` que disparam `alert()` nativo em `mesa_trabalho.ts` (L25-L33).
2. **Normalização universal de identificadores (Regra #2 do `.jules/learnings.md`)**:
   - Corrigir todas as comparações estritas `===` de `id`, `ponto_inicio_id`, `ponto_fim_id`, `confrontante_id` e `matricula_id` para `String(a) === String(b)` em:
     - `painel_propriedades.ts` (L247, L272, L990, L1037, L1514, L1525)
     - `mesa_trabalho_tabela.ts` (L137, L138, L190)
     - `ordenador_ui.ts` (L69, L279, L338, L394)
     - `tabela_dados.ts` (L87, L88)
3. **Unificação do controle do Fuso UTM**:
   - Harmonizar o elemento `#select-fuso-ribbon` removendo o código conflitante que tentava tratá-lo como Web Component com `.itens` e `gg-selecionar`, mantendo persistência reativa no `localStorage` e atualização instantânea no `mapaController`.
4. **Resolução de Memory Leak no Organizador de Perímetro**:
   - Refatorar a vinculação de eventos em `organizador_perimetro.ts` (L168-L230) para usar delegação de eventos no container pai `#container-tabela-lateral-content` em vez de reatribuir listeners individuais a cada renderização.

---

### Fase 2: Modularização de `painel_propriedades.ts` (1.486 linhas)
Decomposição do painel lateral em 3 submódulos altamente especializados:

```
frontend/src/views/mesa_trabalho/painel_propriedades/
├── index.ts                      (Orquestrador: gerencia seleção, ciclo de vida e AbortController)
├── painel_geral.ts               (Visão sem seleção: resumo do levantamento, CAR, INCRA, matrícula ativa)
├── painel_vertice_individual.ts  (Visão 1 vértice: coordenadas UTM/Geo, sigmas, método SIGEF, divisa)
└── painel_multi_vertices.ts      (Visão multi-seleção: alteração em lote de atributos e exclusão segura)
```

- **Invariante visual**: Preservar rigorosamente as diretrizes visuais dos 10px de margem lateral, 18px de altura de campos e 23px nos headers de seção.

---

### Fase 3: Modularização de `mesa_trabalho.ts` (1.612 linhas)
Extração dos utilitários centrais de layout e interações da rota:

```
frontend/src/views/mesa_trabalho/core/
├── splitters.ts                  (Splitter horizontal mapa/tabela e vertical do painel lateral)
├── drag_drop_global.ts           (Overlay e drag & drop global de arquivos de campo)
├── batch_actions_bar.ts          (Barra flutuante de ações em lote e modal de filtro Revit)
└── ribbon_interactions.ts        (Instâncias de RibbonManager, atalhos de janela e abas)
```

- **Resultado em `mesa_trabalho.ts`**: Ficará enxuto (~180 linhas), atuando exclusivamente como ponto de entrada da rota, definindo `RouteDef` e instanciando o contexto `MesaTrabalhoContext`.

---

### Fase 4: Modularização de `mesa_geodesica.ts` (1.331 linhas)
Separação das responsabilidades de visualização, cálculo e ingestão:

```
frontend/src/views/mesa_trabalho/geodesica/
├── index.ts                      (Setup e integração ao contexto)
├── geodesica_tabela.ts           (Montagem e renderização da tabela de pontos de campo)
├── geodesica_ingestao.ts         (Fila de arquivos GNS/TXT, dropzone e despacho para a API)
└── geodesica_vizinhos.ts         (Importação de CSV/ODS de confrontantes com fuso e mapa)
```

---

### Fase 5: Modularização de `gerador_documentos.ts` (1.604 linhas)
Divisão por unidade de negócio documental:

```
frontend/src/views/mesa_trabalho/documentos/
├── index.ts                      (Setup da etapa de documentos e peças de cartório)
├── homologacao_sigef.ts          (Carregamento, poligonais e banco de pontos aprovados)
├── ingestao_abas_planilha.ts     (Análise e importação de abas de planilhas ODS/CSV INCRA)
├── pecas_cartoriais.ts           (Modais de Memorial Descritivo, CCR, Anuências e Casamento)
└── confrontantes_modal.ts        (Formulário de confrontante e máquina de estado civil)
```

---

### Fase 6: Modularização de `mesa_trabalho_template.ts` (1.131 linhas)
Decomposição do template monolítico em parciais reutilizáveis:

```
frontend/src/views/mesa_trabalho/templates/
├── template_titlebar.ts          (Barra de título superior e botões AutoCAD)
├── template_ribbon.ts            (Abas e grupos de ferramentas)
├── template_workspace.ts         (Layout com splitters, containers de mapa e tabelas)
└── template_modais.ts            (Modais embutidos: ingestão, filtro revit, unificação)
```

---

### Fase 7: Validação e Testes de Integridade
1. **Compilação do Frontend**: Executar `npm --prefix frontend run build` garantindo zero erros de tipagem TypeScript e empacotamento completo.
2. **Suíte de Testes Python**: Executar `python -m unittest discover -s tests -p "test_*.py"` assegurando 100% de aprovação (157+ testes).
3. **Registro de Aprendizados**: Documentar os novos padrões em `.jules/learnings.md`.
4. **Git Commit & Push**: Conforme as regras do projeto, criar commit semântico estruturado e enviar para a branch remota.

---

## 🔒 Salvaguardas e Cuidados Especiais
- **Proteção do Banco Principal**: Manter o banco `gerencigeo.db` intocado, rodando testes estritamente em `gerencigeo_test.db`.
- **Integridade de IDs na DOM**: Preservar exatamente os IDs de elementos HTML consumidos pelo Leaflet, pela `ui-components-kit` e pelos atalhos de teclado.
- **Fallbacks Geométricos**: Preservar o fallback visual `plotPolilinhaTemporaria` caso a lista de segmentos esteja vazia.
