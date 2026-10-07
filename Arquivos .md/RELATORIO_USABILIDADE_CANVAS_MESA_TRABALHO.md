# 🗺️ Relatório de Verificação Profunda: Usabilidade do Canvas CAD da Mesa de Trabalho

## 1. Visão Geral da Arquitetura do Canvas

O Canvas da Mesa de Trabalho do **GerenciGeo** é implementado pelo Web Component encapsulado `<ui-canvas-cad>` (biblioteca `ui-components-kit` / [ui-canvas-cad.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/components/ui-canvas-cad/ui-canvas-cad.ts)), que orquestra a engine cartográfica Leaflet através do [mapa_controller.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/mapa_controller.ts), do gerenciador de camadas [layer_manager.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/layer_manager.ts) e de renderizadores vetoriais especializados ([vector_lines_builder.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/renderers/vector_lines_builder.ts), [vector_points_renderer.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/renderers/vector_points_renderer.ts) e [vector_polygons_renderer.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/renderers/vector_polygons_renderer.ts)).

A comunicação com a aplicação hospedeira ([mesa_trabalho.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho.ts)) ocorre de maneira reativa via propriedades (`pontos`, `segmentos`, `confrontantes`) e eventos customizados (`ui-ponto-selecionado`, `ui-canvas-clique`, `ui-acao-popup`).

---

## 2. Diagnóstico Profundo por Vetor de Usabilidade

### 2.1. Seleção de Entidades Geométricas (Pontos, Segmentos e Polígonos)

| Aspecto | Estado Atual | Diagnóstico / Ponto de Fricção | Impacto na UX |
| :--- | :--- | :--- | :--- |
| **Seleção por Clique Individual** | Implementada para vértices ([cad-eventos-canvas.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/components/ui-canvas-cad/cad-eventos-canvas.ts)). | **Segmentos e Polígonos não são selecionáveis.** Ao clicar em uma linha ou polígono, o Leaflet abre apenas um popup estático. O segmento não é adicionado a nenhum estado `selectedSegmentoId` e o Painel de Propriedades não é notificado. | O operador não consegue inspecionar ou alterar os atributos de uma divisa (tipo de limite, confrontante, método) clicando diretamente na linha. |
| **Window Selection (Esquerda ➔ Direita)** | Exibe caixa azul sólida `#06b6d4` ([canvas_selecao_box.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/canvas_selecao_box.ts#L96)). | **Falsa implementação de Window Selection:** No CAD clássico, deve selecionar apenas entidades **100% contidas** no retângulo. No código atual, a matemática apenas testa se as coordenadas do marcador estão contidas no retângulo delimitador, ignorando polilinhas e geometrias lineares. | Comportamento puramente cosmético; não seleciona segmentos fechados inteiros. |
| **Crossing Selection (Direita ➔ Esquerda)** | Exibe caixa verde tracejada `#10b981` ([canvas_selecao_box.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/canvas_selecao_box.ts#L101)). | **Ausência de teste de interceptação:** No CAD, a caixa verde deve selecionar qualquer linha ou polígono que **cruze as bordas da caixa**. O algoritmo atual faz apenas `inside` para marcadores pontuais, sem algoritmo de Cohen-Sutherland ou Liang-Barsky para interceptação de segmentos. | Linhas que cortam a janela verde são completamente ignoradas. |
| **Teclas Modificadoras** | Suporte a `Ctrl` e `Cmd` para seleção cumulativa/toggle. | **A tecla `Shift` é ignorada na caixa de seleção** ([canvas_selecao_box.ts:183](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/canvas_selecao_box.ts#L183)). Usuários acostumados com CAD/GIS esperam que `Shift` adicione à seleção existente e `Alt` ou `Ctrl` subtraia. | Erro de expectativa muscular do usuário ao tentar arrastar com `Shift`. |
| **Ferramenta Caneta ([ferramenta_caneta.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho/ferramenta_caneta.ts))** | Polígono arbitrário com teste Ray-Casting. | Funciona bem para pontos, mas gera uma camada SVG paralela isolada em vez de integrar nativamente aos modos de seleção do `<ui-canvas-cad>`. | Cria estados concorrentes entre a Caneta e a Caixa de Seleção retangular. |
| **Sincronização Canvas ⇄ Tabela ⇄ Painel** | Sincroniza via eventos customizados. | Em [mesa_trabalho.ts:790-828](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho.ts#L790-L828), o código tenta manipular elementos com `document.getElementById('map-marker-' + pId)` diretamente, mas os marcadores estão encapsulados no **Shadow DOM** do Web Component e possuem IDs no formato `map-marker-vertices-${pId}`, falhando silenciosamente no DOM global. | Depende exclusivamente da re-renderização interna do kit; lógica legada residual no frontend hospedeiro. |

---

### 2.2. Sobreposição Geométrica e Hierarquia Visual (Z-Index / Panes)

| Aspecto | Estado Atual | Diagnóstico / Ponto de Fricção | Impacto na UX |
| :--- | :--- | :--- | :--- |
| **Vértices Coincidentes (Mesmas Coordenadas)** | Renderiza múltiplos marcadores Leaflet no mesmo ponto geográfico. | **Oclusão total e inacessibilidade:** O marcador no topo do DOM recebe o clique; o vértice inferior fica 100% inacessível por clique individual. Não existe indicação visual (badge numérico `+2`, halo de alerta ou Spiderfy/desempilhamento radial). | Se houver um ponto bruto e um corrigido, ou um vértice de vizinho coincidente, o operador não consegue inspecionar o ponto de baixo sem abrir a tabela. |
| **Inversão de Hierarquia Z-Index** | Camadas em [layer_defaults.ts](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/layer_defaults.ts#L83-L115):<br>- `perimetro` (linhas): **zIndex 450**<br>- `vizinhos` (polígonos): **zIndex 500** | **Polígonos de vizinhos cobrem a linha do perímetro do imóvel:** Como o pane dos vizinhos possui z-index maior que o do perímetro, o polígono confrontante é desenhado sobre a poligonal do imóvel rural do cliente! | Em limites confrontantes coincidentes, a linha roxa do vizinho esconde a linha verde do perímetro do cliente. |
| **Divisas Compartilhadas (Z-Fighting)** | Quando dois limites coincidem, as linhas são desenhadas sobre o mesmo traçado exato. | Ausência de técnica de **linha dupla / offset stroke** ou tracejado bicolor alternado (ex: verde e roxo). Uma das linhas é totalmente ocultada pela outra. | O operador não sabe visualmente se a divisa está perfeitamente amarrada ao confrontante ou se há divergência/sobreposição. |
| **Preenchimentos (Polygon Fills) Acumulativos** | Confrontantes usam `fillOpacity: 0.15` a `0.20`. O perímetro do imóvel não tem preenchimento. | Polígonos de múltiplos confrontantes empilhados ou com interseções escurecem excessivamente a imagem de satélite. Já o imóvel principal não tem preenchimento, dificultando a percepção da área interna vs externa em imóveis com formato irregular ou encraves. | Perda de clareza do território do cliente frente aos lotes vizinhos. |

---

### 2.3. Estilos de Linhas e Preenchimento (Simbologia Técnica e Contraste)

| Aspecto | Estado Atual | Diagnóstico / Ponto de Fricção | Impacto na UX |
| :--- | :--- | :--- | :--- |
| **Simbologia INCRA / NTGIR (3ª Edição)** | Cores fixas em [vector_lines_builder.ts:171](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/gerencigeo-canvas/renderers/vector_lines_builder.ts#L171):<br>- `LA1` ➔ `#10b981` (verde)<br>- `LN1` ➔ `#3b82f6` (azul tracejado `6, 6`)<br>- Outros ➔ `#00f5a0` | **Simbologia cartográfica incompleta:** Não há diferenciação gráfica de cerca de arame (padrão com cruzetas/traços transversais), valo/caminho, muro, ferrovia ou corpos d'água com setas de jusante. Todos os limites artificiais parecem uma linha sólida comum. | Baixa expressividade cartográfica perante as normas do INCRA/SIGEF. |
| **Contraste sobre Imagens de Satélite (Ortofoto)** | Linha do perímetro com `weight: 2`, `#00f5a0`, sem casing exterior. | **Perda de contraste:** Em áreas de pastagem clara, vegetação verde-limão ou reflexo d'água, a cor `#00f5a0` fica quase invisível sem uma borda preta de contraste (*stroke casing / halo*). | Fadiga visual para o profissional de topografia ao analisar imagens de alta resolução. *(Nota positiva: a [CamadaConfrontantes](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho/camada_confrontantes.ts#L117) usa casing de 7px com linha interna de 4px, demonstrando que a solução técnica já existe no projeto e deve ser generalizada).* |
| **Customização Dinâmica pelo Usuário** | O painel de camadas QGIS possui apenas controle de visibilidade (olho) e opacidade (slider). | **Não há edição de estilo no frontend:** O operador não consegue trocar a cor da camada, alterar espessura da linha, ativar hachura ou trocar a cor de um confrontante diretamente pelo Canvas ou pelo Painel de Propriedades. | Dependência de valores hardcoded no código ou metadados da API. |

---

### 2.4. Ergonomia, HUD e Controles da Interface

| Aspecto | Estado Atual | Diagnóstico / Ponto de Fricção | Impacto na UX |
| :--- | :--- | :--- | :--- |
| **Conflito de Posição de Toolbars** | - [ui-canvas-cad.css:42](file:///d:/Desenvolvimento/GerenciGeo/frontend/node_modules/ui-components-kit/src/components/ui-canvas-cad/ui-canvas-cad.css#L42): `.qgis-layer-panel` em `top: 12px; left: 12px;`<br>- [mesa_trabalho_template.ts:395](file:///d:/Desenvolvimento/GerenciGeo/frontend/src/views/mesa_trabalho_template.ts#L395): `#map-cad-floating-toolbar` em `top-3 left-3` (`top: 12px; left: 12px;`). | **Colisão física direta:** A barra flutuante da Mesa de Trabalho (botões Caneta, Confrontantes, SIGEF) fica exatamente sobre o Painel de Camadas QGIS e sobre os botões de controle de zoom nativos do Leaflet. | Elementos sobrepostos geram cliques acidentais e poluição visual. |
| **Rótulos (Labels) de Vértices e Cotas** | Os vértices exibem seus nomes apenas ao clicar no marcador para abrir o popup. Não há tooltips com `sticky` ou labels fixos nos vértices. | **Invisibilidade nominal dos vértices:** Em um levantamento com dezenas de vértices, o agrimensor não consegue ver quais são `M-01`, `M-02`, `V-03` simultaneamente na tela. Ele é obrigado a passar o mouse ou clicar um a um. | Dificulta a conferência rápida do caminhamento perimetral com a caderneta de campo. |
| **Cotas de Distância e Azimute no Traçado** | As distâncias e azimutes constam apenas na tabela e no memorial descritivo. | **Ausência de anotações técnicas ao longo dos segmentos:** Não há exibição de textos ao longo da linha (`textPath` SVG ou rótulos orientados) indicando a distância em metros (ex: `124.50 m`) e o azimute (ex: `84°12'30"`). | Obriga o usuário a alternar a atenção o tempo todo entre o mapa e a tabela inferior. |
| **Atalhos de Teclado Topográficos** | Suporta `Esc` (cancelar/limpar) e botão do meio do mouse para Pan e duplo clique para Zoom Extents. | Faltam atalhos universais de CAD: `Z` (Zoom janela), `E` (Zoom extents), `P` (Caneta), `L` (Modo Linha/Régua), `Space` (Pan manual com botão esquerdo) e `Delete` (desativar/ignorar ponto selecionado). | Fluxo de trabalho mais lento dependendo excessivamente de cliques no mouse. |

---

## 3. Plano de Ação Recomendado (Roadmap de Melhorias)

### Fase 1: Correções Imediatas de Conflito e Hierarquia (Quick Wins)
1. **Ajuste de Z-Index de Camadas**: Inverter a prioridade em `DEFAULT_LAYERS`:
   - `perimetro` (linhas do imóvel): subir para **zIndex 520** (com casing preto de 1px).
   - `vizinhos` (polígonos de confrontantes): ajustar para **zIndex 440** (para ficarem sob a divisa principal).
2. **Deslocamento e Unificação de Toolbars**:
   - Mover `#map-cad-floating-toolbar` para a direita ou integrá-la dentro da toolbar rápida do `<ui-canvas-cad>` (`cad-quick-toolbar` em `top: 12px; right: 12px;`).
3. **Casing nas Linhas do Perímetro**:
   - Aplicar linha de halo escuro (`weight: 4`, `#080d0a`, `opacity: 0.7`) por baixo da linha colorida `#00f5a0` (`weight: 2`) garantindo contraste total sobre qualquer imagem de satélite.

### Fase 2: Seleção e Sobreposição Inteligente
1. **Tratamento de Vértices Coincidentes (Cluster Spiderfy / Badge)**:
   - Detectar pares de vértices no mesmo pixel e exibir um marcador com anel duplo ou contador `×2`.
   - Ao clicar em vértices sobrepostos, abrir um popup em lista ("Selecione o vértice desejado: Ponto Corrigido [M-01] ou Ponto Bruto [P-01]").
2. **Seleção de Segmentos e Polígonos**:
   - Adicionar listener de clique interativo nos segmentos e polígonos, disparando `ui-segmento-selecionado` e alimentando o Painel de Propriedades com os dados da divisa (extensão, azimute, confrontante, método de posicionamento).
3. **Crossing Selection Real no CAD**:
   - Implementar teste de interseção de linha para a caixa de seleção verde (Direita ➔ Esquerda), selecionando segmentos e polígonos interceptados.

### Fase 3: Rótulos e Simbologia Técnica Avançada
1. **Rótulos Inteligentes com Zoom-LOD (Level of Detail)**:
   - Em zooms aproximados (Zoom ≥ 16), renderizar rótulos sutis acima dos marcos com seus códigos (`M-01`, `V-02`).
   - Opção na toolbar para alternar visibilidade de rótulos: "Nomes", "Distâncias/Azimutes", "Ambos", "Nenhum".
2. **Preenchimento Sutil do Imóvel**:
   - Adicionar camada de polígono com preenchimento translúcido (`rgba(0, 245, 160, 0.08)`) no perímetro fechado para destacar imediatamente a área territorial do imóvel rural perante o entorno.
