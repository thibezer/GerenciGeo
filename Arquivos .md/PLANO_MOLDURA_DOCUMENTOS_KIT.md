# Plano futuro: moldura dos documentos impressos no kit (opção C)

**Status:** pendente (anotado em 17/11/2026). Hoje a moldura está só no app (opção B).

## Situação atual (opção B, já implementada)

- `templates/_base_documento.html`: moldura única (head, Tailwind/Inter, CSS de impressão A4, classe `.folha-a4`, barra "Imprimir / Salvar PDF" entre os marcadores `BARRA_ACOES_INICIO/FIM`).
- `templates/_cabecalho_empresa.html`: cabeçalho "COMPLETA – Agrimensura e Projetos Agropecuários".
- Cada documento (`templates/*.html`, exceto `manual_proprietario.html`) traz só seções `@titulo`, `@barra_titulo`, `@barra_subtitulo`, `@head`, `@corpo` e `@scripts`.
- `carregar_template()` (`services/documentacao/cartorio/utils.py`) encaixa as seções na moldura, e os geradores continuam recebendo a página completa.
- `manual_proprietario.html` ficou fora: é um manual digital escuro, não uma folha A4.

## Objetivo da opção C

Levar para o `@thibezer/ui-components-kit` a parte **reutilizável** da moldura. O GerenciGeo fica só com o miolo (texto jurídico, cabeçalho da empresa, dados).

### No kit (novo módulo `documento`)
- Um arquivo **CSS puro** (sem JS), exportado como, por exemplo, `@thibezer/ui-components-kit/documento.css`:
  - folha A4 na tela (`.folha-a4`, `.folha-a4--fluxo`);
  - blueprint `@media print` (margens A4, `.no-print`, anti-fatiamento, órfãs/viúvas, `thead` repetido);
  - barra de impressão (classes próprias no lugar do Tailwind);
  - bloco de assinaturas e o modo "várias folhas" (tabela-moldura `.folha-print` com margem física 0, hoje no `@head` da anuência);
  - tokens de cor e fonte.
- A documentação e a página de testes do kit devem mostrar a folha na tela e em pré-visualização de impressão.

### No app
- `_base_documento.html` passa a **embutir** o CSS do kit num `<style>`, lido de uma cópia do `dist` do kit feita num passo de build. Ele não pode ser só referenciado, porque a página abre via Blob URL, onde caminhos relativos não funcionam.
- Sai o CSS próprio da base e da anuência que tiver virado classe do kit.

### Pontos de atenção
- Os documentos ainda dependem do Tailwind via CDN: se o CDN não carregar, a impressão sai sem estilo. A opção C é a hora de trocar isso por classes do kit ou por CSS compilado embutido.
- No Chrome, um `@page { margin: ... !important }` não é sobrescrito por outro posterior. A base usa margem sem `!important` justamente para a anuência poder zerá-la.
- O lote de anuências (`anuencias.py`) depende dos marcadores `BARRA_ACOES_*` e `INICIO/FIM CORPO CONSOLIDADO`.
- Ao mexer no kit, siga o `AGENTS.md` dele. Depois, atualize a versão do kit no app.
