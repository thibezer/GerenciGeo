# Guia de Arquitetura de Componentes UI — GerenciGeo

> **Objetivo deste documento:** qualquer pessoa (incluindo você mesmo, daqui a 6 meses) deve conseguir criar, encontrar ou entender um componente de UI sem precisar adivinhar "como isso funciona mesmo?" ou repetir um erro já resolvido antes.

**Última atualização:** 28/07/2026
**Aplica-se a:** frontend do GerenciGeo (TypeScript + Vite, rodando dentro do pywebview)

> ⚠️ **Premissa assumida:** este guia parte do princípio de que o frontend é uma SPA — o Vite builda um bundle único que o pywebview carrega, e as "páginas" são módulos TypeScript que trocam o conteúdo de um container, sem reload de HTML. Se na prática o GerenciGeo serve HTML separado por rota (multi-página), a Seção 10 (Integração com Páginas) precisa ser ajustada — o resto do documento (componentes, tokens, convenções) continua valendo do mesmo jeito.

---

## Sumário

1. [Contexto e Premissa](#1-contexto-e-premissa)
2. [Princípios Fundamentais](#2-princípios-fundamentais)
3. [Estrutura de Pastas](#3-estrutura-de-pastas)
4. [Anatomia de um Componente](#4-anatomia-de-um-componente)
5. [Convenções de Nomenclatura](#5-convenções-de-nomenclatura)
6. [Design Tokens e CSS](#6-design-tokens-e-css)
7. [Comunicação Entre Componentes](#7-comunicação-entre-componentes)
8. [Passo a Passo: Criando um Componente Novo](#8-passo-a-passo-criando-um-componente-novo)
9. [Exemplo Completo: gg-botao-primario](#9-exemplo-completo-gg-botao-primario)
10. [Integração com Páginas](#10-integração-com-páginas)
11. [Componentes que Envolvem Bibliotecas Externas](#11-componentes-que-envolvem-bibliotecas-externas)
12. [Anti-Padrões — O Que Nunca Fazer](#12-anti-padrões--o-que-nunca-fazer)
13. [Checklist de Definition of Done](#13-checklist-de-definition-of-done)
14. [UI Kit Interno (/dev/ui-kit)](#14-ui-kit-interno-devui-kit)
15. [Migração de Componentes Antigos](#15-migração-de-componentes-antigos)
16. [FAQ](#16-faq)
17. [Glossário](#17-glossário)

---

## 1. Contexto e Problema

O GerenciGeo cresceu organicamente e hoje tem componentes de UI (listas flutuantes, modais, botões, formulários) espalhados pelo código sem um padrão único de onde vivem, como são estilizados e como se comunicam com o resto da aplicação. Isso gera:

- Retrabalho: o mesmo "botão" ou "lista" reimplementado de formas ligeiramente diferentes em páginas diferentes.
- Sistemas de design token concorrentes (cores e medidas hardcoded convivendo com variáveis CSS).
- Dificuldade de saber, ao abrir uma tela nova, "o que já existe pronto pra eu reaproveitar".

Este guia define **um único jeito certo** de criar e organizar componentes daqui pra frente.

---

## 2. Princípios Fundamentais

### 2.1. Colocação (Co-location), não separação por tipo de arquivo

O erro mais comum ao organizar frontend é separar por **tipo técnico** (todo HTML numa pasta, todo CSS em outra, todo JS em outra). Isso parece organizado, mas na prática espalha cada componente em 3 lugares diferentes do projeto.

A regra aqui é: **tudo que pertence a um componente mora na mesma pasta.**

```
❌ ERRADO (separado por tipo)          ✅ CERTO (separado por componente)
/css/components/flutuante.css          /components/lista-flutuante/
/js/components/flutuante.js              ├── lista-flutuante.ts
/views/components/lista-flutuante.html   └── lista-flutuante.css
```

Se você precisa editar a lista flutuante, você abre **uma pasta**. Não três.

### 2.2. Single Responsibility Principle (SRP), por arquivo

Dentro da pasta do componente, cada arquivo ainda tem uma responsabilidade só:

| Arquivo | Responsabilidade | Nunca contém |
|---|---|---|
| `*.ts` | Estrutura (template) + comportamento (eventos, estado, ciclo de vida) | Cores, medidas, decisões visuais |
| `*.css` | Aparência (cores, espaçamento, tipografia, transições) | Lógica, manipulação de dados, fetch |

### 2.3. Isolamento

Um componente não deve depender de saber em qual página está, nem vazar estilo/comportamento pra fora dele. Ele recebe dados por **atributos/propriedades**, informa o que aconteceu por **eventos customizados**, e ponto.

### 2.4. Tokens como única fonte de verdade visual

Nenhum componente decide sozinho "essa cor é `#0066cc`". Toda decisão visual vem do arquivo central de design tokens (`geogeo-design-engine.css`). Componente consome token, nunca inventa valor.

### 2.5. Composição sobre duplicação

Um componente novo, sempre que possível, é composto a partir dos componentes que já existem (um `gg-modal` usa `gg-botao-primario` dentro dele), em vez de reescrever um botão específico pra aquele modal.

---

## 3. Estrutura de Pastas

```
/gerencigeo-frontend
│
├── /src
│   ├── /components                 # Todo componente reutilizável vive aqui
│   │   ├── /gg-botao-primario
│   │   │   ├── gg-botao-primario.ts
│   │   │   └── gg-botao-primario.css
│   │   ├── /gg-lista-flutuante
│   │   │   ├── gg-lista-flutuante.ts
│   │   │   └── gg-lista-flutuante.css
│   │   ├── /gg-input-texto
│   │   │   ├── gg-input-texto.ts
│   │   │   └── gg-input-texto.css
│   │   └── /gg-dialogo
│   │       ├── gg-dialogo.ts
│   │       └── gg-dialogo.css
│   │
│   ├── /pages                      # Telas reais da aplicação (compõem componentes)
│   │   ├── dashboard.ts
│   │   ├── relatorios.ts
│   │   └── mesa-de-trabalho.ts
│   │
│   ├── /styles
│   │   ├── geogeo-design-engine.css   # Tokens + regras globais (já existe)
│   │   └── reset.css
│   │
│   ├── main.ts                     # Ponto de entrada — registra componentes globais, roteamento simples
│   └── vite-env.d.ts
│
├── /dev-tools
│   └── ui-kit.ts                   # Página interna de documentação viva (Seção 14)
│
└── index.html                      # Único HTML real, carregado pelo pywebview
```

**Regra prática:** se um dia você se perguntar "onde eu boto esse arquivo?", a resposta é sempre uma destas duas:
- É reutilizável em mais de um lugar (ou pode vir a ser) → `/components`.
- É específico de uma tela → `/pages`.

Nunca uma terceira opção "solto na raiz de `/src`".

---

## 4. Anatomia de um Componente

Cada componente é um **Web Component nativo** (Custom Element), não uma função solta que faz `innerHTML` numa div qualquer. Isso é importante por três motivos práticos pro GerenciGeo:

1. **Uso vira uma tag HTML declarativa** — `<gg-lista-flutuante></gg-lista-flutuante>` — em vez de chamar uma função de montagem manualmente em cada tela nova.
2. **Isolamento real de CSS** (via Shadow DOM, quando aplicável) — resolve de raiz o problema de "sistemas de design token concorrentes": o CSS de um componente fisicamente não pode vazar pra outro.
3. **Ciclo de vida padronizado** (`connectedCallback` / `disconnectedCallback`) — resolve vazamento de listeners e, no caso de componentes com bibliotecas externas (mapas, gráficos), garante que recursos são liberados corretamente quando o componente sai da tela.

### 4.1. Shadow DOM vs Light DOM — quando usar cada um

| Critério | Shadow DOM | Light DOM |
|---|---|---|
| Precisa de isolamento total de CSS (overlays, modais, elementos flutuantes) | ✅ Use | — |
| Precisa herdar tipografia/estilo de um contêiner pai dinâmico (ex: área de conteúdo rico) | — | ✅ Use |
| Componente simples, sem risco real de colisão de classe | Pode usar, é o padrão default | Aceitável |
| Precisa ser inspecionado/estilizado por CSS externo em casos excepcionais | — | ✅ Use |

**Padrão do projeto: use Shadow DOM por padrão.** Só evite quando houver uma razão concreta (ex: um componente de texto rico que precisa herdar tipografia do contexto onde está inserido).

> Importante: **CSS custom properties (variáveis) atravessam a fronteira do Shadow DOM.** Ou seja, os tokens definidos em `geogeo-design-engine.css` no `:root` continuam acessíveis dentro de qualquer Shadow DOM via `var(--gg-cor-primaria)`. Isolamento de CSS não significa perder acesso aos tokens.

---

## 5. Convenções de Nomenclatura

### 5.1. Prefixo `gg-`

Todo custom element usa o prefixo `gg-` (GerenciGeo). Isso é **obrigatório** pela própria spec de Custom Elements (tag precisa ter hífen), e evita colisão com futuras tags nativas do HTML.

```
gg-botao-primario
gg-lista-flutuante
gg-input-texto
gg-dialogo
gg-mapa-leaflet
```

### 5.2. Nome do arquivo = nome da tag = nome da pasta

Sempre os três iguais, em kebab-case:

```
/components/gg-botao-primario/gg-botao-primario.ts
/components/gg-botao-primario/gg-botao-primario.css
<gg-botao-primario></gg-botao-primario>
```

Zero ambiguidade sobre onde encontrar o código de uma tag que você vê na tela.

### 5.3. Classes CSS internas: BEM

Dentro do CSS de cada componente, use BEM (Block-Element-Modifier) com o nome do componente como bloco:

```css
.gg-lista-flutuante { }                  /* Block */
.gg-lista-flutuante__item { }            /* Element */
.gg-lista-flutuante--aberta { }          /* Modifier */
.gg-lista-flutuante__item--selecionado { }
```

Como cada componente normalmente vive dentro do seu próprio Shadow DOM, colisão de nome com outro componente já não é fisicamente possível — mas o BEM continua valendo pra deixar o CSS legível e explícito sobre a que elemento cada regra se aplica.

### 5.4. Eventos customizados

Nome do evento = `gg-` + verbo ou substantivo que descreve o que aconteceu, sempre em português, minúsculo, kebab-case:

```
gg-selecionar
gg-fechar
gg-alterar-valor
gg-confirmar
```

### 5.5. Atributos HTML vs Propriedades JS

| Tipo de dado | Como expor |
|---|---|
| String, número, boolean simples (`variante="destaque"`, `disabled`) | **Atributo HTML** |
| Objeto, array, dado complexo (`itens: Item[]`) | **Propriedade JS** (getter/setter) |

```ts
// Atributo — usado direto no HTML: <gg-input-texto placeholder="Nome">
static get observedAttributes() { return ['placeholder', 'disabled']; }

// Propriedade — usado via JS: elemento.itens = listaDeItens
set itens(value: Item[]) {
  this._itens = value;
  this.render();
}
get itens() {
  return this._itens;
}
```

---

## 6. Design Tokens e CSS

### 6.1. Uma única fonte de verdade

`geogeo-design-engine.css` continua sendo o arquivo central de tokens (cores, espaçamentos, raios de borda, tipografia), carregado **uma vez** globalmente em `main.ts` ou no `index.html` — nunca importado dentro de um componente individual.

```css
/* geogeo-design-engine.css (trecho ilustrativo) */
:root {
  --gg-cor-primaria: #0066cc;
  --gg-cor-texto-sobre-primaria: #ffffff;
  --gg-espaco-xs: 4px;
  --gg-espaco-sm: 8px;
  --gg-espaco-md: 16px;
  --gg-espaco-lg: 24px;
  --gg-raio-borda: 4px;
  --gg-fonte-base: 'Inter', sans-serif;
}
```

### 6.2. Regra de ouro

> **Um componente nunca escreve um valor de cor, espaçamento ou fonte diretamente. Ele sempre consome `var(--gg-*)`.**

```css
/* ❌ ERRADO */
.gg-botao-primario {
  background: #0066cc;
  padding: 8px 16px;
}

/* ✅ CERTO */
.gg-botao-primario {
  background: var(--gg-cor-primaria);
  padding: var(--gg-espaco-sm) var(--gg-espaco-md);
}
```

Se o valor que você precisa não existe como token ainda, a ação correta é **adicionar o token em `geogeo-design-engine.css`**, não criar um valor solto no componente. Isso é o que evita o problema de "sistemas de design concorrentes".

### 6.3. Como o CSS entra no componente (Vite)

Para componentes com Shadow DOM, o CSS precisa ser injetado como string dentro de uma tag `<style>` no template. O Vite tem suporte nativo pra isso via sufixo `?inline`:

```ts
import estilos from './gg-botao-primario.css?inline';
```

Isso importa o conteúdo do CSS como uma string TypeScript, em vez de injetar automaticamente um `<link>` global — essencial pra Shadow DOM, já que o CSS precisa estar *dentro* da fronteira do shadow root.

> **Nota de configuração:** garanta que `vite-env.d.ts` tenha `/// <reference types="vite/client" />` no topo — é isso que dá ao TypeScript o tipo correto pra imports com `?inline`, `?raw`, etc. Sem essa referência o TS acusa erro de tipo nesses imports.

Para componentes em **Light DOM** (sem Shadow DOM), o CSS pode ser importado normalmente (`import './arquivo.css'`), e o Vite injeta um `<style>` global — nesse caso o isolamento depende só da disciplina do BEM.

### 6.4. Build final

Você **não precisa** manter um `main.css` centralizando `@import` manualmente. Isso é uma técnica de projetos sem bundler. Com Vite, cada componente já importa o próprio CSS, e o bundler resolve tudo em um (ou poucos) arquivos finais no build de produção — incluindo tree-shaking automático de CSS de componente que não é usado.

---

## 7. Comunicação Entre Componentes

### 7.1. De dentro pra fora: eventos customizados

Um componente nunca chama uma função da página diretamente. Ele dispara um evento, e quem estiver ouvindo decide o que fazer:

```ts
interface GGSelecionarDetail {
  id: string;
  valor: string;
}

this.dispatchEvent(
  new CustomEvent<GGSelecionarDetail>('gg-selecionar', {
    detail: { id: '123', valor: 'Lote 42' },
    bubbles: true,
    composed: true, // obrigatório para o evento atravessar a fronteira do Shadow DOM
  })
);
```

`composed: true` é essencial: sem ele, um evento disparado dentro de um Shadow DOM não é visível para quem está ouvindo fora dele.

### 7.2. De fora pra dentro: atributos e propriedades

A página passa dados pro componente via atributo (dados simples) ou propriedade (dados complexos) — nunca manipulando o DOM interno do componente diretamente (ex: nunca fazer `componente.shadowRoot.querySelector(...)` de fora).

### 7.3. Estado compartilhado entre vários componentes

Se dois componentes não relacionados por hierarquia precisam saber da mesma informação (ex: usuário logado, tema ativo), evite variável global solta. Prefira um módulo pequeno de "store" com um padrão observável simples:

```ts
// src/store/sessao.ts
type Listener = () => void;
const listeners = new Set<Listener>();
let usuarioAtual: string | null = null;

export const sessaoStore = {
  get usuario() { return usuarioAtual; },
  set(usuario: string | null) {
    usuarioAtual = usuario;
    listeners.forEach((fn) => fn());
  },
  onChange(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
```

Isso é suficiente para o porte do GerenciGeo — não é necessário adotar uma lib de estado (Redux, Zustand etc.) só para isso.

---

## 8. Passo a Passo: Criando um Componente Novo

1. **Pergunte-se:** esse elemento já existe em outra tela, ainda que ligeiramente diferente? Se sim, generalize o existente em vez de criar um novo.
2. Crie a pasta: `/src/components/gg-nome-do-componente/`.
3. Crie `gg-nome-do-componente.css` — só tokens (`var(--gg-*)`), nunca valor solto.
4. Crie `gg-nome-do-componente.ts`:
   - Defina `observedAttributes` para os dados simples.
   - Defina getters/setters para dados complexos.
   - Implemente `connectedCallback` (montagem, listeners) e `disconnectedCallback` (limpeza).
   - Registre com `customElements.define('gg-nome-do-componente', Classe)`.
5. Rode o componente isoladamente na página do **UI Kit** (`/dev/ui-kit`, Seção 14) antes de usá-lo em qualquer tela real.
6. Documente no UI Kit: variante, modificadores disponíveis, regras de uso.
7. Marque os itens do [Checklist de Definition of Done](#13-checklist-de-definition-of-done).
8. Só então importe e use na página real.

---

## 9. Exemplo Completo: `gg-botao-primario`

### `gg-botao-primario.css`

```css
:host {
  display: inline-block;
}

.gg-botao-primario {
  background: var(--gg-cor-primaria);
  color: var(--gg-cor-texto-sobre-primaria);
  padding: var(--gg-espaco-sm) var(--gg-espaco-md);
  border: none;
  border-radius: var(--gg-raio-borda);
  font-family: var(--gg-fonte-base);
  font-size: 14px;
  cursor: pointer;
  transition: filter 0.15s ease;
}

.gg-botao-primario:hover {
  filter: brightness(1.1);
}

.gg-botao-primario:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gg-botao-primario--destaque {
  background: var(--gg-cor-destaque, var(--gg-cor-primaria));
}
```

### `gg-botao-primario.ts`

```ts
import estilos from './gg-botao-primario.css?inline';

export class GGBotaoPrimario extends HTMLElement {
  static get observedAttributes() {
    return ['disabled', 'variante'];
  }

  private button: HTMLButtonElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${estilos}</style>
      <button class="gg-botao-primario">
        <slot></slot>
      </button>
    `;
    this.button = shadow.querySelector('button')!;
  }

  connectedCallback() {
    this.button.addEventListener('click', this.handleClick);
    this.syncVariante();
  }

  disconnectedCallback() {
    this.button.removeEventListener('click', this.handleClick);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === 'disabled') {
      this.button.disabled = value !== null;
    }
    if (name === 'variante') {
      this.syncVariante();
    }
  }

  private syncVariante() {
    const variante = this.getAttribute('variante');
    this.button.className = variante
      ? `gg-botao-primario gg-botao-primario--${variante}`
      : 'gg-botao-primario';
  }

  private handleClick = () => {
    if (this.hasAttribute('disabled')) return;
    this.dispatchEvent(new CustomEvent('gg-click', { bubbles: true, composed: true }));
  };
}

customElements.define('gg-botao-primario', GGBotaoPrimario);
```

### Uso

```html
<gg-botao-primario variante="destaque">Salvar</gg-botao-primario>
```

```ts
import './components/gg-botao-primario/gg-botao-primario.ts';

document
  .querySelector('gg-botao-primario')!
  .addEventListener('gg-click', () => salvarDados());
```

---

## 10. Integração com Páginas

Uma "página" (`/src/pages/dashboard.ts`) é o módulo que:

1. Importa os componentes que precisa (import de efeito colateral registra a tag automaticamente).
2. Monta o HTML da tela usando as tags dos componentes.
3. Escuta os eventos customizados disparados pelos componentes e decide o que fazer (chamar API do FastAPI, atualizar outro componente, etc.).

```ts
// src/pages/dashboard.ts
import '../components/gg-botao-primario/gg-botao-primario.ts';
import '../components/gg-lista-flutuante/gg-lista-flutuante.ts';

export function montarDashboard(container: HTMLElement) {
  container.innerHTML = `
    <gg-lista-flutuante id="lista-lotes"></gg-lista-flutuante>
    <gg-botao-primario variante="destaque">Novo Lote</gg-botao-primario>
  `;

  const lista = container.querySelector('#lista-lotes') as any;
  lista.itens = obterLotesDoBackend(); // propriedade JS, dado complexo

  container
    .querySelector('gg-botao-primario')!
    .addEventListener('gg-click', () => abrirFormularioNovoLote());
}
```

**Regra importante:** a página nunca acessa o `shadowRoot` de um componente diretamente. Toda interação passa por atributo, propriedade ou evento — nunca por `querySelector` dentro do shadow de outro componente.

---

## 11. Componentes que Envolvem Bibliotecas Externas

Alguns componentes (ex: um mapa Leaflet, um gráfico) inicializam uma biblioteca externa que precisa ser destruída explicitamente quando o componente sai da tela — senão o mapa/gráfico continua consumindo memória e listeners mesmo depois de removido do DOM.

```ts
export class GGMapaLeaflet extends HTMLElement {
  private mapa: L.Map | null = null;

  connectedCallback() {
    const container = document.createElement('div');
    this.shadowRoot!.appendChild(container);
    this.mapa = L.map(container).setView([-25.43, -49.27], 13);
  }

  disconnectedCallback() {
    // Sem isso, o mapa (e seus listeners internos) vaza memória a cada
    // vez que a tela é trocada.
    this.mapa?.remove();
    this.mapa = null;
  }
}
```

**Regra:** toda inicialização de biblioteca externa em `connectedCallback` tem um `disconnectedCallback` correspondente que a destrói. Sem exceção.

---

## 12. Anti-Padrões — O Que Nunca Fazer

| ❌ Nunca faça | ✅ Faça assim |
|---|---|
| Usar `alert()`, `confirm()`, `prompt()` nativos do navegador | Criar e usar `<gg-dialogo>` |
| Declarar cor/medida solta num CSS de componente | Usar `var(--gg-*)`; se o token não existe, adicioná-lo em `geogeo-design-engine.css` |
| Um componente chamando `fetch()`/API do FastAPI diretamente | Componente dispara evento; a **página** busca o dado e passa via atributo/propriedade |
| `document.querySelector('.classe-interna-do-componente')` de fora do componente | Usar a API pública do componente (atributos, propriedades, eventos) |
| Copiar e colar o HTML de um componente existente para "ajustar só um pouco" numa tela nova | Adicionar uma variante/modificador ao componente existente |
| Inicializar biblioteca externa sem destruir no `disconnectedCallback` | Sempre parear init/destroy |
| Criar HTML de componente direto na página, sem pasta em `/components` | Toda peça reutilizável nasce em `/components`, mesmo que hoje só tenha um uso |
| Misturar dois sistemas de tokens (um hardcoded, um em variável) na mesma tela | Um único sistema: `geogeo-design-engine.css` |

---

## 13. Checklist de Definition of Done

Antes de considerar um componente novo "pronto" para ser usado numa tela real:

- [ ] Pasta em `/src/components/gg-nome/` com `.ts` e `.css`.
- [ ] Tag, arquivo e pasta com o mesmo nome, em kebab-case, prefixo `gg-`.
- [ ] CSS usa apenas `var(--gg-*)`, zero valor hardcoded.
- [ ] Dados simples via atributo, dados complexos via propriedade.
- [ ] Eventos customizados com `composed: true` e nome no padrão `gg-verbo`.
- [ ] `connectedCallback` e `disconnectedCallback` implementados (mesmo que vazios), com limpeza de listeners/recursos externos.
- [ ] Testado isoladamente na página do UI Kit antes de ir para uma tela real.
- [ ] Documentado no UI Kit (visual, código de exemplo, modificadores, regras de uso).
- [ ] Verificado: existe algum componente parecido já no projeto que deveria ter sido generalizado em vez de duplicado?

---

## 14. UI Kit Interno (`/dev/ui-kit`)

Uma página interna, acessível só em ambiente de desenvolvimento, que renderiza todos os componentes vivos lado a lado.

### O que documentar por componente

| Campo | Conteúdo |
|---|---|
| **Visualização** | O componente renderizado de verdade, funcionando na tela |
| **Código de exemplo** | Bloco de código HTML pronto para copiar e colar |
| **Atributos/Propriedades** | Tabela com nome, tipo, valor padrão |
| **Modificadores** | Ex: "Use `variante='destaque'` para o botão de ação principal" |
| **Eventos** | Nome do evento e formato do `detail` |
| **Regras de uso** | Ex: "Nunca use mais de 6 itens em `gg-lista-flutuante` sem paginação" |
| **Estados** | Normal, hover, disabled, erro, carregando — mostrados lado a lado |

### Esqueleto inicial

```ts
// dev-tools/ui-kit.ts
import '../src/components/gg-botao-primario/gg-botao-primario.ts';

document.body.innerHTML = `
  <section>
    <h2>gg-botao-primario</h2>
    <gg-botao-primario>Padrão</gg-botao-primario>
    <gg-botao-primario variante="destaque">Destaque</gg-botao-primario>
    <gg-botao-primario disabled>Desabilitado</gg-botao-primario>
    <pre><code>&lt;gg-botao-primario variante="destaque"&gt;Salvar&lt;/gg-botao-primario&gt;</code></pre>
  </section>
`;
```

**Regra:** adicionar/atualizar a entrada no UI Kit é parte do Definition of Done — não é um passo opcional "se sobrar tempo".

---

## 15. Migração de Componentes Antigos

Você não precisa (nem deve) parar tudo para reescrever os componentes já existentes que não seguem este padrão. A regra prática é:

1. **Todo componente novo** segue este guia, sem exceção.
2. **Componente antigo só é migrado quando for mexido por outro motivo** (bug, nova funcionalidade naquela área) — migração oportunista, não um projeto à parte.
3. Se um componente antigo for usado em 3 ou mais lugares e causar retrabalho perceptível, ele entra numa fila de migração prioritária, mesmo sem outro motivo.

---

## 16. FAQ

**O componente precisa buscar dado no backend FastAPI, o que eu faço?**
O componente permanece "burro": ele recebe o dado já pronto via propriedade, ou dispara um evento pedindo o dado (`gg-solicitar-dados`) que a página escuta e resolve. Isso mantém o componente reutilizável e testável isoladamente no UI Kit, sem depender de rede.

**E se o componente for muito grande (uma tabela com centenas de linhas, um mapa)?**
Ainda é um componente único, com pasta própria. Internamente ele pode ter funções auxiliares privadas no mesmo `.ts` (ou, se realmente crescer muito, um arquivo `gg-nome.helpers.ts` na mesma pasta) — mas continua sendo uma unidade fechada por fora.

**Preciso de Shadow DOM em literalmente tudo?**
Não. É o padrão default recomendado, mas veja a tabela da Seção 4.1. Se um componente precisa herdar estilo de contexto (ex: área de texto rico dentro de um card), Light DOM é aceitável — documente essa decisão como comentário no topo do `.ts`.

**Como faço acessibilidade (ARIA) nesses componentes?**
Trate como parte do Definition of Done: roles e atributos ARIA relevantes (`role`, `aria-label`, `aria-disabled`) entram no template do componente desde a criação, não como retrabalho posterior.

---

## 17. Glossário

- **Custom Element / Web Component:** elemento HTML definido por você, registrado via `customElements.define()`, usável como qualquer tag nativa.
- **Shadow DOM:** uma sub-árvore de DOM isolada, anexada a um elemento, cujo CSS interno não vaza para fora e não é afetado por CSS externo (exceto variáveis CSS).
- **Light DOM:** o DOM "normal", sem isolamento — o conteúdo do componente é filho direto visível no documento principal.
- **Token de design:** um valor visual (cor, espaçamento, fonte) definido uma única vez como variável CSS e reutilizado em todo o projeto.
- **BEM:** convenção de nomenclatura de classes CSS — Block, Element, Modifier.
- **Co-location:** prática de manter todos os arquivos relacionados a uma mesma unidade de código (aqui, um componente) na mesma pasta.
