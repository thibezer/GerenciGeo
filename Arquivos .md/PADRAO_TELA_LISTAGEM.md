# Padrão de Tela de Listagem — GerenciGeo

> Criado na redesenhada **tela de Clientes** (`frontend/src/views/clientes*`). Este documento explica **por que** ela ficou assim e **como repetir** em Propriedades, Levantamentos, Banco CCIR etc. sem reinventar nada.
>
> Complementa `design_system.md` (tokens, grade de 8px, densidade) e `GUIA_COMPONENTES_UI.md` (componentes).

---

## 1. O que estava errado na tela antiga

Observado com a tela renderizada em 1366×768:

| Problema | Efeito |
| :--- | :--- |
| Texto de 9–11px (cabeçalhos 9px, badges 8,5px) | Cansativo de ler; ruim para quem usa o app o dia todo |
| Página padrão de **10 linhas** num card que ocupa a tela toda | Mais da metade da tela vazia, e é preciso paginar à toa |
| Colunas sem valor de decisão: **Senha GOV** exposta (com olho em toda linha) e "Projetos" | O que o operador precisa para *ligar/localizar* o cliente (telefone, e-mail, cidade) não aparecia |
| As estatísticas PF / PJ / incompletos **já eram calculadas** no código, mas não existia nenhum lugar para vê-las ou filtrar por elas | Trabalho invisível; operador abria um a um para achar cadastro incompleto |
| Ícones de ação de ~20px, três por linha (ver / editar / excluir) + clicar no nome já abria a ficha | "Ver" redundante e alvos de clique pequenos |
| Sem ordenação, sem estado vazio decente, "Carregando..." em texto solto | Tela parece quebrada quando não há dado |

---

## 2. O que a pesquisa recomenda (e o que adotamos)

Fontes são, em sua maioria, blogs de UX e design systems públicos — são direção, não norma. Quando há norma (WCAG), isso está marcado.

| Recomendação | Fonte | Como foi aplicada |
| :--- | :--- | :--- |
| Barra de ferramentas **acima** da tabela com busca, filtros e ordenação; filtros que alteram os dados ficam colados na tabela | [Lollypop – guia de data tables](https://lollypop.design/blog/2026/march/the-ultimate-guide-to-designing-user-friendly-data-tables/?p=24042), [SaaS UI – table patterns](https://saasui.design/blog/saas-data-table-ux-patterns) | Barra única: título · segmentos · busca · ação primária |
| Filtros, ordenação, seleção e ações devem ser pensados **como uma camada só** sobre a tabela base | [SaaS UI – table UI patterns](https://www.saasui.design/blog/saas-data-table-ui-patterns) | Segmentos + busca + ordenação compartilham o mesmo pipeline (§5.2) |
| Densidade: 40px (condensada) / 48px (regular) / 56px (confortável); condensada para ferramentas operacionais | [Lollypop](https://lollypop.design/blog/2026/march/the-ultimate-guide-to-designing-user-friendly-data-tables/?p=24042) | **48px** (`--lp-row-h`): duas linhas de texto legíveis por linha |
| Tabela com **6 a 8 colunas**; congelar a coluna identificadora se houver scroll horizontal | [Design Better Data Tables](https://coyleandrew.medium.com/design-better-data-tables-4ecc99d23356) | 8 colunas no máximo; colunas secundárias somem por largura (§4.3) |
| Linha com página de detalhe deve ser **clicável**; ação "Ver detalhes" redundante sai do menu; hover mesmo quando não clicável | [Helix – table behavior](https://helix.internal.timelycare.com/patterns/table-behavior) | Linha inteira abre a ficha; botão "ver" removido |
| Ações de linha: com 2+ ações, agrupar (ou revelar no hover); não misturar botão inline com linha clicável sem cuidado | [Spark Web – internal admin](https://unpkg.com/@spark-web/design-system@5.1.21/patterns/internal-admin/CLAUDE.md), [PatternFly](https://v5-archive.patternfly.org/components/overflow-menu/design-guidelines) | Editar/Excluir ficam apagados e acendem no hover/foco (o app não tem componente de menu "⋯"; ver §8) |
| Seleção + barra de ações em lote; confirmar destrutivas dizendo **quantas** linhas | [SaaS UI](https://saasui.design/blog/saas-data-table-ux-patterns) | Barra de lote mantida; texto de confirmação já listava quantidade (`montarConfirmacaoExclusao`) |
| Filtro rápido como **chips/segmentos com contagem**; segmento = escolha única, chip = multi-seleção | [Stripe – filter controls](https://docs.stripe.com/stripe-apps/patterns/filter-controls), [Sigma – segmented control](https://help.sigmacomputing.com/docs/segmented-control.md) | Segmentos `Todos · PF · PJ · Pendências` com contador |
| Paginação quando o usuário *procura* algo específico; scroll infinito perde posição e dificulta deep-link | [Michelin DS – table](https://designsystem.michelin.com/components/table), [SaaS UI](https://saasui.design/blog/saas-data-table-ux-patterns) | Mantida paginação, padrão subiu de 10 → **25** linhas |
| **WCAG 2.2 · 2.5.8 (AA)**: alvo mínimo 24×24 CSS px (ou espaçamento equivalente); em linhas de ícones, aumentar a área de clique com padding | [W3C/Deque – target size](https://dequeuniversity.com/rules/axe/4.7/target-size), [TabNav](https://tabnav.com/academy/wcag/success-criterion-2.5.8) | Botões de ícone com **28×28** (glifo de 15px) e 4px de folga |
| Master-detail/painel lateral só quando a lista precisa continuar visível; evitar quando um painel simples basta | [Microsoft – master detail](https://developer.microsoft.com/en-ca/azure-devops/components/master-detail), [SaaS UI – list/detail](https://www.saasui.design/blog/saas-list-detail-master-detail-ux-patterns) | **Não adotado ainda**: a ficha continua em modal. Ver §9 |

---

## 3. Anatomia da tela (de cima para baixo)

```
┌─ lp-bar ───────────────────────────────────────────────────────────────┐
│ Título  [Todos 22|PF 22|PJ 0|Pendências 12]        [🔍 busca  / ] [+ Novo]│  ← uma linha (quebra em telas estreitas)
├─ lp-card ──────────────────────────────────────────────────────────────┤
│ ☐ CLIENTE ▲   CONTATO   CIDADE   VÍNCULOS   SENHA GOV   SITUAÇÃO   ·   │  ← cabeçalho sticky 34px
│ ☐ (AV) Nome  PF         (44)…    Umuarama   🏠2 📍3      ••••• 👁  ⚠ …   ✎ 🗑│  ← linhas de 48px, 2 linhas de texto
│   123.456.789-05        e-mail                                            │
│ …  (rolagem só aqui dentro; cabeçalho e rodapé fixos)                     │
├─ lp-rodape ────────────────────────────────────────────────────────────┤
│ Linhas por página [25]  Mostrando 1-22 de 22        ‹ 1 2 3 ›           │
└────────────────────────────────────────────────────────────────────────┘
        [ 3 selecionado(s) | Excluir selecionados | Cancelar ]   ← flutuante, só com seleção
```

Regras de comportamento:

- **Uma única rolagem**, interna à tabela (viewport fixo de `design_system.md` §2).
- **Linha inteira clicável** → abre a ficha. Cliques em checkbox e botões da linha **não** propagam para a linha.
- Teclado: `Tab` percorre cabeçalhos ordenáveis e linhas; `Enter` na linha abre a ficha; `Enter/Espaço` no cabeçalho ordena; `/` foca a busca; `Esc` na busca limpa.
- Ordenação: clique no cabeçalho alterna ▲/▼ (`aria-sort` atualizado). Empate sempre desempata por nome A–Z.
- Selecionar + filtrar: a seleção é **podada** para o que continua visível (excluir linha "selecionada" fora da tela é perigoso).
- Zero é apagado (`—`/cinza), não-zero é branco: o olho encontra o que importa.
- Cor só como sinal: âmbar = atenção, vermelho = vencido/erro, menta = ação/ativo (`design_system.md` §4).

---

## 4. Arquivos e contrato visual

### 4.1 Onde fica cada coisa

| Arquivo | Papel | Reaproveitável? |
| :--- | :--- | :--- |
| `frontend/src/lista-padrao.css` | Todas as classes `.lp-*` + tokens `--lp-*` (importado em `main.ts`) | **Sim, 100%** — não altere por tela |
| `frontend/src/views/clientes/clientes_template.ts` | HTML da barra, tabela, rodapé, lote | Copiar e trocar colunas/rótulos |
| `frontend/src/views/clientes/clientes_helpers.ts` | Funções **puras** (segmento, pendência, ordenação, HTML da linha) | Copiar o formato; regras são de cada domínio |
| `frontend/src/views/clientes.ts` | Estado, eventos, `renderTabela()` | Copiar o esqueleto (§6) |
| `frontend/tests/clientes.test.ts` | Testes dos helpers | Copiar o formato |
| `frontend/src/utils/lista_padrao.ts` | Peças **compartilhadas** (hoje: `renderBotoesPaginacaoHtml`) | **Sim** — importe, não copie |
| `frontend/src/utils.ts` | `escapeHtml`, `formatarDataBr` (dd/mm/aaaa sem fuso), `formatarCCIR`… | **Sim** |

### 4.2 Classes principais (`lista-padrao.css`)

| Classe | Uso |
| :--- | :--- |
| `.lp-bar`, `.lp-bar-left`, `.lp-bar-right`, `.lp-titulo` | Barra superior |
| `.lp-seg`, `.lp-seg-btn(.is-active)`, `.lp-seg-n` | Segmentos com contador. `data-tom="warn"` deixa o contador âmbar |
| `.lp-busca` (+ `.tem-valor`), `.lp-busca-limpar`, `.lp-kbd` | Busca com ícone, ✕ e dica de atalho |
| `.lp-btn-primario`, `.lp-btn-sec` | Botão primário (1 por tela) e secundário |
| `.lp-wrap` | **Container de rolagem da tabela** — obrigatório para as colunas responsivas (§4.3) |
| `.lp-tabela` (+ `th.lp-ordenavel`, `aria-sort`) | Tabela com cabeçalho sticky |
| `.lp-col-check`, `.lp-col-num`, `.lp-col-acoes` | Larguras/alinhamentos de colunas especiais |
| `.lp-id`, `.lp-id-txt`, `.lp-id-nome`, `.lp-sub`, `.lp-mono`, `.lp-muted` | Célula "identidade" (avatar + nome + linha secundária) e tipografia |
| `.lp-tag` + `-pf/-pj/-warn/-danger` | Etiquetas outline (`design_system.md` §6.2) |
| `.lp-cnt(.is-zero)`, `.lp-vinculos` | Contadores ícone+número |
| `.lp-acoes`, `.lp-ico-btn(.is-danger)` | Ações de linha (alvo 28px) |
| `.lp-estado`, `.lp-estado-*`, `.lp-skel` | Vazio / erro / skeleton de carregamento |
| `.lp-rodape`, `.lp-pag-btn(.is-active)` | Rodapé e paginação |
| `.lp-lote` | Barra flutuante de ações em lote |
| `.lp-oculta-xl / -lg / -md / -sm` | Esconde coluna por largura do container |
| `.lp-tile`, `.lp-tile-topo/-valor/-rodape/-rotulo` | Bloco de destaque (ex.: "próximo ponto disponível") |
| `.lp-chip` | Faixa numérica/código curto em mono |
| `.lp-aviso` (`<details>`), `.lp-aviso-corpo`, `.lp-painel` | Aviso âmbar recolhível e painel de detalhe |
| `.lp-card-barra` | Barra de ferramentas dentro do card (abas, filtros, busca) |
| `.lp-tabela.is-static` | Tabela só de leitura (linha sem cursor de clique) |
| `.lp-faixa`, `.lp-faixa-rotulo`, `.lp-faixa-valor`, `.lp-progresso` | Faixa de contexto de uma linha (pasta, progresso) |
| `.lp-terminal`, `.lp-log(.is-erro/.is-aviso/.is-sucesso/.is-ocioso)`, `.lp-card-titulo` | Terminal de logs e título de card |
| `.lp-campo`, `.lp-faixa-num`, `.lp-lista-sel`, `.lp-dropzone`, `.lp-link` | Campos de formulário compactos dentro de card |
| `.lp-popover`, `.lp-popover-corpo`, `.lp-planilha` | Popover ancorado a um botão e seus itens |

### 4.3 Colunas responsivas (sem scroll horizontal)

A largura útil da tabela é a da tela **menos ~230px da sidebar**, então media queries por viewport erram. O padrão usa **container queries** sobre `.lp-wrap`:

| Classe | Some quando a tabela tem… | Use para |
| :--- | :--- | :--- |
| `.lp-oculta-xl` | < 1180px | Dados raros/sensíveis (ex.: Senha GOV) |
| `.lp-oculta-lg` | < 980px | Dados secundários (ex.: Cidade) |
| `.lp-oculta-md` | < 760px | Contato |
| `.lp-oculta-sm` | < 600px | Situação |

Aplique a **mesma classe** no `<th>` e no `<td>`. Tudo que some continua acessível na ficha de detalhe — **nunca** deixe dado só em coluna que pode sumir.

> Em 1366×768 (largura de tabela ≈ 1100px) a coluna *Senha GOV* fica oculta; a senha continua acessível (e auditada) na ficha do cliente.

---

## 5. Contrato dos helpers (lógica sem DOM)

Toda regra de negócio da listagem mora em **funções puras** no `*_helpers.ts`, para ser testável com `npm test` (Node, sem navegador).

### 5.1 Funções que toda listagem deve ter

```ts
type Segmento = 'todos' | 'pf' | 'pj' | 'pendencias';          // ajuste ao domínio
type CampoOrdem = 'nome' | 'cidade' | 'vinculos';
type Direcao = 'asc' | 'desc';

listarPendenciasX(item): { codigo, rotulo, tom: 'warn' | 'danger' }[]   // [] = em ordem
filtrarPorSegmento(lista, segmento): lista
contarSegmentos(lista): Record<Segmento, number>          // sobre a lista INTEIRA (chip não muda com a busca)
ordenarX(lista, campo, direcao): lista                    // estável, não muta, desempata por nome A–Z
renderLinhasTabelaHtml(visiveis, selecionados): string    // escapeHtml em TODO texto vindo do usuário
renderBotoesPaginacaoHtml(pagina, totalPaginas): string
```

### 5.2 Pipeline único (ordem importa)

```
todos  →  filtrarPorSegmento  →  filtrar(busca)  →  ordenar  →  fatiar(página)  →  render
```

Em `clientes.ts` isso é `getClientesFiltrados()` + `getClientesPaginaAtual()`. Qualquer filtro novo entra **nesse** pipeline, nunca em paralelo.

### 5.3 O que são "Pendências" em Clientes

| Código | Regra | Tom |
| :--- | :--- | :--- |
| `conjuge` | Casado(a)/União Estável **sem** nome de cônjuge | âmbar |
| `cnh-vencida` | `cnh_validade` anterior a hoje | vermelho |
| `sem-contato` | Sem telefone **e** sem e-mail | âmbar |

> Para outra tela, troque por *o que falta/vence nesse cadastro* (ex.: Propriedades sem matrícula/CCIR; Levantamentos sem ART). Se o segmento "Pendências" marcar quase tudo, a regra está frouxa demais — com dados reais de Clientes ela marcou 12 de 22, que é um bom sinal-ruído.

---

## 6. Receita para aplicar em outra tela

Exemplo: **Propriedades**. Tempo estimado: ~1–2h por tela.

1. **Escolha as colunas (máx. 8)** respondendo: *"o que o operador precisa ver para decidir sem abrir a ficha?"* Defina qual é a coluna identidade (2 linhas: nome + código/matrícula) e quais somem primeiro (`xl` → `lg` → `md` → `sm`).
2. **Defina os segmentos** (3–4, com contador). O último costuma ser "Pendências".
3. **Template** — copie a parte da listagem de `clientes_template.ts` (tudo até o comentário `MODAL DE CADASTRO`) e troque: título, `id`s (`busca-propriedade`, `seg-n-*`, `tabela-propriedades-body`…), `<th>`s. Mantenha: `lp-bar`, `lp-card` (não `ui-card`, ver §8), `.lp-wrap`, `lp-rodape`, `lp-lote`.
4. **Helpers** — crie/estenda `propriedades_helpers.ts` com as funções do §5.1 e **escreva os testes primeiro** (copie os 4 testes novos de `clientes.test.ts`).
5. **Estado e eventos** — copie os blocos de `clientes.ts`: `segmentoAtual`, `campoOrdem/direcaoOrdem`, `podarSelecaoFiltrada`, `limparBusca`, atalho `/` (+ `cleanup` da rota!), delegação de clique da linha, `renderEstadoVazio`, `atualizarCabecalhoLista`.
6. **Padrão de linhas por página = 25**, com opções 10/25/50/100.
7. **Ícones** — todo `data-lucide="x"` precisa estar registrado em `frontend/src/utils.ts` (ver §8). Prefira os já registrados: `edit`, `trash-2`, `eye`, `search`, `plus`, `x`, `home`, `map-pin`, `users`, `alert-circle`, `alert-triangle`, `copy`, `lock`.
8. **Verifique** com a lista do §7.

---

## 7. Checklist de "pronto" (Definition of Done)

- [ ] Texto ≥ 12px nas linhas, ≥ 11px nos cabeçalhos; nada abaixo disso
- [ ] Distância do card até o fim da janela = padding da página (14px), igual às laterais — sem margem extra (ver §8, item 0b)
- [ ] Linha de 48px, sem espaço morto abaixo das linhas com a lista cheia
- [ ] **Teste com mais linhas do que cabem na tela** (ex.: 100/página): a tabela rola por dentro e o rodapé continua visível
- [ ] Nenhum alvo de clique < 24×24px (botões de ícone 28px)
- [ ] Linha inteira abre a ficha; checkbox e botões de linha não disparam a abertura
- [ ] Busca ignora acento/caixa; `/` foca; `Esc` limpa; ✕ aparece com texto
- [ ] Segmentos com contador sobre a lista inteira; seleção podada ao filtrar
- [ ] Cabeçalhos ordenáveis com `aria-sort`; empate desempata por nome
- [ ] Estados: carregando (skeleton), vazio (com ação), vazio por filtro (com "Limpar"), erro (com "Tentar novamente")
- [ ] Sem scroll horizontal em 1366×768 nem em 1024; colunas somem via `lp-oculta-*`
- [ ] Todo texto do usuário passa por `escapeHtml`
- [ ] Rota tem `cleanup` removendo listeners globais (`document`/`window`)
- [ ] `npx tsc --noEmit` e `npm test` verdes

---

## 8. Armadilhas conhecidas (já encontradas aqui)

0. **Rodapé/paginação cortados com muitas linhas** → não use `<ui-card>` como moldura da listagem. O kit joga o conteúdo num `.ui-card__body` sem `min-height: 0`, então o `flex-1 min-h-0` da tabela é ignorado e ela cresce além do card (só aparece com mais linhas do que cabem na tela; com 10 linhas passava despercebido). Use `<div class="lp-card">`. A mesma moldura `ui-card` ainda existe em Propriedades e provavelmente tem o mesmo defeito com 25+ linhas.
0b. **Espaço sobrando embaixo do card** → a raiz da tela **não** pode usar `space-y-*` quando tem filhos fora do fluxo (barra de lote, modais): cada um soma margem e empurra o card para cima (~16px em Clientes). Use `gap-2` na raiz `flex flex-col` — `position: fixed/absolute` não entra no `gap`. Em Clientes os modais e a barra de lote ficam num `<div class="absolute">` ao final; em Levantamentos eles já são `fixed`.
0c. **A rota precisa estar na lista de `main.ts`** (`container.className = '… p-2.5 sm:p-3.5 … flex flex-col h-full'`, ~linha 156). Rota fora dessa lista cai no `p-6` genérico: padding de 24px, página que rola inteira e `h-full` sem efeito (o card nunca fecha a altura). Foi o que acontecia em Contagem de Pontos: adicione `route === 'sua_rota'` ali ao migrar uma tela. Hoje **todas** as rotas com tela estão na lista (dashboard, clientes, propriedades, levantamentos, contagem_pontos, hgo, fronteira, ccir, pendencias, configuracoes); ficam de fora só `mesa_trabalho`, `compartilhado` e `login`, de propósito (`p-0`).
0d. **Web component aberto sem fechar** → um `<ui-card>` fechado com `</div>` (era o caso de Contagem de Pontos) não quebra o build nem o `tsc`: o navegador aninha os próximos cards dentro do primeiro e o layout fica "estranho" (cards de larguras diferentes, empilhados). Por isso os templates novos usam `<div class="lp-card|lp-tile">` e há teste que confere que todo `<div>` abre/fecha (`tests/contagem.test.ts`).
0e. **`.hidden` do Tailwind não esconde classes `.lp-*`**: o CSS sem `@layer` vence o utilitário (que fica em layer). Todo bloco `.lp-*` que o JS liga/desliga com `classList.toggle('hidden')` precisa de regra própria — já existem para `.lp-card`, `.lp-faixa`, `.lp-aviso`, `.lp-tile`, `.lp-estado`, `.lp-painel`, `.lp-popover`, `.lp-lote`. Se criar uma classe nova que alterna, adicione a regra em `lista-padrao.css`.
0f. **`svg.className = ...` lança TypeError**: depois de `initIcons()` o `<i data-lucide>` vira `<svg>`, e `className` de SVG é só de leitura. Para trocar ícone ou classe, use `setAttribute('class', …)` ou substitua o elemento por um novo `<i data-lucide>` e chame `initIcons()` (ver `trocarIconeUpload` em `fronteira.ts`). Esse erro **já existia** na Área de Fronteira e abortava o evento de seleção da propriedade (nada era listado).
1. **Ícone não aparece** → o Lucide do projeto é *tree-shaken*: só renderiza ícones importados em `utils.ts` (`createIcons({ icons: {...} })`). `pencil`, `search-x`, `wifi-off` **não** estão registrados (por isso a edição usa `edit`). Para ícone novo, importe e adicione na lista.
2. **`ui-checkbox`** emite `change`/`ui-change` e usa o atributo `marcado`; o clique nele **não** pode abrir a ficha (`.lp-col-check` é ignorado na delegação).
3. **Atalho global** (`/`) em `document` vaza para outras telas se não houver `cleanup` — a rota **precisa** removê-lo.
4. **Container queries** só funcionam se `.lp-wrap` envolver a tabela; sem ele as colunas nunca somem.
5. **Menu "⋯" não existe** no kit atual. Com 2 ações (editar/excluir) o padrão aceitável é revelar no hover/foco (`.lp-acoes`). Se uma tela tiver 3+ ações, crie o componente de menu no kit em vez de lotar a linha.
6. **`ui-select` de paginação** vem como `value="25"`; o estado inicial `limitePorPagina` no `.ts` precisa bater com ele.
7. Mudanças no CSS/TS fazem o Vite recarregar a página inteira (a rota volta ao estado inicial).

---

## 9. O que NÃO foi feito (e o que fazer depois)

- **Ficha do cliente continua em modal** (780px). A pesquisa sugere painel lateral (*drawer*) quando o operador alterna muito entre registros; vale testar depois que o padrão de listagem estiver nas outras telas, pois a ficha é grande (4 abas) e o modal atual funciona.
- **`confirm()`/`alert()` nativos** seguem em `clientes.ts` (exclusão, erro de salvar), contra a regra de `design_system.md` §7.4. Migrar para `customConfirm`/`customAlert` (`utils.ts`) é um ajuste separado.
- **Colunas configuráveis / densidade alternável / views salvas**: nada na pesquisa justifica o custo agora; só se aparecer demanda.
- **Virtualização**: com paginação de 25–100 linhas não é necessária.
- Validado visualmente em 1366×768 e 1800×900 e com os dados reais (22 clientes); **não** testado em tela de toque nem abaixo de 1024px.

---

## 10. Telas já migradas

| Tela | Colunas | Segmentos | Pendências | Particularidades |
| :--- | :--- | :--- | :--- | :--- |
| **Clientes** | Cliente · Contato · Cidade · Vínculos · Senha GOV · Situação · ações | Todos / PF / PJ / Pendências | cônjuge faltando · CNH vencida · sem contato | Seleção em lote; paginação 25 |
| **Levantamentos** | Levantamento · Início · Status (+pendências) · Proprietários · Medições · ações | Todos / Andamento / Concluídos / Arquivados / Pendências | sem proprietário · sem TRT · sem pontos (arquivado não tem) | Sem paginação (poucos itens; a lista rola); **alternador Lista/Cards** (padrão agora é Lista); clique na linha abre a Mesa de Trabalho; ordenação padrão: início mais recente; status como etiqueta (`lp-tag-info` andamento, `lp-tag-pf` concluído, `lp-tag-mute` arquivado) |

| **Propriedades** | Imóvel rural (+município) · Proprietário · Documentos (CAR/CCIR) · Vínculos (matrículas e levantamentos) · Cadastro · Situação · ações | Todas / Com levantamento / Sem levantamento / Pendências | sem proprietário · composição incompleta · sem matrícula | Seleção em lote; paginação 25; **Documentos** vira tag mint (informado) ou apagada (faltando) em vez de pendência — CAR/CCIR faltam na maioria dos cadastros reais e marcá-los como pendência deixaria "Pendências" inútil |

| **Contagem de Pontos** | *Painel, não listagem*: 3 blocos "próximo disponível" (M/P/V) + aviso recolhível de conflitos + card com abas **Projetos / Terceiros** (Projetos · Numeração usada · Pontos · Fora do padrão) | abas + 2 botões liga/desliga (`Só meus pontos`, `Mostrar terceiros`) | alertas viram tag no bloco: `Cadastro ≠ projetos`, `N isolado(s)`, `N pulado(s)` | Só leitura (`.is-static`); sem paginação; estado dos filtros sobrevive ao "Atualizar"; "pulados" abre um painel único em vez de `<details>` dentro do bloco (não altera a altura do bloco) |

| **Organizador HGO** | *Painel*: barra (Procurar pasta · Converter e organizar) + faixa da pasta com chip de estado + faixa de progresso (só com `[n/m]` no log) + terminal que ocupa o resto da altura | — | chip de estado: Aguardando pasta / Pronto / Processando / Concluído / Atenção: erro no log | Classificação de log e leitura de progresso são helpers puros testados (`hgo_helpers.ts`); caminho longo mostra o **fim** (`direction: rtl` + `<bdi>`) |
| **Banco CCIR** | Código CCIR · Imóvel · Município/UF · Área · Titular · % Det. · ações | — (filtros por campo dentro do card; área e detenção recolhíveis) | — | Busca no servidor (limite de 200 → rodapé avisa), ordenação no cliente (sem refazer a busca); planilhas viram **popover** com contador; o link "Favorito INCRA" (bookmarklet) foi preservado byte a byte e é arrastável; clique na linha abre a ficha |
| **Área de Fronteira** | *Formulário em 2 colunas*: dados de operação + monitor geodésico (esquerda, rola por dentro) e documentos emitidos (direita, rola por dentro) | — | alerta legal da faixa de 150 km (monitor) | Ação primária vai para a **barra** com `<button type="submit" form="form-gerar-fronteira">` e fica sempre visível; modal de cruzamento de dados mantido |

| **Pendências** | Concluir · Tarefa (+descrição) · Prioridade · Criada em · excluir | Abertas / Alta prioridade / Concluídas / Todas | — (a própria lista é de pendências) | **Formulário de nova tarefa dentro do card** (sempre à mão, sem modal); concluídas sempre depois das abertas; ordenação padrão: prioridade desc; exclusão agora pede confirmação (`customConfirm`) |
| **Configurações** | Responsável (+formação) · Conselho/registro · CPF · Cód. INCRA · Vértices · banco de pontos/editar/excluir | — (busca por nome, registro, CPF…) | `Sem código` (âmbar) na coluna de código INCRA | Cadastro lista à esquerda; **formulário, nuvem e instruções empilhados à direita** (rolam por dentro); instruções recolhidas (`<details>`); CPF validado/mascarado por helpers testados; alerts/confirm nativos viraram `showToast`/`customConfirm` |

Arquivos de Pendências: `views/pendencias.ts`, `views/pendencias/pendencias_helpers.ts`, `tests/pendencias.test.ts`. Configurações: `views/configuracoes.ts`, `views/configuracoes/configuracoes_helpers.ts`, `tests/configuracoes.test.ts`.

Arquivos de HGO: `views/hgo.ts`, `views/hgo/hgo_helpers.ts`, `tests/hgo.test.ts`. CCIR: `views/ccir.ts`, `views/ccir/*`, `tests/ccir.test.ts`. Fronteira: `views/fronteira.ts`, `views/fronteira/fronteira_template.ts`.

Arquivos de Contagem de Pontos: `views/contagem_pontos.ts`, `views/contagem_pontos/contagem_{template,helpers,service}.ts`, `tests/contagem.test.ts`.

Arquivos de Propriedades: `views/propriedades.ts`, `views/propriedades/propriedades_helpers.ts`, `tests/propriedades.test.ts`.

Arquivos de Levantamentos: `views/levantamentos.ts`, `views/levantamentos/levantamentos_helpers.ts`, `tests/levantamentos.test.ts`.

Lições do segundo uso do padrão (Levantamentos):

- **A barra superior é o ponto apertado.** Em 1366×768 a tabela tem ~1114px; título + 5 segmentos + alternador + busca + 2 botões só cabem em uma linha com rótulos curtos (`Andamento`, `Triagem`, `Novo`) e busca de `clamp(150px, 13vw, 280px)`. Se a nova tela tiver mais de 4 segmentos, encurte rótulos antes de aceitar quebra de linha (custa 40px de altura).
- **O padrão também serve para painéis** (tela que não é uma lista de registros): barra única no topo, blocos de resumo compactos (`.lp-tile`, `.lp-aviso`, `.lp-painel`), **uma só região que rola** (a tabela) com `lp-card-barra` para abas/filtros/busca. Estado de abas e filtros fica no módulo (não no DOM) para sobreviver ao redesenho do "Atualizar".
- **Informação que a coluna não comporta vira tag**: as pendências entram na mesma célula do status em vez de uma coluna "Situação" extra.
- **Filtro por DOM (`display:none` em linhas) deve sair**: a tela antiga filtrava escondendo elementos; agora a lista é filtrada em dados (pipeline do §5.2) e renderizada de novo, o que mantém contagem, vazio e ordenação coerentes.
- **Regra de calibragem das pendências (Propriedades):** teste a regra com os dados reais antes de fixar. Com "sem CAR" como pendência, 13 de 18 propriedades cairiam em Pendências; sem ele, 8 de 18. Pendência tem de ser *ação do operador*, não ausência comum.
- **Bug achado na migração:** o proprietário principal era injetado no HTML **sem `escapeHtml`** (XSS por nome de cliente). Agora o helper escapa e há teste. Ao migrar uma tela, procure `${...}` crus em templates antigos.
- **Mais um XSS achado na migração (Configurações):** nome, formação, CPF, registro e endereços do profissional — e código/propriedade no banco de pontos — entravam no HTML sem `escapeHtml`. Agora os helpers escapam, com teste. Regra: ao migrar uma tela, `grep` por `${p.` / `${pt.` em templates antigos.
- **Funções puras que estavam enterradas no controller** (máscara/validação de CPF) foram para `*_helpers.ts` e ganharam teste — é onde costuma morar o bug de verdade.
- **Handlers globais (`onclick="window.x()"`) saem**: a tabela usa delegação de eventos (`data-action` + `.btn-action`); só as funções do modal continuam em `window` porque outras telas as chamam.
- **`confirm()`/`prompt()`/`alert()` nativos continuam** nas ações de excluir/desarquivar de Levantamentos (§9).

---

## 11. Resumo da decisão em uma frase

> Lista = **barra única** (título · segmentos com contagem · busca · ação primária) + **tabela de 48px com linha clicável** + **estados completos** + **lógica pura testada**; colunas secundárias somem por largura do container, e tudo que some existe na ficha.
