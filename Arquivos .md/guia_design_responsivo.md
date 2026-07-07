# Guia de Design Responsivo — Instruções para IA

Este arquivo define as regras e critérios técnicos que devem ser aplicados ao criar ou modificar interfaces responsivas. Siga estas instruções ativamente ao gerar código frontend.

---

## 0. Como Usar Este Guia

- Aplique estas regras **por padrão** em todo código de interface que você gerar ou editar.
- Se o projeto já tiver uma convenção estabelecida (ex: breakpoints customizados, framework específico), **respeite a convenção existente** e use este guia apenas como complemento.
- Em caso de conflito entre uma instrução aqui e uma instrução explícita do usuário, **a instrução do usuário tem prioridade**.
- Quando não houver indicação de framework, gere **CSS puro com media queries** e sinalize que o código pode ser adaptado para Tailwind/Bootstrap se necessário.

---

## 1. Princípios Fundamentais

**Mobile-First (padrão):** Escreva os estilos base para telas pequenas e use `min-width` nas media queries para expandir progressivamente. Exceção: se o projeto for explicitamente desktop-only, inverta a lógica.

**Paridade de conteúdo:** O mesmo conteúdo deve estar acessível em qualquer tamanho de tela. Ocultar conteúdo com `display: none` apenas por questão de espaço é incorreto — reorganize ou recolha, mas não remova.

**Desempenho:** Imagens e mídias pesadas devem ter tamanho otimizado por contexto. Evite layout shifts durante carregamento (propriedades `width` e `height` explícitas em elementos de mídia).

---

## 2. Breakpoints

Os valores abaixo são os padrões a adotar. Em projetos com **Tailwind CSS**, use as classes utilitárias equivalentes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`). Em **CSS puro**, use os valores numéricos em `@media`.

| Faixa de Largura | Breakpoint (CSS puro) | Equivalente Tailwind | Comportamento esperado |
| :--- | :--- | :--- | :--- |
| 0px – 479px | Base (sem media query) | Base | Coluna única, navegação inferior, toque otimizado |
| 480px – 767px | `min-width: 480px` | `sm:` (~640px) | Transição para 2 colunas em elementos compatíveis |
| 768px – 1024px | `min-width: 768px` | `md:` / `lg:` | Menu horizontal ou lateral compacto, multi-colunas simples |
| 1025px – 1440px | `min-width: 1025px` | `xl:` (~1280px) | Layout completo, grids complexos, espaçamento generoso |
| Acima de 1440px | `min-width: 1441px` | `2xl:` (~1536px) | Aplicar `max-width` no container para evitar distorção |

**Regra importante:** Breakpoints devem ser definidos pelo comportamento do conteúdo, não por modelos de dispositivo específicos. Se o layout quebrar num ponto intermediário, adicione um breakpoint naquele valor, não nos valores da tabela acima.

---

## 3. Layout e Grid

- Use **CSS Grid** para estruturas bidimensionais (página inteira, seções com linhas e colunas).
- Use **Flexbox** para alinhamentos unidimensionais (nav bars, listas de cards, grupos de botões).
- Evite valores de largura fixos em `px` para containers. Use `%`, `vw`, ou `max-width` com `margin: auto`.
- Todo container principal de conteúdo deve ter `max-width: 1200px` (ou `1440px` em layouts largos) e ser centralizado.

---

## 4. Tipografia

- Use `rem` para tamanhos de fonte. Nunca use `px` fixo em `font-size` de texto de conteúdo (títulos, parágrafos, labels). `px` é aceitável apenas em casos de uso especial como ocultação visual (`font-size: 0`) ou sistemas de ícones externos com tamanho fixo por design.
- Para tipografia fluida (que escala suavemente entre breakpoints sem media queries adicionais), use `clamp()`:

  ```css
  /* Exemplo: mínimo 1rem, ideal 2.5vw + 0.5rem, máximo 2.5rem */
  font-size: clamp(1rem, 2.5vw + 0.5rem, 2.5rem);
  ```

- Tamanho mínimo do body em mobile: `1rem` (16px).
- `line-height` do body: entre `1.5` e `1.6`.

---

## 5. Imagens e Mídias

- Toda imagem deve ter `max-width: 100%` e `height: auto` para não transbordar o container.
- Defina `width` e `height` explicitamente no HTML para evitar layout shift (CLS).
- Para ícones e logotipos, prefira SVG inline ou referenciado.
- Para imagens com diferentes cortes por tamanho de tela, use a tag `<picture>` com `<source media="...">`.
- Para entregar resoluções diferentes sem mudar o corte, use o atributo `srcset`.

---

## 6. Navegação

- Em telas menores que 768px: oculte a navegação principal e implemente menu hambúrguer ou Bottom Navigation Bar.
- Em telas maiores ou iguais a 768px: exiba os links horizontalmente de forma explícita.
- Menus suspensos e modais devem ter `z-index` definido explicitamente para não ficarem ocultos por outros elementos. Mantenha uma escala coerente (ex: modais em `z-index: 1000`, dropdowns em `z-index: 500`).
- O foco via teclado (`:focus`) deve ser visível em todos os elementos interativos da navegação.

---

## 7. Botões e Elementos Interativos

- Área mínima de toque: **44×44px** (WCAG 2.2). Em contextos Android/Google Material, use **48×48px**.
- Espaçamento mínimo entre elementos interativos adjacentes: **8px** (via `padding` ou `margin`).
- Todo elemento clicável deve ter estados visuais distintos para:
  - `:hover` — feedback ao passar o mouse
  - `:focus` — feedback ao navegar por teclado (não remova o outline padrão sem substituir por alternativa visível)
  - `:active` — feedback no momento do clique/toque

---

## 8. Critérios de Validação (aplique antes de finalizar qualquer interface)

Antes de entregar ou concluir uma implementação de interface, verifique:

1. O layout funciona sem quebra ou scroll horizontal entre 320px e 1920px de largura?
2. Fontes e espaçamentos usam unidades relativas (`rem`, `%`, `clamp`) em vez de `px` fixos?
3. Botões e links em mobile têm área de toque mínima de 44px?
4. Imagens têm `max-width: 100%`, `height: auto`, e atributos `width`/`height` definidos no HTML?
5. Elementos interativos possuem estados `:hover`, `:focus` e `:active` visualmente distintos?
6. Modais e dropdowns têm `z-index` definido e não ficam ocultos por outros elementos?
