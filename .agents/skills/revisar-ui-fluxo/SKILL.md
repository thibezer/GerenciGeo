---
name: revisar-ui-fluxo
description: "Checklist e protocolo para revisar qualquer modal, painel ou página do GerenciGeo: corrige sobreposição de z-index, impede quebra de botões/badges em 2 linhas, elimina textos inúteis e otimiza o fluxo do usuário (auto-save, dirty-state, atalhos clicáveis, drag-and-drop amplo, paste e auto-refresh)."
---

# Skill: `revisar-ui-fluxo` — Revisão de UI, Textos e Fluxo de Usuário

Use esta skill sempre que o usuário pedir para **revisar**, **limpar**, **melhorar a UX/fluxo** ou **corrigir problemas visuais** em qualquer modal, painel ou página do GerenciGeo.

---

## 1. Empilhamento (`z-index`) e Sobreposição
Antes de tudo, garanta que nada cubra modais, dropdowns ou tooltips:
- **Respeite a escala do `@thibezer/ui-components-kit`**:
  - `--ui-z-workspace-hud: 500`
  - `--ui-z-docked-bar: 600` (ribbons, barras acopladas)
  - `--ui-z-drawer: 700`
  - `--ui-z-modal: 1000` (`<ui-modal>` e backdrop)
  - `--ui-z-popover: 1050` (selects e menus acima de modais)
  - `--ui-z-toast: 1100`
  - `--ui-z-tooltip: 1200`
- **Barras sticky/fixas** (ex.: `.ribbon-master-container`) devem usar `z-index: var(--ui-z-docked-bar, 600)` — nunca valores arbitrários como `2000` que passam por cima de `<ui-modal>`.
- **Containers de mapa Leaflet** (ex.: `.map-container-wrapper`) devem isolar seu contexto de empilhamento (`position: relative; z-index: 1;`) para que controles internos do Leaflet (`.leaflet-top`/`.leaflet-bottom`, que usam `z-index: 1000`) não vazem acima da ribbon ou de modais.

---

## 2. Botões, Badges e Rodapés (Zero Quebra Indesejada)
- **Botões e badges em uma única linha**:
  - Todo botão de ação e badge de contagem deve ter `whitespace-nowrap shrink-0`.
  - Em Web Components `<ui-botao>` dentro de containers `flex`, adicione `class="... whitespace-nowrap shrink-0"` e `style="white-space: nowrap;"` quando houver risco de compressão.
- **Rodapé de modal (`slot="rodape"`)**:
  - Evite `flex-wrap` quando houver texto informativo à esquerda + botão `Fechar`/ação à direita; isso faz o botão cair para a linha de baixo e esticar em 100% da largura.
  - Use `flex items-center justify-between gap-3 w-full`, colocando `min-w-0` no texto e `shrink-0 whitespace-nowrap` nos botões.

---

## 3. Corte de Textos Inúteis e Densidade Visual
Para cada texto na tela, pergunte: *"Se eu apagar isso, o usuário perde alguma informação necessária para agir?"* Se não perder, **apague**.
- **Títulos e cabeçalhos**: Diretos ao ponto (2–4 palavras). Remova sufixos técnicos desnecessários (ex.: `"(Entrada IA)"`, `"Envio direto para..."`).
- **Subtítulos explicativos**: Elimine frases óbvias como *"Você pode enviar um ou vários..."*, *"Edite ou visualize antes de processar"*, *"Clique abaixo para..."*.
- **Labels e placeholders**:
  - Labels curtos (1–2 palavras): `Vínculo`, `Observação (opcional)`.
  - Placeholders com no máximo 1 exemplo curto (nunca parágrafos explicando o comportamento padrão).
- **Estados vazios**: Apenas ícone + título curto (`Fila vazia`) + 1 instrução mínima (`Adicione arquivos ao lado.`).
- **Metadados de cards**: Compacte em uma linha (`1.2 MB • 26/11 10:19`) em vez de frases (`Enviado em...`).
- **Campos de texto**: Prefira `rows="2"` em `textarea` opcional para manter o modal compacto e sem scroll desnecessário.

---

## 4. Análise de Fluxo Inteligente (Menos Cliques, Menos Atrito)
Avalie o passo a passo real do usuário e elimine fricções:
1. **Auto-save em seletores e dirty-state em inputs**:
   - Mudar um `<select>` de categoria/vínculo em um item já listado deve salvar imediatamente (`change`), sem exigir clique extra em `Salvar`.
   - Em inputs de texto editáveis inline, só exiba o botão `Salvar` quando o valor for alterado (`dirty`), e permita salvar com `Enter`.
2. **Transforme instruções passivas em atalhos de 1 clique**:
   - Se a interface sugere um comando ou texto para o usuário usar em outro lugar (ex.: prompt do chat), torne o elemento clicável para copiar para a área de transferência (`navigator.clipboard.writeText`) com toast de confirmação.
3. **Área de soltura e colagem amplas**:
   - Em fluxos de upload, aceite `dragover`/`drop` na coluna/card inteiro (não apenas no tracejado interno) e suporte `Ctrl+V` (`paste` no modal quando o foco não estiver em `INPUT`/`TEXTAREA`).
4. **Auto-atualização ao voltar de janelas externas**:
   - Se a tela possui ação que abre o explorador de arquivos ou janela externa (ex.: `Abrir Pasta`), adicione um listener em `window.focus` enquanto o modal estiver aberto para recarregar a lista automaticamente quando o usuário retornar.
5. **Higiene de listeners**:
   - Sempre remova listeners globais (`window`, `document`) no fechamento (`ui-fechar` ou teardown da view).

---

## 5. Validação Final
Após aplicar as melhorias:
1. Execute `npm --prefix frontend run build` (`tsc && vite build`) para garantir zero erros de tipo ou empacotamento.
2. Confira visualmente (ou via código/print) que:
   - Nenhum botão/badge quebra em 2 linhas;
   - O rodapé mantém ações alinhadas e compactas;
   - O modal fica acima de ribbons, mapas e toolbars.
