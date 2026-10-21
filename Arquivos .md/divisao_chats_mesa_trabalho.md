# 📋 Divisão Estruturada da Revisão da Mesa de Trabalho em 2 Sessões (Chats)

Para garantir máxima profundidade, zero sobrecarga cognitiva e preservação total da janela de contexto, o bloco de **12 áreas da Mesa de Trabalho** foi organizado em dois grupos coerentes e desacoplados:

---

## 🔹 CHAT 1: Núcleo Geométrico, Interação no Mapa e Topologia Perimetral (Áreas 1 a 6)

> **Missão do Chat 1**: Focar em toda a fundação geométrica, manipulação gráfica direta no mapa Leaflet/Canvas, algoritmos de projeção/azimute, ordenação de vértices e tratamento topológico de sobreposições.

### Áreas Contempladas no Chat 1:
1. **Área 01 — Orquestração, Ciclo de Vida e Atalhos de Teclado**
   * *Arquivos*: [mesa_trabalho.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho.ts), [mesa_trabalho_template.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho_template.ts), [mesa_trabalho_context.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/mesa_trabalho_context.ts)
   * *Escopo*: Estado reativo (`ctx`), ciclo de vida de montagem/desmontagem de telas, atalhos (`F2`, `F4`, `Esc`, `Del`, `1-6`), split-screen.
2. **Área 02 — Motor Geodésico e Cálculos Cartográficos**
   * *Arquivos*: [mesa_geodesica.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/mesa_geodesica.ts), `services/processamento/`
   * *Escopo*: Projeções SIRGAS 2000 UTM 22S/fusos elipsoidais, azimutes sexagesimais/decimais, distâncias geodésicas, área (Gauss), erro linear e tolerâncias INCRA.
3. **Área 03 — Canvas do Mapa, Camadas e Renderização Visual**
   * *Arquivos*: `ui/mapa_triagem.ts`, [pontos_visiveis.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/pontos_visiveis.ts), [coordenadas_mapa.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/coordenadas_mapa.ts)
   * *Escopo*: Renderização em massa via Leaflet Canvas, fallbacks visuais quando segmentos estão vazios, rotulagem de vértices/cotas, enquadramento dinâmico (`fitBounds`).
4. **Área 04 — Ordenador Perimetral e Caminhamento ($P_1 \to P_n$)**
   * *Arquivos*: [ordenador_manual/](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/ordenador_manual/), [organizador_perimetro.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/organizador_perimetro.ts), `routes/levantamento/segmentos.py`
   * *Escopo*: Sequenciamento perimetral, travamento de sub-trechos, inversão de sentido horário/anti-horário, autorregeneração e fechamento $P_{last} \to P_1$ via `/salvar-ordem`.
5. **Área 05 — Vetorização Interativa (Caneta e Edição de Divisas)**
   * *Arquivos*: [ferramenta_caneta.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/ferramenta_caneta.ts), [preview_divisa.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/preview_divisa.ts)
   * *Escopo*: Rubberbanding em tempo real, snap magnético em vértices com raio configurável, quebra e inserção de novos vértices em divisas existentes.
6. **Área 06 — Topologia e Unificação de Vértices Sobrepostos**
   * *Arquivos*: [unificador_sobrepostos.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/unificador_sobrepostos.ts), [seletor_sobrepostos.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/seletor_sobrepostos.ts)
   * *Escopo*: Detecção de pontos coincidentes/próximos ($< 0.10\text{m}$), desambiguação de cliques em pilhas de vértices, modal de fusão e preservação de referências.

---

## 🔸 CHAT 2: Atributos, Cartório, Peças Técnicas, CAD Externo e Nuvem (Áreas 7 a 12)

> **Missão do Chat 2**: Focar na camada de metadados cartorários, edição de propriedades em lote, confronto com vizinhos, exportações para CAD (AutoCAD/TopoCAD2000), emissão de documentos oficiais, auditoria/undo e sincronização em nuvem.

### Áreas Contempladas no Chat 2:
7. **Área 07 — Painel Dinâmico de Propriedades e Adaptadores**
   * *Arquivos*: [painel_propriedades/](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/painel_propriedades/), [servico_salvamento.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/painel_propriedades/servico_salvamento.ts)
   * *Escopo*: Adaptadores polimórficos (`vertice`, `segmento`, `multi`, `geral`), edição em lote de atributos técnicos (M/V/P, métodos PG1-PG4, precisões $\sigma$), salvamento atômico com debouncing.
8. **Área 08 — Confrontações, Vizinhos e Diálogos de Cartório**
   * *Arquivos*: [camada_confrontantes.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/camada_confrontantes.ts), [lista_confrontantes.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/lista_confrontantes.ts), [dialogos_cartorio.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/dialogos_cartorio.ts)
   * *Escopo*: Atribuição de confrontantes às divisas, importação de limites SIGEF (CSV/ODS/WKT), conformidade com chave estrangeira `pessoa_id`, tipos de limites e anuências.
9. **Área 09 — Exportação CAD e Clipboard Estruturado (AutoLISP)**
   * *Arquivos*: [exportacao_cad.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/exportacao_cad.ts)
   * *Escopo*: Injeção no clipboard para AutoCAD e TopoCAD2000 (rotinas AutoLISP), scripts `.scr`, exportação DXF R12/R2000 em layers e empacotamento Shapefile (.ZIP + `.prj`).
10. **Área 10 — Emissão de Peças Técnicas, Laudos e Documentos**
    * *Arquivos*: [gerador_documentos.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/gerador_documentos.ts), [validadores_documento.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/validadores_documento.ts), [emissao_pecas.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/emissao_pecas.ts)
    * *Escopo*: Memoriais Descritivos normatizados, Laudo de Faixa de Fronteira com cálculo determinístico elipsoidal GRS80 (`pyproj.Geod`), Requerimento de Ratificação e impressão nativa com classe `.no-print`.
11. **Área 11 — Histórico de Alterações, Auditoria e Undo/Redo**
    * *Arquivos*: [auditoria_historico.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/auditoria_historico.ts), [mesa_trabalho_historico.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/mesa_trabalho_historico.ts)
    * *Escopo*: Pilha de desfazer/refazer (`Ctrl+Z`, `Ctrl+Y`), snapshots de polilinha, trava read-only em projetos com status `'ARQUIVADO'` (HTTP 403).
12. **Área 12 — Sincronização Nuvem e Paridade Web Hub**
    * *Arquivos*: [nuvem_sync_modal.ts](file:///d:/Programação/GerenciGeo/frontend/src/views/mesa_trabalho/nuvem_sync_modal.ts), `routes/nuvem.py`, `frontend/public/api.php`
    * *Escopo*: Sincronização perimetral bidirecional com a Hostinger Nuvem Hub, paridade de esquemas MySQL/SQLite e guarda `isLocal`.

---

## 🚀 Prompts de Inicialização Prontos para Copiar e Colar

### Prompt para o Chat 1 (Se desejar abrir em nova sessão):
```markdown
Estamos iniciando a REVISÃO PROFUNDA DA MESA DE TRABALHO - PARTE 1 (Áreas 1 a 6: Núcleo Geométrico, Interação no Mapa e Topologia).
Contexto e regras estabelecidas:
- Projeto: GerenciGeo
- Constituição: Protocolo V.L.A.E.G. e gemini.md
- Aprendizados: .jules/learnings.md (Leaflet _leaflet_pos, String(id), fallbacks de polilinha temporária)
- Foco exclusivo desta sessão:
  1. Orquestração e Ciclo de Vida (mesa_trabalho.ts & Template)
  2. Motor Geodésico e Cálculos Cartográficos (mesa_geodesica.ts)
  3. Canvas do Mapa e Renderização Visual (mapa_triagem / pontos_visiveis.ts)
  4. Ordenador Perimetral e Caminhamento P1 -> Pn (ordenador_manual/ & segmentos.py)
  5. Vetorização Interativa / Caneta (ferramenta_caneta.ts)
  6. Topologia e Unificação de Vértices Sobrepostos (unificador_sobrepostos.ts)
Por favor, inicie a revisão detalhada pela Área 1.
```

### Prompt para o Chat 2 (Quando for iniciar a segunda parte):
```markdown
Estamos iniciando a REVISÃO PROFUNDA DA MESA DE TRABALHO - PARTE 2 (Áreas 7 a 12: Atributos, Cartório, Peças Técnicas, CAD Externo e Nuvem).
Contexto e regras estabelecidas:
- Projeto: GerenciGeo
- Constituição: Protocolo V.L.A.E.G. e gemini.md
- Aprendizados: .jules/learnings.md (pessoa_id em confrontantes, parsing office:value, clipboard estruturado, isolamento isLocal)
- Foco exclusivo desta sessão:
  7. Painel Dinâmico de Propriedades e Adaptadores (painel_propriedades/)
  8. Confrontações, Vizinhos e Diálogos de Cartório (camada_confrontantes.ts)
  9. Exportação CAD e Clipboard Estruturado AutoLISP (exportacao_cad.ts)
  10. Emissão de Peças Técnicas e Laudos de Faixa de Fronteira (gerador_documentos.ts)
  11. Histórico de Alterações, Auditoria e Undo/Redo (auditoria_historico.ts)
  12. Sincronização Nuvem e Paridade Web Hub (nuvem_sync_modal.ts & api.php)
Por favor, inicie a revisão detalhada pela Área 7.
```
