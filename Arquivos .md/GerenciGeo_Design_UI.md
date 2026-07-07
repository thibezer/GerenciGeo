# GerenciGeo — Guia de Design de Interface
**Baseado em Apple HIG, WWDC 2025 (Liquid Glass) e análise da interface atual**

> Este documento é um guia prático de decisões de design para o sistema GerenciGeo.
> Cada regra tem uma justificativa e uma aplicação direta ao que foi observado nas telas.

---

## 0. Diagnóstico da Interface Atual

Antes de prescrever, é necessário nomear o que está errado. A análise das screenshots revela os seguintes problemas:

| Área | Problema Observado |
|---|---|
| **Cores** | Uso simultâneo de verde (#00FF88), amarelo-ouro (#F5A623), azul (#3B82F6), roxo, laranja, ciano — muitas cores sem hierarquia semântica clara |
| **Tipografia** | Textos de label, dado, status e ação usam o mesmo tamanho e peso — tudo compete com tudo |
| **Botões** | Mistura de estilos: botões com ícone+texto, só texto, capsule, rounded rectangle — sem sistema coerente |
| **Densidade** | A tabela de vértices tem 12 colunas, headers em maiúsculas, células com dados numéricos de 10+ dígitos juntos — leitura difícil |
| **Cards do Workspace** | 5 cards lado a lado com bordas coloridas por categoria — muita saturação visual, hierarquia ambígua |
| **Status badges** | "BRUTO" em laranja preenchido chama mais atenção do que o nome do vértice (dado principal) |
| **Geometria** | CornerRadius inconsistente — badges usam ~4px, cards usam ~6px, botões usam ~4px — sem sistema |
| **Espaçamento** | Padding interno dos cards ≈ 8px enquanto padding externo entre cards ≈ 4px — proporção invertida |

---

## 1. Princípios Fundamentais

Adaptados do Apple Human Interface Guidelines para o contexto de um sistema desktop de geoprocessamento.

### 1.1. Clareza (Clarity)
> *"Text is legible at every size, icons are precise, and adornments are kept to a minimum."*

No GerenciGeo, clareza significa que o usuário precisa saber instantaneamente:
1. **Qual imóvel está sendo trabalhado** (contexto principal — cabeçalho)
2. **Em que etapa do fluxo está** (Mesa Geodésica / Organizador / etc.)
3. **Quais pontos têm problema** (status de qualidade dos vértices)

Qualquer elemento visual que não responda a uma dessas três perguntas é ruído e deve ser reduzido.

### 1.2. Deferência (Deference)
> *"The UI should never compete with the content."*

Em um sistema geodésico, o **conteúdo** é o mapa e os dados numéricos de coordenadas. A interface existe para servi-los. Isso significa:
- O mapa não deve ter moldura ou fundo competindo com ele
- Números de coordenadas não devem competir visualmente com labels de coluna
- Botões de ação secundária devem *recuar* visualmente — não brilhar

### 1.3. Profundidade (Depth)
> *"Visual layers convey hierarchy."*

O sistema tem três camadas naturais:
1. **Fundo/Contexto** — mapa, painel de workspace
2. **Conteúdo primário** — tabela de vértices, dados
3. **Ações** — botões, badges de status, filtros

Cada camada precisa de separação visual — não necessariamente por cor, mas por **luminância e espaçamento**.

---

## 2. Sistema de Espaçamento — Grade de 8px

### A regra base

Todo espaçamento deve ser múltiplo de **8px**, com subdivisões de 4px para ajustes finos. Esta é a convenção consolidada da Apple (reverse-engineered da HIG), e também é a base do Tailwind CSS e do Material Design — funciona porque 8 é divisível por 2, 4 e 8, tornando alinhamentos automáticos.

```
Escala de espaçamento:
  4px  — separação mínima (entre ícone e label, entre badge e borda)
  8px  — espaçamento interno de componentes pequenos (padding de badge, chip)
  12px — padding interno de cards compactos
  16px — padding padrão de cards, padding de células de tabela
  24px — separação entre seções
  32px — separação entre áreas principais (mapa → workspace → tabela)
  48px — margem de área de conteúdo
```

### Aplicação direta nos problemas observados

**Cards do Workspace (5 colunas):**
```css
/* Atual (estimado): padding ~8px, gap entre cards ~4px — proporção invertida */
/* Correto: */
.workspace-card {
  padding: 12px 16px;   /* interno generoso */
  gap: 8px;             /* externo menor — o interno sempre > externo */
  border-radius: 10px;
}
```

**Células da tabela de vértices:**
```css
/* As células precisam de altura definida para respirar */
.vertex-table td {
  padding: 10px 16px;    /* 10px vertical — múltiplo de 4 com conforto */
  height: 48px;          /* altura fixa — alinha o eye ao escanear verticalmente */
}
.vertex-table th {
  padding: 8px 16px;
  height: 36px;
}
```

### A regra do interno > externo

O padding interno de um componente deve **sempre** ser maior que o gap entre componentes adjacentes. Quando é o contrário (como observado nos cards), o cérebro não sabe onde um elemento termina e o outro começa.

```
✅ CORRETO:  padding interno = 16px  |  gap externo = 8px
❌ OBSERVADO: padding interno ≈ 8px  |  gap externo ≈ 4px
```

---

## 3. Sistema de Formas (Shape System)

Adaptado diretamente do WWDC 2025 — "Get to Know the New Design System".

### Os três tipos de forma

| Tipo | Definição | Quando usar no GerenciGeo |
|---|---|---|
| **Fixed** | `border-radius` constante | Cards, painéis, modais |
| **Capsule** | `border-radius = height / 2` | Badges de status, chips de filtro, botões primários standalone |
| **Concentric** | `border-radius = parent_radius - padding` | Elementos dentro de cards (ícones, thumbnails) |

### A Regra Concêntrica

Quando um elemento filho está dentro de um container pai, o `border-radius` do filho deve ser calculado, não estimado:

```
radius_filho = radius_pai - margem_interna
```

**Exemplo prático — cards do Workspace:**
```css
.workspace-card {
  border-radius: 10px;   /* pai */
  padding: 12px;
}

/* Elemento filho dentro do card (ex: badge de categoria) */
.workspace-card .category-badge {
  /* ❌ Estimado: border-radius: 4px — parece "colado" ou "solto" */
  /* ✅ Concêntrico: 10 - 12 = -2 → usa fallback mínimo */
  border-radius: max(4px, calc(10px - 12px + 4px));
  /* Na prática: badge pequeno dentro de card → capsule (height/2) */
}
```

**Atenção:** o WWDC 2025 deixa explícito que o erro mais comum é cantos que parecem "pinçados" (`pinched`) ou "alargados" (`flared`) em relação ao container. Se algo parece errado visualmente, é quase sempre um problema de concentricidade.

### Tokens de forma para o GerenciGeo

```css
:root {
  /* Fixed — superfícies grandes */
  --radius-panel: 12px;      /* cards do workspace, painéis */
  --radius-card: 10px;       /* cards de arquivo individual */
  --radius-modal: 14px;      /* modais, drawers */

  /* Fixed — componentes médios */
  --radius-input: 8px;       /* campos de texto, search */
  --radius-button-sm: 6px;   /* botões secundários pequenos */

  /* Capsule — automático */
  --radius-badge: 9999px;    /* badges de status (BRUTO, CORRIGIDO) */
  --radius-filter-chip: 9999px;  /* chips de filtro rápido */
  --radius-button-lg: 9999px;    /* botões primários de ação */
}
```

---

## 4. Sistema de Cores

### O problema atual

O sistema atual usa cor como **decoração** — cada categoria tem uma cor diferente para ser visualmente distinta. O resultado é que tudo chama atenção ao mesmo tempo e nada é prioridade.

A Apple usa cores como **sinal semântico** — cada cor carrega um significado funcional específico:

### Paleta semântica proposta para dark mode

```css
:root {
  /* ── Superfícies ─────────────────────────────────── */
  --bg-base:        #0A0A0C;   /* fundo da aplicação */
  --bg-surface:     #141416;   /* painéis, sidebars */
  --bg-elevated:    #1C1C1E;   /* cards, modais (= systemGray6 dark) */
  --bg-overlay:     #2C2C2E;   /* hover states, seleção em tabela */

  /* ── Bordas ──────────────────────────────────────── */
  --border-subtle:  rgba(255,255,255,0.06);  /* separadores, cards */
  --border-default: rgba(255,255,255,0.10);  /* inputs, painéis */
  --border-strong:  rgba(255,255,255,0.18);  /* elemento com foco */

  /* ── Texto ───────────────────────────────────────── */
  --text-primary:   rgba(255,255,255,0.92);  /* dado principal, títulos */
  --text-secondary: rgba(255,255,255,0.55);  /* labels de coluna, metadata */
  --text-tertiary:  rgba(255,255,255,0.30);  /* placeholder, desativado */

  /* ── Acento único (verde do sistema) ─────────────── */
  --accent:         #30D158;   /* ação primária, seleção ativa — systemGreen */
  --accent-subtle:  rgba(48,209,88,0.12);   /* fundo de chip ativo */

  /* ── Semântico — status de vértice ──────────────── */
  --status-raw:     #FF9F0A;   /* BRUTO — laranja systemOrange */
  --status-raw-bg:  rgba(255,159,10,0.12);
  --status-ok:      #30D158;   /* CORRIGIDO — verde */
  --status-ok-bg:   rgba(48,209,88,0.12);
  --status-error:   #FF453A;   /* ERRO — vermelho systemRed */
  --status-error-bg:rgba(255,69,58,0.12);

  /* ── Dados numéricos destacados ─────────────────── */
  --data-highlight: #64D2FF;   /* coordenadas corrigidas — systemCyan */
  /* (já usado no sistema atual — manter, é a melhor escolha) */
}
```

### Regra de uma cor primária

> *"Avoid using the same color to indicate different things."* — Apple HIG

**O GerenciGeo deve ter exatamente 1 cor de acento.** As cinco categorias do Workspace (Brutos, Rinex, Pós-Processados, Exportações, Documentos) **não precisam de cores diferentes** — elas já têm numeração sequencial (1-5) e nomes. Usar cor diferente para cada uma cria competição visual sem adicionar informação.

```css
/* ❌ Atual: cada categoria tem sua cor */
.brutos   { border-color: #F5A623; }
.rinex    { border-color: #9B59B6; }
.pos-proc { border-color: #3B82F6; }
/* etc. */

/* ✅ Proposto: diferenciação por número + ícone, cor neutra */
.workspace-card {
  border: 0.5px solid var(--border-subtle);
  background: var(--bg-elevated);
}
/* Apenas o card ativo/com arquivo recebe destaque */
.workspace-card.has-file {
  border-color: var(--border-default);
}
.workspace-card.has-file .card-number {
  color: var(--accent);  /* só o número fica verde — economia de sinal */
}
```

### Hierarquia de cor por prioridade de leitura

| Prioridade | Elemento | Cor |
|---|---|---|
| 1 — Crítico | Status de erro, alerta de qualidade | `--status-error` (#FF453A) |
| 2 — Ação primária | Botão principal (Download, Testar HGO) | `--accent` (#30D158) |
| 3 — Dado chave | Coordenadas corrigidas (Norte/Este CORR) | `--data-highlight` (#64D2FF) |
| 4 — Dado bruto | Coordenadas brutas | `--text-primary` (branco 92%) |
| 5 — Metadata | Labels, subtítulos, timestamps | `--text-secondary` (branco 55%) |
| 6 — Ruído | Separadores, bordas | `--border-subtle` (branco 6%) |

---

## 5. Tipografia

### Escala proposta (sistema desktop, tamanho base 14px)

Em um sistema de dados geodésicos, a clareza de números é prioridade sobre expressividade tipográfica. Use **uma única família** com variações de peso e tamanho.

```css
/* Família recomendada: Inter (substituto de SF Pro para web/Electron) */
/* Alternativa: Segoe UI Variable (nativa no Windows 11) */

:root {
  --font-sans: 'Inter', 'Segoe UI', 'Tahoma', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
}

/* ── Escala de tamanhos ──────────────────────────── */
.text-xs    { font-size: 11px; line-height: 16px; }  /* timestamps, metadata */
.text-sm    { font-size: 12px; line-height: 18px; }  /* labels de coluna, badges */
.text-base  { font-size: 14px; line-height: 20px; }  /* corpo, nomes de arquivo */
.text-md    { font-size: 16px; line-height: 24px; }  /* subtítulo de seção */
.text-lg    { font-size: 18px; line-height: 28px; }  /* título de painel */
.text-xl    { font-size: 22px; line-height: 32px; }  /* nome do projeto (Xambre) */

/* ── Pesos ───────────────────────────────────────── */
/* Regular (400)   → dados numéricos brutos, corpo */
/* Medium (500)    → labels de coluna, nomes de arquivo */
/* SemiBold (600)  → título de seção, nome do vértice */
/* Bold (700)      → nome do projeto, título principal */
```

### Dados numéricos — fonte monoespaçada obrigatória

Coordenadas UTM têm 10+ dígitos. Com fonte proporcional, colunas não alinham e a leitura se torna comparação de caracteres, não de números. **Todos os valores numéricos geodésicos devem usar fonte monoespaçada.**

```css
/* Células de coordenada na tabela */
.coord-value {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;  /* alinha dígitos verticalmente */
  letter-spacing: 0.01em;
}
```

### Hierarquia na tabela de vértices

```
NOME DO VÉRTICE  → SemiBold, 14px, --text-primary
Subtexto (sessão) → Regular, 11px, --text-tertiary, truncado
TIPO (P/B/etc)   → Medium, 12px, --text-secondary, centered
COORD BRUTA      → Mono Regular, 12px, --text-primary, tabular-nums
COORD CORRIGIDA  → Mono SemiBold, 12px, --data-highlight, tabular-nums
ΔN / ΔE / ΔH    → Mono Regular, 12px, --text-secondary (se 0)
                   Mono SemiBold, 12px, --status-error (se > threshold)
STATUS badge     → SemiBold, 11px, capsule, --status-raw ou --status-ok
```

---

## 6. Hierarquia Visual e Prioridade de Atenção

### O mapa de atenção atual vs. proposto

O sistema tem um problema crítico de hierarquia de atenção: o **badge de status "BRUTO"** (laranja preenchido) é o elemento que mais chama atenção na tabela, mas o que o usuário precisa ver primeiro é o **nome do vértice** e se as **coordenadas corrigidas existem**.

```
ATUAL (ordem de peso visual percebido):
  1º. Badge "BRUTO" (laranja preenchido) ← errado
  2º. Coordenadas corrigidas em ciano
  3º. Nome do vértice
  4º. Subtexto da sessão (verde brilhante, mesmo peso que o nome)

PROPOSTO (ordem de peso visual):
  1º. Nome do vértice (SemiBold 14px, branco 92%)
  2º. Coordenadas corrigidas (ciano, mono SemiBold)
  3º. ΔN/ΔE/ΔH quando fora do threshold (vermelho — só aparece quando há problema)
  4º. Badge status (outline, não filled — presente mas não grita)
```

### Badges de status — outline vs. filled

```css
/* ❌ Filled badge: toma muito peso visual */
.badge-bruto-old {
  background: #F5A623;
  color: #000;
  padding: 2px 8px;
  border-radius: 4px;
}

/* ✅ Outline badge: presente sem gritar */
.badge-bruto {
  background: var(--status-raw-bg);   /* rgba(255,159,10,0.12) */
  color: var(--status-raw);           /* #FF9F0A */
  border: 0.5px solid var(--status-raw);
  padding: 2px 8px;
  border-radius: 9999px;              /* capsule */
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
```

---

## 7. Componentes — Aplicações Práticas

### 7.1. Cards do Workspace GNSS

**Problema:** 5 cores diferentes, bordas coloridas, densidade alta.

**Antes (reconstrução do que foi observado):**
```css
.workspace-card {
  border-left: 3px solid <cor-da-categoria>;
  background: #1a1a1a;
  padding: 8px;
  border-radius: 4px;
}
```

**Depois:**
```css
.workspace-card {
  background: var(--bg-elevated);            /* #1C1C1E */
  border: 0.5px solid var(--border-subtle);  /* branco 6% */
  border-radius: var(--radius-card);         /* 10px */
  padding: 12px 16px;                        /* interno generoso */
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Número sequencial — única cor de acento */
.workspace-card__number {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);          /* verde — único elemento colorido */
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* Título da categoria */
.workspace-card__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Subtítulo descritivo */
.workspace-card__subtitle {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: -4px;
}

/* Arquivo listado dentro do card */
.workspace-card__file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--bg-overlay);      /* levemente mais claro — concêntrico */
  border-radius: calc(var(--radius-card) - 4px);  /* 10 - 4 = 6px — concêntrico */
  gap: 8px;
}

.workspace-card__file-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.workspace-card__file-meta {
  font-size: 11px;
  color: var(--text-tertiary);
}
```

### 7.2. Tabela de Vértices Geodésicos

**Problema principal:** 12 colunas num espaço estreito, sem diferenciação entre dado bruto e corrigido.

**Proposta de reorganização de colunas:**

```
Prioridade 1 — sempre visíveis (nunca esconder):
  SEQ | VÉRTICE | TIPO | STATUS

Prioridade 2 — dados principais (visíveis no layout padrão):
  NORTE CORR | ESTE CORR | ΔN | ΔE

Prioridade 3 — dados auxiliares (colapsar ou tab separado):
  NORTE BRUTO | ESTE BRUTO | ΔH | POLÍG
```

```css
/* Cabeçalho da tabela */
.vertex-table thead th {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);     /* recua — não compete com dados */
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 8px 16px;
  background: var(--bg-surface);
  border-bottom: 0.5px solid var(--border-subtle);
  white-space: nowrap;
}

/* Linha de dado */
.vertex-table tbody tr {
  border-bottom: 0.5px solid var(--border-subtle);
  transition: background 150ms ease;
}

.vertex-table tbody tr:hover {
  background: var(--bg-overlay);
}

/* Célula padrão */
.vertex-table tbody td {
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text-primary);
  vertical-align: middle;
  height: 48px;
}

/* Nome do vértice — elemento mais importante */
.cell-vertex-name {
  font-weight: 600;
  font-size: 14px;
}

.cell-vertex-session {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Coordenadas brutas */
.cell-coord-raw {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);   /* recuado — bruto é menos importante */
}

/* Coordenadas corrigidas — destaque */
.cell-coord-corrected {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--data-highlight);   /* ciano — dado principal */
}

/* Delta — neutro quando zero, vermelho quando excede threshold */
.cell-delta {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);    /* zero = ruído, não chama atenção */
}

.cell-delta.exceeds-threshold {
  color: var(--status-error);
  font-weight: 600;
}
```

### 7.3. Botões de Ação da Barra

**Problema:** Todos os botões têm peso visual parecido — difícil identificar hierarquia.

A Apple define 3 níveis de botão:

```css
/* ── Nível 1: Ação Primária (máximo 1 por tela) ─── */
.btn-primary {
  background: var(--accent);          /* #30D158 */
  color: #000;
  font-weight: 600;
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 9999px;              /* capsule */
  border: none;
  cursor: pointer;
}

/* ── Nível 2: Ação Secundária ────────────────────── */
.btn-secondary {
  background: var(--bg-overlay);
  color: var(--text-primary);
  font-weight: 500;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 0.5px solid var(--border-default);
}

/* ── Nível 3: Ação Destrutiva ────────────────────── */
.btn-destructive {
  background: rgba(255,69,58,0.10);
  color: var(--status-error);
  font-weight: 500;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 0.5px solid rgba(255,69,58,0.25);
}

/* ── Nível 4: Ação Ghost (mínimo peso visual) ────── */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
}
.btn-ghost:hover {
  background: var(--bg-overlay);
  color: var(--text-primary);
}
```

**Mapeamento dos botões atuais:**

| Botão atual | Nível correto | Justificativa |
|---|---|---|
| "Baixar RINEX .ZIP" | `btn-primary` | Ação mais frequente nesta tela |
| "Testar Busca HGO" | `btn-secondary` | Ação importante mas não a principal |
| "Atualizar Lista" | `btn-ghost` | Ação de suporte — não deve competir |
| "Exportar" | `btn-secondary` | Ação frequente |
| "KML" | `btn-secondary` | |
| "Reordenar pontos" | `btn-ghost` | Ação rara — deve recuar |
| "Arquivar" | `btn-destructive` | Ação irreversível — sinalização clara |
| "Base manual" | `btn-ghost` com cor amarela | Já diferenciado — manter o padrão de warning |

### 7.4. Chips de Filtro Rápido

```css
/* Container dos filtros */
.filter-bar {
  display: flex;
  gap: 6px;
  align-items: center;
}

/* Chip inativo */
.filter-chip {
  padding: 4px 10px;
  border-radius: 9999px;          /* capsule */
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 0.5px solid var(--border-subtle);
  cursor: pointer;
  transition: all 120ms ease;
  white-space: nowrap;
}

/* Chip ativo */
.filter-chip.active {
  background: var(--accent-subtle);  /* rgba(48,209,88,0.12) */
  color: var(--accent);
  border-color: rgba(48,209,88,0.30);
}

/* Contador dentro do chip */
.filter-chip__count {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
```

### 7.5. Cabeçalho da Página (Navbar)

```css
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 52px;                          /* altura fixa — consistência */
  background: var(--bg-surface);
  border-bottom: 0.5px solid var(--border-subtle);
}

/* Bloco de título à esquerda */
.page-header__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

/* Badge de status do projeto (EN_ANDAMENTO) */
.project-status-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 9999px;
  background: rgba(255,159,10,0.12);
  color: #FF9F0A;
  border: 0.5px solid rgba(255,159,10,0.30);
  margin-left: 8px;
  vertical-align: middle;
}

/* Metadados do projeto (cliente, CAR) */
.page-header__meta {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* Tabs de navegação à direita */
.page-header__tabs {
  display: flex;
  gap: 4px;
}

.nav-tab {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 8px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
}

.nav-tab.active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-weight: 600;
}

/* Ícone antes do texto no tab */
.nav-tab .tab-icon {
  opacity: 0.6;
  margin-right: 6px;
  font-size: 14px;
}

.nav-tab.active .tab-icon {
  opacity: 1;
  color: var(--accent);
}
```

---

## 8. Seção de Contexto: O Que Não Mudar

Alguns padrões do sistema atual estão **corretos** e não devem ser alterados:

| Elemento | Por que está certo |
|---|---|
| Coordenadas corrigidas em ciano (`#64D2FF`) | Diferenciação clara entre bruto e corrigido — intuitivo |
| Ícone de refresh nos nomes de vértice | Acesso rápido a uma ação contextual — padrão iOS/macOS |
| Checkbox na coluna POLÍG | Ação em linha — padrão consolidado para dados tabulares |
| Filtros rápidos no topo da tabela | Reduz carga cognitiva — usuário não precisa abrir menu |
| Dark mode como padrão | Correto para uso prolongado com mapas — reduz fadiga |
| Separação por pipeline (Brutos→Rinex→Pós-Proc→Exportações) | Estrutura clara que reflete o fluxo real de trabalho |

---

## 9. Checklist de Revisão de Interface

Use esta lista ao implementar novas telas ou revisar existentes:

### Espaçamento
- [ ] Todo padding/margin é múltiplo de 4px?
- [ ] Padding interno de componentes > gap externo entre componentes?
- [ ] Tabelas têm altura de célula mínima de 44px?

### Formas
- [ ] Elementos dentro de cards têm `border-radius` concêntrico (pai - padding)?
- [ ] Badges e chips usam capsule (`border-radius: 9999px`)?
- [ ] Nenhum `border-radius` foi estimado visualmente sem base na escala?

### Cores
- [ ] Existe no máximo 1 cor de acento por tela?
- [ ] Cores de status (erro/ok/warning) são usadas apenas para sinalizar estado — não decoração?
- [ ] Elementos de prioridade menor usam versão com menor opacidade da mesma cor?

### Tipografia
- [ ] Dados numéricos (coordenadas, deltas) usam fonte monoespaçada?
- [ ] `font-variant-numeric: tabular-nums` está ativo nas colunas de coordenada?
- [ ] Headers de coluna são claramente mais fracos (cor, peso) que os dados?

### Hierarquia
- [ ] O elemento mais importante da tela tem o maior peso visual?
- [ ] Status badges são outline (não filled) para não competir com o conteúdo?
- [ ] Botões destrutivos (arquivar, deletar) têm sinalização visual distinta dos secundários?

---

## 10. Referências

- Apple Human Interface Guidelines — [developer.apple.com/design/human-interface-guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- WWDC 2025 Session 356 — "What's New in Design" (Liquid Glass, Shape System)
- WWDC 2020 Session 10175 — "The Details of UI Typography"
- Apple UI Design Do's and Don'ts — [developer.apple.com/design/tips](https://developer.apple.com/design/tips/)
