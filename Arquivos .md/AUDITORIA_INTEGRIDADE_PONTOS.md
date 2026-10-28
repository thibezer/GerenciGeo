# Auditoria: integridade de pontos e divisas

Gerado em 2026-10-28 15:05 a partir de `gerencigeo.db` por `scripts/diagnosticar_integridade_pontos.py` (somente leitura; nenhum dado foi alterado).

## Resumo

| Item | Total | Levantamentos |
|---|---|---|
| 1. Pontos fora do perímetro ainda em divisas | 1 | 12 (2) |
| 2. Tipo diferente do código SIGEF | 843 | 5 (40), 11 (12), 12 (8), 13 (34), 15 (5), 16 (559), 17 (141), 18 (40), 157 (4) |
| 3. Camada divergente | 92 | 12 (60), 13 (3), 158 (29) |
| 4. Divisas com ponto inválido | 537 | 5 (54), 11 (15), 16 (260), 17 (162), 18 (46) |

## 1. Pontos fora do perímetro que ainda compõem divisas

**O que é:** pontos tipo B (base) ou marcados "ignorar no polígono" não entram no perímetro, mas ainda são início/fim de segmentos de divisa. O cálculo de área, o memorial e o mapa ficam diferentes do que a tabela mostra.

**Causa:** até esta correção, trocar o tipo para/de B não refazia as divisas (já corrigido; vale para trocas novas). Os pontos ignorados abaixo indicam que as divisas também não foram refeitas depois de marcar "ignorar".

**Como conferir:** abra a matrícula na Mesa de Trabalho e veja se a linha do perímetro passa pelo ponto.

**Como corrigir:** use "Reordenar perímetro" na matrícula (preserva confrontante, limite e anuência). Se o ponto deveria compor a divisa, troque o tipo/desmarque "ignorar" antes.

### Levantamento 12 — Sítio Santa Terezinha (EM_ANDAMENTO)

| Ponto (id) | Tipo | Ignorar | Matrícula do ponto | Segmento | Matrícula do segmento | Trecho | Confrontante | Anuência |
|---|---|---|---|---|---|---|---|---|
| B061613 (3156) | B | não | 3.096 (id 186) | 21701 | 3.096 (id 186) | asfalto5 → B061613 | — | não |
| B061613 (3156) | B | não | 3.096 (id 186) | 21702 | 3.096 (id 186) | B061613 → asfalto4 | — | não |

## 2. Tipo gravado diferente da letra do código SIGEF

**O que é:** o nome do vértice segue o padrão SIGEF (`CÓDIGO-TIPO-NÚMERO`), mas o `tipo_ponto` gravado é outro (ex.: `XRXR-P-0028` gravado como V).

**Impacto:** a planilha SIGEF e a Contagem de Pontos usam o **nome**, então seguem a letra do código. Já o filtro de Marcos, a sugestão de código do painel, a auditoria/triagem de marcos e as cores do mapa usam o **tipo gravado**.

**Causa:** ainda não identificada. A importação de homologação (ODS) grava o tipo pela letra do código, e o histórico não registra a troca para V. A coluna "Origem" e "Criado" ajudam a achar o fluxo.

**Como conferir:** decida qual está certo para cada caso — a letra do código ou o tipo gravado. Se for o código, troque o tipo (linha "Tipo do Ponto" no painel, ou em lote selecionando vários).

### Levantamento 5 — Fazenda Sul (ARQUIVADO)

Resumo: código M gravado como V: 3, código P gravado como V: 37

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| DDK-M-1531 (3525) | M (Marco) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| DDK-M-1534 (3524) | M (Marco) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-M-0003 (3538) | M (Marco) | V (Virtual) | sem matrícula | não | não | 11748 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0011 (3539) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 11748 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0012 (3541) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 11748 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0013 (3542) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 11748 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0014 (3547) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6713 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0015 (3548) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6713 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0016 (3549) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6713 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0017 (3550) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6713 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0018 (3551) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6713 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0019 (3552) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6713 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0020 (3557) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6714 Fran.ODS#perimetro_1 | 2026-06-24 |
| XRXR-P-0021 (3558) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6714 Fran.ODS#perimetro_1 | 2026-06-24 |
| XRXR-P-0022 (3559) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6714 Fran.ODS#perimetro_1 | 2026-06-24 |
| XRXR-P-0023 (3560) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6714 Fran.ODS#perimetro_1 | 2026-06-24 |
| XRXR-P-0024 (3561) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6714 Fran.ODS#perimetro_1 | 2026-06-24 |
| XRXR-P-0025 (3562) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6714 Fran.ODS#perimetro_1 | 2026-06-24 |
| XRXR-P-0026 (3563) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6714 Fran.ODS#perimetro_1 | 2026-06-24 |
| XRXR-P-0027 (3564) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6714 Fran.ODS#perimetro_1 | 2026-06-24 |
| XRXR-P-0028 (3503) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0029 (3504) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0030 (3505) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0031 (3506) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0032 (3507) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0033 (3508) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0034 (3509) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0035 (3510) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0036 (3511) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0037 (3512) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0038 (3513) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0039 (3514) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0040 (3515) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0041 (3516) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0042 (3517) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0043 (3518) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0044 (3519) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0045 (3520) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0046 (3521) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |
| XRXR-P-0047 (3522) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6715 Fran.ODS#perimetro_1 | 2026-06-23 |

### Levantamento 11 — Lote 161-A, 162, 163, 163-P, 164 e 164-A (ARQUIVADO)

Resumo: código M gravado como V: 2, código P gravado como V: 10

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| XRXR-M-0001 (3342) | M (Marco) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-M-0002 (3355) | M (Marco) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0001 (3343) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0002 (3345) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0003 (3346) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0004 (3347) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0005 (3348) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0006 (3349) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0007 (3350) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0008 (3351) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0009 (3353) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |
| XRXR-P-0010 (3354) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Norte Corre.ODS | 2026-06-22 |

### Levantamento 12 — Sítio Santa Terezinha (EM_ANDAMENTO)

Resumo: código P gravado como V: 4, código V gravado como P: 4

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| BJQ-V-4401 (12261) | V (Virtual) | P (Ponto) | 3.096 (id 186) | não | não | Vertices 1.csv | 2026-10-07 |
| BJQ-V-4402 (12267) | V (Virtual) | P (Ponto) | 3.096 (id 186) | não | não | Vertices 2.csv | 2026-10-07 |
| BJQ-V-4403 (12272) | V (Virtual) | P (Ponto) | 3.096 (id 186) | não | não | Vertices 3.csv | 2026-10-07 |
| BJQ-V-4422 (12269) | V (Virtual) | P (Ponto) | 3.096 (id 186) | não | não | Vertices 3.csv | 2026-10-07 |
| ZANA-P-1000 (12211) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-09-10 |
| ZANA-P-1001 (12225) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-09-10 |
| ZANA-P-1002 (12241) | P (Ponto) | V (Virtual) | 3.096 (id 186) | não | não | — | 2026-09-10 |
| ZANA-P-1003 (12237) | P (Ponto) | V (Virtual) | 3.096 (id 186) | não | não | Vertices 3.csv | 2026-09-10 |

### Levantamento 13 — Fazenda Nossa Senhora Aparecida (EM_ANDAMENTO)

Resumo: código M gravado como V: 9, código P gravado como V: 25

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| CQI-M-3752 (10986) | M (Marco) | V (Virtual) | sem matrícula | não | não | PI 1.csv | 2026-08-06 |
| CQI-M-3753 (11041) | M (Marco) | V (Virtual) | sem matrícula | não | não | PI 1.csv | 2026-08-06 |
| CQI-M-3754 (11255) | M (Marco) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| CQI-M-3755 (11022) | M (Marco) | V (Virtual) | sem matrícula | não | não | — | 2026-08-06 |
| CQI-M-3756 (11021) | M (Marco) | V (Virtual) | sem matrícula | não | não | PI 1.csv | 2026-08-06 |
| EX3-M-2235 (11027) | M (Marco) | V (Virtual) | sem matrícula | não | não | — | 2026-08-06 |
| EX3-P-6979 (11076) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-06 |
| EX3-P-6980 (11026) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PII 1.csv | 2026-08-06 |
| HXDL-M-0494 (11086) | M (Marco) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-M-0495 (11028) | M (Marco) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-M-0496 (11040) | M (Marco) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0574 (11077) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0575 (11078) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0576 (11079) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0577 (11080) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0578 (11081) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0579 (11082) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0580 (11083) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0581 (11084) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| HXDL-P-0582 (11085) | P (Ponto) | V (Virtual) | sem matrícula | não | não | PIII 1.csv | 2026-08-06 |
| XRXR-P-0171 (11178) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0172 (11181) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0173 (11180) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0174 (11179) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0175 (11185) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0176 (11186) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0177 (11187) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0178 (11184) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0179 (11183) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0180 (11172) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0181 (11170) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0182 (11171) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0183 (11173) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |
| XRXR-P-0184 (11182) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-08-09 |

### Levantamento 15 — Eliza 2 (EM_ANDAMENTO)

Resumo: código M gravado como V: 5

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| CQI-M-3752 (10745) | M (Marco) | V (Virtual) | sem matrícula | não | não | PI 2.csv | 2026-08-05 |
| CQI-M-3753 (10746) | M (Marco) | V (Virtual) | sem matrícula | não | não | PI 2.csv | 2026-08-05 |
| CQI-M-3754 (10747) | M (Marco) | V (Virtual) | sem matrícula | não | não | PI 2.csv | 2026-08-05 |
| CQI-M-3755 (10748) | M (Marco) | V (Virtual) | sem matrícula | não | não | PI 2.csv | 2026-08-05 |
| CQI-M-3756 (10749) | M (Marco) | V (Virtual) | sem matrícula | não | não | PI 2.csv | 2026-08-05 |

### Levantamento 16 — Fazenda Serra dos Dourados (EM_ANDAMENTO)

Resumo: código M gravado como V: 11, código P gravado como V: 548

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| DB5-M-4024 (6384) | M (Marco) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-M-4025 (6387) | M (Marco) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23782 (6386) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23783 (6385) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23860 (6382) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23861 (6381) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23862 (6380) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23863 (6379) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23864 (6378) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23865 (6377) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23866 (6376) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23867 (6375) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23868 (6374) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23869 (6373) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23870 (6372) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23871 (6371) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23872 (6370) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23873 (6369) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23875 (6273) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-23876 (5897) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| DB5-P-23877 (5896) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| DB5-P-23878 (5895) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| DB5-P-23879 (5894) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| DB5-P-23880 (5893) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| DB5-P-23881 (5892) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| DB5-P-23882 (5891) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| DB5-P-23883 (5890) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| DB5-P-23953 (6368) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23954 (6367) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23955 (6366) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23956 (6365) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23957 (6364) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23958 (6363) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23959 (6362) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23960 (6361) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23961 (6360) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23962 (6359) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23963 (6358) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23964 (6357) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23965 (6356) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23966 (6355) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23967 (6354) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23968 (6353) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23969 (6352) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23970 (6351) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23971 (6350) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23972 (6349) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23973 (6348) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23974 (6347) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23975 (6346) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23976 (6345) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23977 (6344) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23978 (6343) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23979 (6342) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23980 (6341) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23981 (6340) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23982 (6339) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23983 (6338) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23984 (6337) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23985 (6336) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23986 (6335) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23987 (6334) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23988 (6333) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23989 (6332) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23990 (6331) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23991 (6330) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23992 (6329) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23993 (6328) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23994 (6327) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23995 (6326) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23996 (6325) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23997 (6324) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23998 (6323) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-23999 (6322) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24000 (6321) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24001 (6320) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24002 (6319) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24003 (6318) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24004 (6317) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24005 (6316) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24006 (6315) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24007 (6314) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24008 (6313) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24009 (6312) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24010 (6311) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24011 (6310) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24012 (6309) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24013 (6308) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24014 (6307) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24015 (6306) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24016 (6305) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24017 (6304) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24018 (6303) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24019 (6302) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24020 (6301) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24021 (6300) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24022 (6299) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24023 (6298) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24024 (6297) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24025 (6296) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24026 (6295) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24027 (6294) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24028 (6293) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24029 (6292) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24030 (6291) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24031 (6290) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24032 (6289) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24033 (6288) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24034 (6287) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24035 (6286) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24036 (6285) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24037 (6284) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24038 (6283) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24039 (6282) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24040 (6281) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24041 (6280) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24042 (6279) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24043 (6278) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24044 (6277) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24045 (6276) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24046 (6275) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24047 (6274) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24072 (11963) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24073 (11962) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24074 (11961) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24075 (11960) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24076 (11959) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24077 (11958) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24078 (11957) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24079 (11956) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24080 (11955) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24081 (11954) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24082 (11953) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24083 (11952) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24084 (11951) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24085 (11950) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24086 (11949) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24087 (11948) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24088 (11947) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24089 (11946) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24090 (11945) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24091 (11944) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24092 (11943) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24093 (11942) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24094 (11941) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24095 (11940) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24096 (11939) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24097 (11938) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24098 (11937) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24099 (11936) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24100 (11935) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24101 (11934) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24102 (11933) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24103 (11932) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24104 (11931) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24105 (11930) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24106 (11929) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24107 (11928) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24108 (11927) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24109 (11926) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24110 (11925) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24111 (11924) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24112 (11923) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24113 (11922) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24114 (11921) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24115 (11920) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24116 (11919) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24117 (11918) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24118 (11917) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24119 (11916) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24120 (11915) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24121 (11914) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24122 (11913) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24123 (11912) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24124 (11911) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24125 (11910) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24126 (11909) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24127 (11908) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24128 (11907) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24129 (11906) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24130 (11905) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24131 (11904) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24132 (11903) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24133 (11902) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24134 (11901) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24135 (11900) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24136 (11899) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24137 (11898) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24138 (11897) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24139 (11896) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24140 (11895) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24141 (11894) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24142 (11893) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24143 (11892) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24144 (11891) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24145 (11890) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24146 (11889) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24147 (11888) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24148 (11887) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24149 (11886) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24150 (11885) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24151 (11884) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24152 (11883) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24153 (11882) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24154 (11881) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24155 (11880) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-24156 (7073) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24157 (7074) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24158 (7075) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24159 (7076) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24160 (7077) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24161 (7078) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24162 (7079) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24163 (7080) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24164 (7081) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24165 (7082) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24166 (7083) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24167 (7084) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24168 (7085) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24169 (7086) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24170 (7087) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-09 |
| DB5-P-24171 (12198) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24172 (12197) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24173 (12196) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24174 (12195) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24175 (12194) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24176 (12193) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24177 (12192) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24178 (12191) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24179 (12190) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24180 (12189) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24181 (12188) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24182 (12187) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24183 (12186) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24184 (12185) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24185 (12184) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24186 (12183) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24187 (12182) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24188 (12181) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24189 (12180) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24190 (12179) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24191 (12178) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24192 (12177) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24193 (12176) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24194 (12175) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24195 (12174) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24196 (12173) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24197 (12172) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24198 (12171) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24199 (12170) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24200 (12169) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24201 (12168) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24202 (12167) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24203 (12166) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24204 (12165) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24205 (12164) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24206 (12163) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24207 (12162) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24208 (12161) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24209 (12160) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24210 (12159) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24211 (12158) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24212 (12157) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24213 (12156) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24214 (12155) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24215 (12154) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24216 (12153) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24217 (12152) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24218 (12151) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24219 (12150) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24220 (12149) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24221 (12148) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24222 (12147) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24223 (12146) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24224 (12145) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24225 (12144) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| DB5-P-24226 (6219) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24227 (6220) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24228 (6221) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24229 (6222) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24230 (6223) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24231 (6224) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24232 (6225) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24233 (6226) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24234 (6227) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24235 (6228) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24236 (6229) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24237 (6230) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24238 (6231) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24239 (6232) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24240 (6233) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24241 (6234) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24242 (6235) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24243 (6236) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24244 (6237) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24245 (6238) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24246 (6239) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24247 (6240) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24248 (6241) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24249 (6242) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24250 (6243) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24251 (6244) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24252 (6245) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24253 (6246) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24254 (6247) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24255 (6248) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24256 (6249) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24257 (6250) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24258 (6251) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24259 (6252) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24260 (6253) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24261 (6254) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24262 (6255) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24263 (6256) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24264 (6257) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24265 (6258) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24266 (6259) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24267 (6260) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24268 (6261) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24269 (6262) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24270 (6263) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24271 (6264) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24272 (6265) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24273 (6266) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24274 (6267) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24275 (6268) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24276 (6269) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24277 (6270) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24278 (6271) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24279 (6272) | P (Ponto) | V (Virtual) | sem matrícula | não | não | — | 2026-07-07 |
| DB5-P-24280 (6389) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24281 (6390) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24282 (6391) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24283 (6392) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24284 (6393) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24285 (6394) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24286 (6395) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24287 (6396) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24288 (6397) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24289 (6398) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24290 (6399) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24291 (6400) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24292 (6401) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24293 (6402) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24294 (6403) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24295 (6404) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24296 (6405) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24297 (6406) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24298 (6407) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24299 (6408) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24300 (6409) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24301 (6410) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24302 (6411) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24303 (6412) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24304 (6413) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24305 (6414) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24306 (6415) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24307 (6416) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24308 (6417) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24309 (6418) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24310 (6419) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24311 (6420) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24312 (6421) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24313 (6422) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24314 (6423) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24315 (6424) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24316 (6425) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24317 (6426) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24318 (6427) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-24319 (6428) | P (Ponto) | V (Virtual) | sem matrícula | não | não | CVS vertices.csv | 2026-07-07 |
| DB5-P-3072 (11964) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3073 (11965) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3074 (11966) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3075 (11967) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3076 (11968) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3077 (11969) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3078 (11970) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3079 (11971) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3080 (11972) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3081 (11973) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3082 (11974) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3083 (11975) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3084 (11976) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3085 (11977) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3086 (11978) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3087 (11979) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3088 (11980) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3089 (11981) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3090 (11982) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3091 (11983) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3092 (11984) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3093 (11985) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3094 (11986) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3095 (11987) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3096 (11988) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3097 (11989) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3098 (11990) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| DB5-P-3099 (11991) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-M-0458 (5888) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| UAUX-M-0459 (5885) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| UAUX-M-1335 (5887) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| UAUX-M-1336 (5886) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vertices.csv | 2026-07-07 |
| UAUX-M-2355 (12140) | M (Marco) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| UAUX-M-2358 (12143) | M (Marco) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| UAUX-M-2406 (6432) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vertices 3.csv | 2026-07-07 |
| UAUX-M-2410 (6435) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vertices 3.csv | 2026-07-07 |
| UAUX-P-16585 (12142) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| UAUX-P-16586 (12141) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| UAUX-P-16691 (6433) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 3.csv | 2026-07-07 |
| UAUX-P-16692 (6434) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 3.csv | 2026-07-07 |
| UAUX-P-16693 (12047) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16694 (12046) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16695 (12045) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16696 (12044) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16697 (12043) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16698 (12042) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16699 (12041) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16700 (12040) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16701 (12039) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16702 (12038) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16703 (12037) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16704 (12036) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16705 (12035) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16706 (12034) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16707 (12033) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16708 (12032) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16709 (12031) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16710 (12030) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16711 (12029) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16712 (12028) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16713 (12027) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16714 (12026) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16715 (12025) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16716 (12024) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16717 (12023) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16718 (12022) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16719 (12021) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16720 (12020) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16721 (12019) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16722 (12018) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16723 (12017) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16724 (12016) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16725 (12015) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16726 (12014) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16727 (12013) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16728 (12012) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16729 (12011) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16730 (12010) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16731 (12008) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16732 (12007) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16733 (12006) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16734 (12005) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16735 (12004) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16736 (12003) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16737 (12002) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16738 (12001) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16739 (12000) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16740 (11999) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16741 (11998) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16742 (11997) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16743 (11996) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16744 (11995) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16745 (11994) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16746 (11993) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| UAUX-P-16747 (5975) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16748 (5976) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16749 (5977) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16750 (5978) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16751 (5979) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16752 (5980) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16753 (5981) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16754 (5982) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16755 (5983) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16756 (5984) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16757 (5985) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16758 (5986) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16759 (5987) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16760 (5988) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16761 (5989) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16762 (5990) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16763 (5991) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16764 (5992) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16765 (5993) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16766 (5994) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16767 (5995) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16768 (5996) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16769 (5997) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16770 (5998) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16771 (5999) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16772 (6000) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16773 (6001) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16774 (6002) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16775 (6003) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16776 (6004) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16777 (6005) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16778 (6006) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16779 (6007) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16780 (6008) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16781 (6009) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16782 (6010) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16783 (6011) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16784 (6012) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16785 (6013) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16786 (6014) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16787 (6015) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16788 (6016) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16789 (6017) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16790 (6018) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16791 (6019) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16792 (6020) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16793 (6021) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16794 (6022) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16795 (6023) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16796 (6024) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16797 (6025) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16798 (6026) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16799 (6027) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16800 (6028) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16801 (6029) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16802 (6030) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16803 (6031) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16804 (6032) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16805 (6033) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16806 (6034) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16807 (6035) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16808 (6036) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16809 (6037) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16810 (6038) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16811 (6039) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16812 (6040) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16813 (6041) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16814 (6042) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16815 (6043) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16816 (6044) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| UAUX-P-16817 (6045) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vertices 1.csv | 2026-07-07 |
| XRXR-M-0004 (12135) | M (Marco) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| XRXR-P-0048 (12200) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 42859.ods - perimetro_1 | 2026-08-28 |
| XRXR-P-0068 (11992) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0069 (12049) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0070 (12050) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0071 (12051) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0072 (12052) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0073 (12053) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0074 (12054) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0075 (12055) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0076 (12056) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0077 (12057) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0078 (12058) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0079 (12059) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0080 (12060) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0081 (12061) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0082 (12062) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0083 (12063) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0084 (12064) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0085 (12065) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0086 (12066) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0087 (12067) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0088 (12068) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |
| XRXR-P-0089 (11876) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 679 e 682.ODS - perimetro_1 | 2026-08-28 |

### Levantamento 17 — Fazenda Douradina (EM_ANDAMENTO)

Resumo: código M gravado como V: 14, código P gravado como V: 127

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| SDER-M-02073 (7739) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-M-02074 (7741) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-M-1445 (7882) | M (Marco) | V (Virtual) | sem matrícula | não | não | — | 2026-07-27 |
| SDER-M-1446 (7883) | M (Marco) | V (Virtual) | sem matrícula | não | não | — | 2026-07-27 |
| SDER-M-1447 (12768) | M (Marco) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_1 | 2026-10-09 |
| SDER-M-1448 (12767) | M (Marco) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_1 | 2026-10-09 |
| SDER-P-3396 (7820) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3397 (7821) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3398 (7822) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3399 (7823) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3400 (7824) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3401 (7825) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3402 (7826) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3403 (7827) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3404 (7828) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3405 (7829) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3406 (7830) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3407 (7831) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3408 (7832) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3409 (7833) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3410 (7834) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3411 (7835) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDER-P-3412 (7836) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 1.csv | 2026-07-13 |
| SDEX-M-0755 (12599) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-10-09 |
| SDEX-M-0756 (12600) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-10-09 |
| SDEX-M-0757 (7871) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-M-0758 (7872) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-M-0817 (13501) | M (Marco) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| SDEX-M-0818 (13500) | M (Marco) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| SDEX-M-0819 (7844) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vértices 2.csv | 2026-07-13 |
| SDEX-M-0822 (7845) | M (Marco) | V (Virtual) | sem matrícula | não | não | Vértices 2.csv | 2026-07-13 |
| SDEX-P-5649 (7873) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5650 (7874) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5651 (7875) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5652 (7876) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5653 (7846) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5654 (7847) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5655 (7848) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5656 (7849) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5657 (7850) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5658 (7851) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5659 (7852) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5660 (7853) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5661 (7854) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5662 (7855) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5663 (7856) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5664 (7857) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5665 (7858) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5666 (7859) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5667 (7860) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5668 (7861) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5669 (7862) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5670 (7863) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5671 (7864) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5672 (7865) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5673 (7866) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5674 (7867) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 3.csv | 2026-07-13 |
| SDEX-P-5675 (13498) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| SDEX-P-5725 (7842) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 2.csv | 2026-07-13 |
| SDEX-P-5726 (7841) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 2.csv | 2026-07-13 |
| SDEX-P-5727 (7840) | P (Ponto) | V (Virtual) | sem matrícula | não | não | Vértices 2.csv | 2026-07-13 |
| XRXR-P-0091 (12764) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_1 | 2026-10-09 |
| XRXR-P-0092 (13419) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0093 (13420) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0094 (13421) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0095 (13422) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0096 (13423) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0097 (13424) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0098 (13425) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0099 (13426) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0100 (13427) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0101 (13428) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0102 (13429) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0103 (13430) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0104 (13431) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0105 (13432) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0106 (13433) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0107 (13434) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0108 (13435) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0109 (13436) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0110 (13437) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0111 (13438) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0112 (13439) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0113 (13440) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0114 (13441) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0115 (13442) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0116 (13443) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0117 (13444) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0118 (13445) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0119 (13446) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0120 (13447) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0121 (13448) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0122 (13449) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0123 (13450) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0124 (13451) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0125 (13452) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0126 (13453) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0127 (13454) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0128 (13455) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0129 (13456) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0130 (13457) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0131 (13458) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0132 (13459) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0133 (13460) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0134 (13461) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0135 (13462) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0136 (13463) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0137 (13464) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0138 (13465) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0139 (13466) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0140 (13467) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0141 (13468) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0142 (13469) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0143 (13470) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0144 (13471) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0145 (13472) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0146 (13473) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0147 (13474) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0148 (13475) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0149 (13476) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0150 (13477) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0151 (13478) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0152 (13479) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0153 (13480) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0154 (13481) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0155 (13482) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0156 (13483) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0157 (13484) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0158 (13485) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0159 (13486) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0160 (13487) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0161 (13488) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0162 (13489) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0163 (13490) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0164 (13491) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0165 (13492) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0166 (13493) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0167 (13494) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0168 (13495) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0169 (13496) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |
| XRXR-P-0170 (13497) | P (Ponto) | V (Virtual) | sem matrícula | não | não | 6 ALQ.ODS - perimetro_2 | 2026-10-13 |

### Levantamento 18 — Lote nº 3C e 3N (EM_ANDAMENTO)

Resumo: código M gravado como V: 4, código P gravado como V: 36

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| AYC-M-0018 (10266) | M (Marco) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| AYC-M-0019 (10265) | M (Marco) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| AYC-M-2213 (10272) | M (Marco) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| AYC-M-2230 (10273) | M (Marco) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2119 (10275) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2120 (10276) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2121 (10277) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2122 (10278) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2123 (10279) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2124 (10280) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2125 (10281) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2126 (10282) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2127 (10283) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2128 (10284) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2129 (10285) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2130 (10286) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2131 (10287) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2132 (10288) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2133 (10289) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2134 (10290) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2135 (10291) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2136 (10292) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2137 (10293) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2138 (10294) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2139 (10295) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2140 (10296) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2141 (10297) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2142 (10298) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2143 (10299) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2144 (10300) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2145 (10301) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2146 (10302) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2147 (10303) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2148 (10304) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2149 (10305) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2150 (10306) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2151 (10307) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2152 (10308) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2153 (10309) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |
| UAUX-P-2154 (10310) | P (Ponto) | V (Virtual) | sem matrícula | não | não | exportacao (1).csv + exportacao (2).csv | 2026-08-04 |

### Levantamento 157 — Divisão Anibal 1 (EM_ANDAMENTO)

Resumo: código P gravado como V: 4

| Ponto (id) | Código diz | Gravado | Matrícula | Vizinho | Homologado | Origem | Criado |
|---|---|---|---|---|---|---|---|
| XRXR-P-0171 (12205) | P (Ponto) | V (Virtual) | sem matrícula | não | não | anibaldivisao_txt_090409.txt | 2026-09-04 |
| XRXR-P-0172 (12203) | P (Ponto) | V (Virtual) | sem matrícula | não | não | anibaldivisao_txt_090409.txt | 2026-09-04 |
| XRXR-P-0173 (12204) | P (Ponto) | V (Virtual) | sem matrícula | não | não | anibaldivisao_txt_090409.txt | 2026-09-04 |
| XRXR-P-0174 (12206) | P (Ponto) | V (Virtual) | sem matrícula | não | não | anibaldivisao_txt_090409.txt | 2026-09-04 |

## 3. Camada de ciclo de vida divergente

**O que é:** a camada (Perímetro / Campo / Vizinho / Homologado) não bate com a regra do sistema: vizinho → VIZINHO; homologado → HOMOLOGADO; com matrícula, não ignorado e não base → PERIMETRO; senão CAMPO.

**Impacto:** filtros por camada mostram o ponto no grupo errado. Não altera coordenadas nem divisas.

**Causa:** a edição em lote (troca de matrícula/tipo) não recalculava a camada (já corrigido); cópias de vizinho ficaram com a camada do campo.

**Como conferir:** filtre pela camada na Mesa de Trabalho. Qualquer edição do ponto (individual ou em lote) já recalcula.

### Levantamento 12 — Sítio Santa Terezinha (EM_ANDAMENTO)

| Ponto (id) | Tipo | Matrícula | Ignorar | Vizinho | Camada atual | Camada esperada |
|---|---|---|---|---|---|---|
| BJQ-P-4525 (11508) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4526 (11509) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4527 (11510) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4528 (11511) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4529 (11512) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4530 (11506) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4531 (12212) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4532 (12258) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4533 (12259) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4534 (12260) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4535 (12262) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4536 (12263) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4537 (12264) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4538 (12265) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4539 (12266) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4540 (12268) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4541 (12270) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-V-4401 (12261) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-V-4402 (12267) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-V-4403 (12272) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-V-4422 (12269) | P | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| ZANA-P-1003 (12237) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| ZANA-V-1000 (12226) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| ZANA-V-1001 (12242) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| ZANA-V-1002 (12273) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto1 (3158) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto10 (3167) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto11 (3168) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto2 (3159) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto3 (3160) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto4 (3161) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto5 (3162) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto6 (3163) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto7 (3164) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto8 (3165) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| asfalto9 (3166) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| divfund5 (13557) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| divfund6 (13558) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| divisa1 (3157) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| divisa2 (3170) | V | 3.096 (id 186) | não | não | CAMPO | PERIMETRO |
| BJQ-P-4515 (11490) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4516 (11491) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4517 (11492) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4518 (11493) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4519 (11494) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4520 (11495) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4521 (11496) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4522 (11497) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4523 (11498) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-P-4524 (11499) | P | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4388 (12238) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4389 (12239) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4391 (12223) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4394 (11484) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4395 (11485) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4396 (11486) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4397 (11487) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4398 (11488) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4399 (11489) | V | sem matrícula | não | sim | CAMPO | VIZINHO |
| BJQ-V-4421 (12222) | V | sem matrícula | não | sim | CAMPO | VIZINHO |

### Levantamento 13 — Fazenda Nossa Senhora Aparecida (EM_ANDAMENTO)

| Ponto (id) | Tipo | Matrícula | Ignorar | Vizinho | Camada atual | Camada esperada |
|---|---|---|---|---|---|---|
| XRXR-V-0120 (11163) | V | 3.580 (id 187) | não | não | CAMPO | PERIMETRO |
| XRXR-V-0121 (11162) | V | 3.580 (id 187) | não | não | CAMPO | PERIMETRO |
| estrada10 (13542) | V | 3.580 (id 187) | não | não | CAMPO | PERIMETRO |

### Levantamento 158 — Fazenda Fernando (EM_ANDAMENTO)

| Ponto (id) | Tipo | Matrícula | Ignorar | Vizinho | Camada atual | Camada esperada |
|---|---|---|---|---|---|---|
| divisa1 (13565) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| divisa1_1 (13590) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| estrad3 (13563) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| estrada1 (13561) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| estrada2 (13562) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| pt0 (13560) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio100 (13566) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio101 (13567) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio102 (13568) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio103 (13569) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio104 (13570) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio105 (13571) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio106 (13572) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio107 (13573) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio108 (13574) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio109 (13575) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio110 (13576) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio111 (13577) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio112 (13578) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio113 (13579) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio114 (13580) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio115 (13581) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio116 (13582) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio117 (13583) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio118 (13584) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio119 (13585) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio120 (13586) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio121 (13587) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |
| rio122 (13588) | P | 7.459 (id 185) | não | não | CAMPO | PERIMETRO |

## 4. Divisas que apontam para pontos inválidos

**O que é:** segmentos de divisa de uma matrícula cujo ponto de início/fim foi excluído, não tem matrícula ou pertence a outra matrícula.

**Impacto:** documentos e mapas que leem as divisas podem incluir trechos com pontos que a matrícula não tem.

**Causa provável:** os pontos foram desvinculados da matrícula (ou excluídos) sem que as divisas antigas fossem removidas. Nos levantamentos abaixo, veja quantos pontos ainda têm matrícula.

**Como conferir:** abra a matrícula e confira se o perímetro desenhado usa esses pontos. Para corrigir, vincule os pontos à matrícula e use "Reordenar perímetro" (refaz as divisas com os pontos da matrícula).

### Levantamento 5 — Fazenda Sul (ARQUIVADO)

Pontos no levantamento: 48 (com matrícula: 0); segmentos: 54.

| Matrícula do segmento | Causa | Segmentos |
|---|---|---|
| 6713 (id 8) | ponto excluído | 3 |
| 6713 (id 8) | ponto sem matrícula | 7 |
| 6714 (id 9) | ponto sem matrícula | 12 |
| 6715 (id 10) | ponto excluído | 3 |
| 6715 (id 10) | ponto sem matrícula | 22 |
| 11748 (id 11) | ponto excluído | 3 |
| 11748 (id 11) | ponto sem matrícula | 4 |

<details><summary>Segmentos</summary>

| Segmento | Matrícula | Início (id) / matrícula | Fim (id) / matrícula | Causa |
|---|---|---|---|---|
| 422 | 6713 (id 8) | XRXR-V-0009 (3545) / sem matrícula | XRXR-V-0005 (3546) / sem matrícula | ponto sem matrícula |
| 423 | 6713 (id 8) | XRXR-V-0005 (3546) / sem matrícula | XRXR-P-0014 (3547) / sem matrícula | ponto sem matrícula |
| 424 | 6713 (id 8) | XRXR-P-0014 (3547) / sem matrícula | XRXR-P-0015 (3548) / sem matrícula | ponto sem matrícula |
| 425 | 6713 (id 8) | XRXR-P-0015 (3548) / sem matrícula | XRXR-P-0016 (3549) / sem matrícula | ponto sem matrícula |
| 426 | 6713 (id 8) | XRXR-P-0016 (3549) / sem matrícula | XRXR-P-0017 (3550) / sem matrícula | ponto sem matrícula |
| 427 | 6713 (id 8) | XRXR-P-0017 (3550) / sem matrícula | XRXR-P-0018 (3551) / sem matrícula | ponto sem matrícula |
| 428 | 6713 (id 8) | XRXR-P-0018 (3551) / sem matrícula | XRXR-P-0019 (3552) / sem matrícula | ponto sem matrícula |
| 429 | 6713 (id 8) | XRXR-P-0019 (3552) / sem matrícula | — (3553) / — | ponto excluído |
| 430 | 6713 (id 8) | — (3553) / — | — (3554) / — | ponto excluído |
| 431 | 6713 (id 8) | — (3554) / — | XRXR-V-0009 (3545) / sem matrícula | ponto excluído |
| 432 | 6714 (id 9) | XRXR-V-0010 (3555) / sem matrícula | XRXR-V-0006 (3556) / sem matrícula | ponto sem matrícula |
| 433 | 6714 (id 9) | XRXR-V-0006 (3556) / sem matrícula | XRXR-P-0020 (3557) / sem matrícula | ponto sem matrícula |
| 434 | 6714 (id 9) | XRXR-P-0020 (3557) / sem matrícula | XRXR-P-0021 (3558) / sem matrícula | ponto sem matrícula |
| 435 | 6714 (id 9) | XRXR-P-0021 (3558) / sem matrícula | XRXR-P-0022 (3559) / sem matrícula | ponto sem matrícula |
| 436 | 6714 (id 9) | XRXR-P-0022 (3559) / sem matrícula | XRXR-P-0023 (3560) / sem matrícula | ponto sem matrícula |
| 437 | 6714 (id 9) | XRXR-P-0023 (3560) / sem matrícula | XRXR-P-0024 (3561) / sem matrícula | ponto sem matrícula |
| 438 | 6714 (id 9) | XRXR-P-0024 (3561) / sem matrícula | XRXR-P-0025 (3562) / sem matrícula | ponto sem matrícula |
| 439 | 6714 (id 9) | XRXR-P-0025 (3562) / sem matrícula | XRXR-P-0026 (3563) / sem matrícula | ponto sem matrícula |
| 440 | 6714 (id 9) | XRXR-P-0026 (3563) / sem matrícula | XRXR-P-0027 (3564) / sem matrícula | ponto sem matrícula |
| 441 | 6714 (id 9) | XRXR-P-0027 (3564) / sem matrícula | XRXR-V-0007 (3565) / sem matrícula | ponto sem matrícula |
| 442 | 6714 (id 9) | XRXR-V-0007 (3565) / sem matrícula | XRXR-V-0011 (3566) / sem matrícula | ponto sem matrícula |
| 443 | 6714 (id 9) | XRXR-V-0011 (3566) / sem matrícula | XRXR-V-0010 (3555) / sem matrícula | ponto sem matrícula |
| 378 | 6715 (id 10) | — (3501) / — | — (3502) / — | ponto excluído |
| 379 | 6715 (id 10) | — (3502) / — | XRXR-P-0028 (3503) / sem matrícula | ponto excluído |
| 380 | 6715 (id 10) | XRXR-P-0028 (3503) / sem matrícula | XRXR-P-0029 (3504) / sem matrícula | ponto sem matrícula |
| 381 | 6715 (id 10) | XRXR-P-0029 (3504) / sem matrícula | XRXR-P-0030 (3505) / sem matrícula | ponto sem matrícula |
| 382 | 6715 (id 10) | XRXR-P-0030 (3505) / sem matrícula | XRXR-P-0031 (3506) / sem matrícula | ponto sem matrícula |
| 383 | 6715 (id 10) | XRXR-P-0031 (3506) / sem matrícula | XRXR-P-0032 (3507) / sem matrícula | ponto sem matrícula |
| 384 | 6715 (id 10) | XRXR-P-0032 (3507) / sem matrícula | XRXR-P-0033 (3508) / sem matrícula | ponto sem matrícula |
| 385 | 6715 (id 10) | XRXR-P-0033 (3508) / sem matrícula | XRXR-P-0034 (3509) / sem matrícula | ponto sem matrícula |
| 386 | 6715 (id 10) | XRXR-P-0034 (3509) / sem matrícula | XRXR-P-0035 (3510) / sem matrícula | ponto sem matrícula |
| 387 | 6715 (id 10) | XRXR-P-0035 (3510) / sem matrícula | XRXR-P-0036 (3511) / sem matrícula | ponto sem matrícula |
| 388 | 6715 (id 10) | XRXR-P-0036 (3511) / sem matrícula | XRXR-P-0037 (3512) / sem matrícula | ponto sem matrícula |
| 389 | 6715 (id 10) | XRXR-P-0037 (3512) / sem matrícula | XRXR-P-0038 (3513) / sem matrícula | ponto sem matrícula |
| 390 | 6715 (id 10) | XRXR-P-0038 (3513) / sem matrícula | XRXR-P-0039 (3514) / sem matrícula | ponto sem matrícula |
| 391 | 6715 (id 10) | XRXR-P-0039 (3514) / sem matrícula | XRXR-P-0040 (3515) / sem matrícula | ponto sem matrícula |
| 392 | 6715 (id 10) | XRXR-P-0040 (3515) / sem matrícula | XRXR-P-0041 (3516) / sem matrícula | ponto sem matrícula |
| 393 | 6715 (id 10) | XRXR-P-0041 (3516) / sem matrícula | XRXR-P-0042 (3517) / sem matrícula | ponto sem matrícula |
| 394 | 6715 (id 10) | XRXR-P-0042 (3517) / sem matrícula | XRXR-P-0043 (3518) / sem matrícula | ponto sem matrícula |
| 395 | 6715 (id 10) | XRXR-P-0043 (3518) / sem matrícula | XRXR-P-0044 (3519) / sem matrícula | ponto sem matrícula |
| 396 | 6715 (id 10) | XRXR-P-0044 (3519) / sem matrícula | XRXR-P-0045 (3520) / sem matrícula | ponto sem matrícula |
| 397 | 6715 (id 10) | XRXR-P-0045 (3520) / sem matrícula | XRXR-P-0046 (3521) / sem matrícula | ponto sem matrícula |
| 398 | 6715 (id 10) | XRXR-P-0046 (3521) / sem matrícula | XRXR-P-0047 (3522) / sem matrícula | ponto sem matrícula |
| 399 | 6715 (id 10) | XRXR-P-0047 (3522) / sem matrícula | XRXR-V-0008 (3523) / sem matrícula | ponto sem matrícula |
| 400 | 6715 (id 10) | XRXR-V-0008 (3523) / sem matrícula | DDK-M-1534 (3524) / sem matrícula | ponto sem matrícula |
| 401 | 6715 (id 10) | DDK-M-1534 (3524) / sem matrícula | DDK-M-1531 (3525) / sem matrícula | ponto sem matrícula |
| 402 | 6715 (id 10) | DDK-M-1531 (3525) / sem matrícula | — (3501) / — | ponto excluído |
| 415 | 11748 (id 11) | XRXR-M-0003 (3538) / sem matrícula | XRXR-P-0011 (3539) / sem matrícula | ponto sem matrícula |
| 416 | 11748 (id 11) | XRXR-P-0011 (3539) / sem matrícula | XRXR-V-0004 (3540) / sem matrícula | ponto sem matrícula |
| 417 | 11748 (id 11) | XRXR-V-0004 (3540) / sem matrícula | XRXR-P-0012 (3541) / sem matrícula | ponto sem matrícula |
| 418 | 11748 (id 11) | XRXR-P-0012 (3541) / sem matrícula | XRXR-P-0013 (3542) / sem matrícula | ponto sem matrícula |
| 419 | 11748 (id 11) | XRXR-P-0013 (3542) / sem matrícula | — (3543) / — | ponto excluído |
| 420 | 11748 (id 11) | — (3543) / — | — (3544) / — | ponto excluído |
| 421 | 11748 (id 11) | — (3544) / — | XRXR-M-0003 (3538) / sem matrícula | ponto excluído |

</details>

### Levantamento 11 — Lote 161-A, 162, 163, 163-P, 164 e 164-A (ARQUIVADO)

Pontos no levantamento: 15 (com matrícula: 0); segmentos: 15.

| Matrícula do segmento | Causa | Segmentos |
|---|---|---|
| 10189 (id 7) | ponto sem matrícula | 15 |

<details><summary>Segmentos</summary>

| Segmento | Matrícula | Início (id) / matrícula | Fim (id) / matrícula | Causa |
|---|---|---|---|---|
| 219 | 10189 (id 7) | XRXR-M-0001 (3342) / sem matrícula | XRXR-P-0001 (3343) / sem matrícula | ponto sem matrícula |
| 220 | 10189 (id 7) | XRXR-P-0001 (3343) / sem matrícula | XRXR-V-0001 (3344) / sem matrícula | ponto sem matrícula |
| 221 | 10189 (id 7) | XRXR-V-0001 (3344) / sem matrícula | XRXR-P-0002 (3345) / sem matrícula | ponto sem matrícula |
| 222 | 10189 (id 7) | XRXR-P-0002 (3345) / sem matrícula | XRXR-P-0003 (3346) / sem matrícula | ponto sem matrícula |
| 223 | 10189 (id 7) | XRXR-P-0003 (3346) / sem matrícula | XRXR-P-0004 (3347) / sem matrícula | ponto sem matrícula |
| 224 | 10189 (id 7) | XRXR-P-0004 (3347) / sem matrícula | XRXR-P-0005 (3348) / sem matrícula | ponto sem matrícula |
| 225 | 10189 (id 7) | XRXR-P-0005 (3348) / sem matrícula | XRXR-P-0006 (3349) / sem matrícula | ponto sem matrícula |
| 226 | 10189 (id 7) | XRXR-P-0006 (3349) / sem matrícula | XRXR-P-0007 (3350) / sem matrícula | ponto sem matrícula |
| 227 | 10189 (id 7) | XRXR-P-0007 (3350) / sem matrícula | XRXR-P-0008 (3351) / sem matrícula | ponto sem matrícula |
| 228 | 10189 (id 7) | XRXR-P-0008 (3351) / sem matrícula | XRXR-V-0002 (3352) / sem matrícula | ponto sem matrícula |
| 229 | 10189 (id 7) | XRXR-V-0002 (3352) / sem matrícula | XRXR-P-0009 (3353) / sem matrícula | ponto sem matrícula |
| 230 | 10189 (id 7) | XRXR-P-0009 (3353) / sem matrícula | XRXR-P-0010 (3354) / sem matrícula | ponto sem matrícula |
| 231 | 10189 (id 7) | XRXR-P-0010 (3354) / sem matrícula | XRXR-M-0002 (3355) / sem matrícula | ponto sem matrícula |
| 232 | 10189 (id 7) | XRXR-M-0002 (3355) / sem matrícula | XRXR-V-0003 (3356) / sem matrícula | ponto sem matrícula |
| 233 | 10189 (id 7) | XRXR-V-0003 (3356) / sem matrícula | XRXR-M-0001 (3342) / sem matrícula | ponto sem matrícula |

</details>

### Levantamento 16 — Fazenda Serra dos Dourados (EM_ANDAMENTO)

Pontos no levantamento: 655 (com matrícula: 0); segmentos: 260.

| Matrícula do segmento | Causa | Segmentos |
|---|---|---|
| 42859 (id 13) | ponto sem matrícula | 66 |
| 682 (id 15) | ponto sem matrícula | 194 |

<details><summary>Segmentos</summary>

| Segmento | Matrícula | Início (id) / matrícula | Fim (id) / matrícula | Causa |
|---|---|---|---|---|
| 18685 | 42859 (id 13) | XRXR-M-0004 (12135) / sem matrícula | XRXR-V-0027 (12136) / sem matrícula | ponto sem matrícula |
| 18686 | 42859 (id 13) | XRXR-V-0027 (12136) / sem matrícula | XRXR-V-0028 (12137) / sem matrícula | ponto sem matrícula |
| 18687 | 42859 (id 13) | XRXR-V-0028 (12137) / sem matrícula | XRXR-V-0029 (12138) / sem matrícula | ponto sem matrícula |
| 18688 | 42859 (id 13) | XRXR-V-0029 (12138) / sem matrícula | XRXR-V-0030 (12139) / sem matrícula | ponto sem matrícula |
| 18689 | 42859 (id 13) | XRXR-V-0030 (12139) / sem matrícula | UAUX-M-2355 (12140) / sem matrícula | ponto sem matrícula |
| 18690 | 42859 (id 13) | UAUX-M-2355 (12140) / sem matrícula | UAUX-P-16586 (12141) / sem matrícula | ponto sem matrícula |
| 18691 | 42859 (id 13) | UAUX-P-16586 (12141) / sem matrícula | UAUX-P-16585 (12142) / sem matrícula | ponto sem matrícula |
| 18692 | 42859 (id 13) | UAUX-P-16585 (12142) / sem matrícula | UAUX-M-2358 (12143) / sem matrícula | ponto sem matrícula |
| 18693 | 42859 (id 13) | UAUX-M-2358 (12143) / sem matrícula | DB5-P-24225 (12144) / sem matrícula | ponto sem matrícula |
| 18694 | 42859 (id 13) | DB5-P-24225 (12144) / sem matrícula | DB5-P-24224 (12145) / sem matrícula | ponto sem matrícula |
| 18695 | 42859 (id 13) | DB5-P-24224 (12145) / sem matrícula | DB5-P-24223 (12146) / sem matrícula | ponto sem matrícula |
| 18696 | 42859 (id 13) | DB5-P-24223 (12146) / sem matrícula | DB5-P-24222 (12147) / sem matrícula | ponto sem matrícula |
| 18697 | 42859 (id 13) | DB5-P-24222 (12147) / sem matrícula | DB5-P-24221 (12148) / sem matrícula | ponto sem matrícula |
| 18698 | 42859 (id 13) | DB5-P-24221 (12148) / sem matrícula | DB5-P-24220 (12149) / sem matrícula | ponto sem matrícula |
| 18699 | 42859 (id 13) | DB5-P-24220 (12149) / sem matrícula | DB5-P-24219 (12150) / sem matrícula | ponto sem matrícula |
| 18700 | 42859 (id 13) | DB5-P-24219 (12150) / sem matrícula | DB5-P-24218 (12151) / sem matrícula | ponto sem matrícula |
| 18701 | 42859 (id 13) | DB5-P-24218 (12151) / sem matrícula | DB5-P-24217 (12152) / sem matrícula | ponto sem matrícula |
| 18702 | 42859 (id 13) | DB5-P-24217 (12152) / sem matrícula | DB5-P-24216 (12153) / sem matrícula | ponto sem matrícula |
| 18703 | 42859 (id 13) | DB5-P-24216 (12153) / sem matrícula | DB5-P-24215 (12154) / sem matrícula | ponto sem matrícula |
| 18704 | 42859 (id 13) | DB5-P-24215 (12154) / sem matrícula | DB5-P-24214 (12155) / sem matrícula | ponto sem matrícula |
| 18705 | 42859 (id 13) | DB5-P-24214 (12155) / sem matrícula | DB5-P-24213 (12156) / sem matrícula | ponto sem matrícula |
| 18706 | 42859 (id 13) | DB5-P-24213 (12156) / sem matrícula | DB5-P-24212 (12157) / sem matrícula | ponto sem matrícula |
| 18707 | 42859 (id 13) | DB5-P-24212 (12157) / sem matrícula | DB5-P-24211 (12158) / sem matrícula | ponto sem matrícula |
| 18708 | 42859 (id 13) | DB5-P-24211 (12158) / sem matrícula | DB5-P-24210 (12159) / sem matrícula | ponto sem matrícula |
| 18709 | 42859 (id 13) | DB5-P-24210 (12159) / sem matrícula | DB5-P-24209 (12160) / sem matrícula | ponto sem matrícula |
| 18710 | 42859 (id 13) | DB5-P-24209 (12160) / sem matrícula | DB5-P-24208 (12161) / sem matrícula | ponto sem matrícula |
| 18711 | 42859 (id 13) | DB5-P-24208 (12161) / sem matrícula | DB5-P-24207 (12162) / sem matrícula | ponto sem matrícula |
| 18712 | 42859 (id 13) | DB5-P-24207 (12162) / sem matrícula | DB5-P-24206 (12163) / sem matrícula | ponto sem matrícula |
| 18713 | 42859 (id 13) | DB5-P-24206 (12163) / sem matrícula | DB5-P-24205 (12164) / sem matrícula | ponto sem matrícula |
| 18714 | 42859 (id 13) | DB5-P-24205 (12164) / sem matrícula | DB5-P-24204 (12165) / sem matrícula | ponto sem matrícula |
| 18715 | 42859 (id 13) | DB5-P-24204 (12165) / sem matrícula | DB5-P-24203 (12166) / sem matrícula | ponto sem matrícula |
| 18716 | 42859 (id 13) | DB5-P-24203 (12166) / sem matrícula | DB5-P-24202 (12167) / sem matrícula | ponto sem matrícula |
| 18717 | 42859 (id 13) | DB5-P-24202 (12167) / sem matrícula | DB5-P-24201 (12168) / sem matrícula | ponto sem matrícula |
| 18718 | 42859 (id 13) | DB5-P-24201 (12168) / sem matrícula | DB5-P-24200 (12169) / sem matrícula | ponto sem matrícula |
| 18719 | 42859 (id 13) | DB5-P-24200 (12169) / sem matrícula | DB5-P-24199 (12170) / sem matrícula | ponto sem matrícula |
| 18720 | 42859 (id 13) | DB5-P-24199 (12170) / sem matrícula | DB5-P-24198 (12171) / sem matrícula | ponto sem matrícula |
| 18721 | 42859 (id 13) | DB5-P-24198 (12171) / sem matrícula | DB5-P-24197 (12172) / sem matrícula | ponto sem matrícula |
| 18722 | 42859 (id 13) | DB5-P-24197 (12172) / sem matrícula | DB5-P-24196 (12173) / sem matrícula | ponto sem matrícula |
| 18723 | 42859 (id 13) | DB5-P-24196 (12173) / sem matrícula | DB5-P-24195 (12174) / sem matrícula | ponto sem matrícula |
| 18724 | 42859 (id 13) | DB5-P-24195 (12174) / sem matrícula | DB5-P-24194 (12175) / sem matrícula | ponto sem matrícula |
| 18725 | 42859 (id 13) | DB5-P-24194 (12175) / sem matrícula | DB5-P-24193 (12176) / sem matrícula | ponto sem matrícula |
| 18726 | 42859 (id 13) | DB5-P-24193 (12176) / sem matrícula | DB5-P-24192 (12177) / sem matrícula | ponto sem matrícula |
| 18727 | 42859 (id 13) | DB5-P-24192 (12177) / sem matrícula | DB5-P-24191 (12178) / sem matrícula | ponto sem matrícula |
| 18728 | 42859 (id 13) | DB5-P-24191 (12178) / sem matrícula | DB5-P-24190 (12179) / sem matrícula | ponto sem matrícula |
| 18729 | 42859 (id 13) | DB5-P-24190 (12179) / sem matrícula | DB5-P-24189 (12180) / sem matrícula | ponto sem matrícula |
| 18730 | 42859 (id 13) | DB5-P-24189 (12180) / sem matrícula | DB5-P-24188 (12181) / sem matrícula | ponto sem matrícula |
| 18731 | 42859 (id 13) | DB5-P-24188 (12181) / sem matrícula | DB5-P-24187 (12182) / sem matrícula | ponto sem matrícula |
| 18732 | 42859 (id 13) | DB5-P-24187 (12182) / sem matrícula | DB5-P-24186 (12183) / sem matrícula | ponto sem matrícula |
| 18733 | 42859 (id 13) | DB5-P-24186 (12183) / sem matrícula | DB5-P-24185 (12184) / sem matrícula | ponto sem matrícula |
| 18734 | 42859 (id 13) | DB5-P-24185 (12184) / sem matrícula | DB5-P-24184 (12185) / sem matrícula | ponto sem matrícula |
| 18735 | 42859 (id 13) | DB5-P-24184 (12185) / sem matrícula | DB5-P-24183 (12186) / sem matrícula | ponto sem matrícula |
| 18736 | 42859 (id 13) | DB5-P-24183 (12186) / sem matrícula | DB5-P-24182 (12187) / sem matrícula | ponto sem matrícula |
| 18737 | 42859 (id 13) | DB5-P-24182 (12187) / sem matrícula | DB5-P-24181 (12188) / sem matrícula | ponto sem matrícula |
| 18738 | 42859 (id 13) | DB5-P-24181 (12188) / sem matrícula | DB5-P-24180 (12189) / sem matrícula | ponto sem matrícula |
| 18739 | 42859 (id 13) | DB5-P-24180 (12189) / sem matrícula | DB5-P-24179 (12190) / sem matrícula | ponto sem matrícula |
| 18740 | 42859 (id 13) | DB5-P-24179 (12190) / sem matrícula | DB5-P-24178 (12191) / sem matrícula | ponto sem matrícula |
| 18741 | 42859 (id 13) | DB5-P-24178 (12191) / sem matrícula | DB5-P-24177 (12192) / sem matrícula | ponto sem matrícula |
| 18742 | 42859 (id 13) | DB5-P-24177 (12192) / sem matrícula | DB5-P-24176 (12193) / sem matrícula | ponto sem matrícula |
| 18743 | 42859 (id 13) | DB5-P-24176 (12193) / sem matrícula | DB5-P-24175 (12194) / sem matrícula | ponto sem matrícula |
| 18744 | 42859 (id 13) | DB5-P-24175 (12194) / sem matrícula | DB5-P-24174 (12195) / sem matrícula | ponto sem matrícula |
| 18745 | 42859 (id 13) | DB5-P-24174 (12195) / sem matrícula | DB5-P-24173 (12196) / sem matrícula | ponto sem matrícula |
| 18746 | 42859 (id 13) | DB5-P-24173 (12196) / sem matrícula | DB5-P-24172 (12197) / sem matrícula | ponto sem matrícula |
| 18747 | 42859 (id 13) | DB5-P-24172 (12197) / sem matrícula | DB5-P-24171 (12198) / sem matrícula | ponto sem matrícula |
| 18748 | 42859 (id 13) | DB5-P-24171 (12198) / sem matrícula | XRXR-V-0031 (12199) / sem matrícula | ponto sem matrícula |
| 18749 | 42859 (id 13) | XRXR-V-0031 (12199) / sem matrícula | XRXR-P-0048 (12200) / sem matrícula | ponto sem matrícula |
| 18750 | 42859 (id 13) | XRXR-P-0048 (12200) / sem matrícula | XRXR-M-0004 (12135) / sem matrícula | ponto sem matrícula |
| 18425 | 682 (id 15) | XRXR-V-0032 (11875) / sem matrícula | XRXR-P-0089 (11876) / sem matrícula | ponto sem matrícula |
| 18426 | 682 (id 15) | XRXR-P-0089 (11876) / sem matrícula | XRXR-V-0033 (11877) / sem matrícula | ponto sem matrícula |
| 18427 | 682 (id 15) | XRXR-V-0033 (11877) / sem matrícula | XRXR-V-0034 (11878) / sem matrícula | ponto sem matrícula |
| 18428 | 682 (id 15) | XRXR-V-0034 (11878) / sem matrícula | XRXR-V-0035 (11879) / sem matrícula | ponto sem matrícula |
| 18429 | 682 (id 15) | XRXR-V-0035 (11879) / sem matrícula | DB5-P-24155 (11880) / sem matrícula | ponto sem matrícula |
| 18430 | 682 (id 15) | DB5-P-24155 (11880) / sem matrícula | DB5-P-24154 (11881) / sem matrícula | ponto sem matrícula |
| 18431 | 682 (id 15) | DB5-P-24154 (11881) / sem matrícula | DB5-P-24153 (11882) / sem matrícula | ponto sem matrícula |
| 18432 | 682 (id 15) | DB5-P-24153 (11882) / sem matrícula | DB5-P-24152 (11883) / sem matrícula | ponto sem matrícula |
| 18433 | 682 (id 15) | DB5-P-24152 (11883) / sem matrícula | DB5-P-24151 (11884) / sem matrícula | ponto sem matrícula |
| 18434 | 682 (id 15) | DB5-P-24151 (11884) / sem matrícula | DB5-P-24150 (11885) / sem matrícula | ponto sem matrícula |
| 18435 | 682 (id 15) | DB5-P-24150 (11885) / sem matrícula | DB5-P-24149 (11886) / sem matrícula | ponto sem matrícula |
| 18436 | 682 (id 15) | DB5-P-24149 (11886) / sem matrícula | DB5-P-24148 (11887) / sem matrícula | ponto sem matrícula |
| 18437 | 682 (id 15) | DB5-P-24148 (11887) / sem matrícula | DB5-P-24147 (11888) / sem matrícula | ponto sem matrícula |
| 18438 | 682 (id 15) | DB5-P-24147 (11888) / sem matrícula | DB5-P-24146 (11889) / sem matrícula | ponto sem matrícula |
| 18439 | 682 (id 15) | DB5-P-24146 (11889) / sem matrícula | DB5-P-24145 (11890) / sem matrícula | ponto sem matrícula |
| 18440 | 682 (id 15) | DB5-P-24145 (11890) / sem matrícula | DB5-P-24144 (11891) / sem matrícula | ponto sem matrícula |
| 18441 | 682 (id 15) | DB5-P-24144 (11891) / sem matrícula | DB5-P-24143 (11892) / sem matrícula | ponto sem matrícula |
| 18442 | 682 (id 15) | DB5-P-24143 (11892) / sem matrícula | DB5-P-24142 (11893) / sem matrícula | ponto sem matrícula |
| 18443 | 682 (id 15) | DB5-P-24142 (11893) / sem matrícula | DB5-P-24141 (11894) / sem matrícula | ponto sem matrícula |
| 18444 | 682 (id 15) | DB5-P-24141 (11894) / sem matrícula | DB5-P-24140 (11895) / sem matrícula | ponto sem matrícula |
| 18445 | 682 (id 15) | DB5-P-24140 (11895) / sem matrícula | DB5-P-24139 (11896) / sem matrícula | ponto sem matrícula |
| 18446 | 682 (id 15) | DB5-P-24139 (11896) / sem matrícula | DB5-P-24138 (11897) / sem matrícula | ponto sem matrícula |
| 18447 | 682 (id 15) | DB5-P-24138 (11897) / sem matrícula | DB5-P-24137 (11898) / sem matrícula | ponto sem matrícula |
| 18448 | 682 (id 15) | DB5-P-24137 (11898) / sem matrícula | DB5-P-24136 (11899) / sem matrícula | ponto sem matrícula |
| 18449 | 682 (id 15) | DB5-P-24136 (11899) / sem matrícula | DB5-P-24135 (11900) / sem matrícula | ponto sem matrícula |
| 18450 | 682 (id 15) | DB5-P-24135 (11900) / sem matrícula | DB5-P-24134 (11901) / sem matrícula | ponto sem matrícula |
| 18451 | 682 (id 15) | DB5-P-24134 (11901) / sem matrícula | DB5-P-24133 (11902) / sem matrícula | ponto sem matrícula |
| 18452 | 682 (id 15) | DB5-P-24133 (11902) / sem matrícula | DB5-P-24132 (11903) / sem matrícula | ponto sem matrícula |
| 18453 | 682 (id 15) | DB5-P-24132 (11903) / sem matrícula | DB5-P-24131 (11904) / sem matrícula | ponto sem matrícula |
| 18454 | 682 (id 15) | DB5-P-24131 (11904) / sem matrícula | DB5-P-24130 (11905) / sem matrícula | ponto sem matrícula |
| 18455 | 682 (id 15) | DB5-P-24130 (11905) / sem matrícula | DB5-P-24129 (11906) / sem matrícula | ponto sem matrícula |
| 18456 | 682 (id 15) | DB5-P-24129 (11906) / sem matrícula | DB5-P-24128 (11907) / sem matrícula | ponto sem matrícula |
| 18457 | 682 (id 15) | DB5-P-24128 (11907) / sem matrícula | DB5-P-24127 (11908) / sem matrícula | ponto sem matrícula |
| 18458 | 682 (id 15) | DB5-P-24127 (11908) / sem matrícula | DB5-P-24126 (11909) / sem matrícula | ponto sem matrícula |
| 18459 | 682 (id 15) | DB5-P-24126 (11909) / sem matrícula | DB5-P-24125 (11910) / sem matrícula | ponto sem matrícula |
| 18460 | 682 (id 15) | DB5-P-24125 (11910) / sem matrícula | DB5-P-24124 (11911) / sem matrícula | ponto sem matrícula |
| 18461 | 682 (id 15) | DB5-P-24124 (11911) / sem matrícula | DB5-P-24123 (11912) / sem matrícula | ponto sem matrícula |
| 18462 | 682 (id 15) | DB5-P-24123 (11912) / sem matrícula | DB5-P-24122 (11913) / sem matrícula | ponto sem matrícula |
| 18463 | 682 (id 15) | DB5-P-24122 (11913) / sem matrícula | DB5-P-24121 (11914) / sem matrícula | ponto sem matrícula |
| 18464 | 682 (id 15) | DB5-P-24121 (11914) / sem matrícula | DB5-P-24120 (11915) / sem matrícula | ponto sem matrícula |
| 18465 | 682 (id 15) | DB5-P-24120 (11915) / sem matrícula | DB5-P-24119 (11916) / sem matrícula | ponto sem matrícula |
| 18466 | 682 (id 15) | DB5-P-24119 (11916) / sem matrícula | DB5-P-24118 (11917) / sem matrícula | ponto sem matrícula |
| 18467 | 682 (id 15) | DB5-P-24118 (11917) / sem matrícula | DB5-P-24117 (11918) / sem matrícula | ponto sem matrícula |
| 18468 | 682 (id 15) | DB5-P-24117 (11918) / sem matrícula | DB5-P-24116 (11919) / sem matrícula | ponto sem matrícula |
| 18469 | 682 (id 15) | DB5-P-24116 (11919) / sem matrícula | DB5-P-24115 (11920) / sem matrícula | ponto sem matrícula |
| 18470 | 682 (id 15) | DB5-P-24115 (11920) / sem matrícula | DB5-P-24114 (11921) / sem matrícula | ponto sem matrícula |
| 18471 | 682 (id 15) | DB5-P-24114 (11921) / sem matrícula | DB5-P-24113 (11922) / sem matrícula | ponto sem matrícula |
| 18472 | 682 (id 15) | DB5-P-24113 (11922) / sem matrícula | DB5-P-24112 (11923) / sem matrícula | ponto sem matrícula |
| 18473 | 682 (id 15) | DB5-P-24112 (11923) / sem matrícula | DB5-P-24111 (11924) / sem matrícula | ponto sem matrícula |
| 18474 | 682 (id 15) | DB5-P-24111 (11924) / sem matrícula | DB5-P-24110 (11925) / sem matrícula | ponto sem matrícula |
| 18475 | 682 (id 15) | DB5-P-24110 (11925) / sem matrícula | DB5-P-24109 (11926) / sem matrícula | ponto sem matrícula |
| 18476 | 682 (id 15) | DB5-P-24109 (11926) / sem matrícula | DB5-P-24108 (11927) / sem matrícula | ponto sem matrícula |
| 18477 | 682 (id 15) | DB5-P-24108 (11927) / sem matrícula | DB5-P-24107 (11928) / sem matrícula | ponto sem matrícula |
| 18478 | 682 (id 15) | DB5-P-24107 (11928) / sem matrícula | DB5-P-24106 (11929) / sem matrícula | ponto sem matrícula |
| 18479 | 682 (id 15) | DB5-P-24106 (11929) / sem matrícula | DB5-P-24105 (11930) / sem matrícula | ponto sem matrícula |
| 18480 | 682 (id 15) | DB5-P-24105 (11930) / sem matrícula | DB5-P-24104 (11931) / sem matrícula | ponto sem matrícula |
| 18481 | 682 (id 15) | DB5-P-24104 (11931) / sem matrícula | DB5-P-24103 (11932) / sem matrícula | ponto sem matrícula |
| 18482 | 682 (id 15) | DB5-P-24103 (11932) / sem matrícula | DB5-P-24102 (11933) / sem matrícula | ponto sem matrícula |
| 18483 | 682 (id 15) | DB5-P-24102 (11933) / sem matrícula | DB5-P-24101 (11934) / sem matrícula | ponto sem matrícula |
| 18484 | 682 (id 15) | DB5-P-24101 (11934) / sem matrícula | DB5-P-24100 (11935) / sem matrícula | ponto sem matrícula |
| 18485 | 682 (id 15) | DB5-P-24100 (11935) / sem matrícula | DB5-P-24099 (11936) / sem matrícula | ponto sem matrícula |
| 18486 | 682 (id 15) | DB5-P-24099 (11936) / sem matrícula | DB5-P-24098 (11937) / sem matrícula | ponto sem matrícula |
| 18487 | 682 (id 15) | DB5-P-24098 (11937) / sem matrícula | DB5-P-24097 (11938) / sem matrícula | ponto sem matrícula |
| 18488 | 682 (id 15) | DB5-P-24097 (11938) / sem matrícula | DB5-P-24096 (11939) / sem matrícula | ponto sem matrícula |
| 18489 | 682 (id 15) | DB5-P-24096 (11939) / sem matrícula | DB5-P-24095 (11940) / sem matrícula | ponto sem matrícula |
| 18490 | 682 (id 15) | DB5-P-24095 (11940) / sem matrícula | DB5-P-24094 (11941) / sem matrícula | ponto sem matrícula |
| 18491 | 682 (id 15) | DB5-P-24094 (11941) / sem matrícula | DB5-P-24093 (11942) / sem matrícula | ponto sem matrícula |
| 18492 | 682 (id 15) | DB5-P-24093 (11942) / sem matrícula | DB5-P-24092 (11943) / sem matrícula | ponto sem matrícula |
| 18493 | 682 (id 15) | DB5-P-24092 (11943) / sem matrícula | DB5-P-24091 (11944) / sem matrícula | ponto sem matrícula |
| 18494 | 682 (id 15) | DB5-P-24091 (11944) / sem matrícula | DB5-P-24090 (11945) / sem matrícula | ponto sem matrícula |
| 18495 | 682 (id 15) | DB5-P-24090 (11945) / sem matrícula | DB5-P-24089 (11946) / sem matrícula | ponto sem matrícula |
| 18496 | 682 (id 15) | DB5-P-24089 (11946) / sem matrícula | DB5-P-24088 (11947) / sem matrícula | ponto sem matrícula |
| 18497 | 682 (id 15) | DB5-P-24088 (11947) / sem matrícula | DB5-P-24087 (11948) / sem matrícula | ponto sem matrícula |
| 18498 | 682 (id 15) | DB5-P-24087 (11948) / sem matrícula | DB5-P-24086 (11949) / sem matrícula | ponto sem matrícula |
| 18499 | 682 (id 15) | DB5-P-24086 (11949) / sem matrícula | DB5-P-24085 (11950) / sem matrícula | ponto sem matrícula |
| 18500 | 682 (id 15) | DB5-P-24085 (11950) / sem matrícula | DB5-P-24084 (11951) / sem matrícula | ponto sem matrícula |
| 18501 | 682 (id 15) | DB5-P-24084 (11951) / sem matrícula | DB5-P-24083 (11952) / sem matrícula | ponto sem matrícula |
| 18502 | 682 (id 15) | DB5-P-24083 (11952) / sem matrícula | DB5-P-24082 (11953) / sem matrícula | ponto sem matrícula |
| 18503 | 682 (id 15) | DB5-P-24082 (11953) / sem matrícula | DB5-P-24081 (11954) / sem matrícula | ponto sem matrícula |
| 18504 | 682 (id 15) | DB5-P-24081 (11954) / sem matrícula | DB5-P-24080 (11955) / sem matrícula | ponto sem matrícula |
| 18505 | 682 (id 15) | DB5-P-24080 (11955) / sem matrícula | DB5-P-24079 (11956) / sem matrícula | ponto sem matrícula |
| 18506 | 682 (id 15) | DB5-P-24079 (11956) / sem matrícula | DB5-P-24078 (11957) / sem matrícula | ponto sem matrícula |
| 18507 | 682 (id 15) | DB5-P-24078 (11957) / sem matrícula | DB5-P-24077 (11958) / sem matrícula | ponto sem matrícula |
| 18508 | 682 (id 15) | DB5-P-24077 (11958) / sem matrícula | DB5-P-24076 (11959) / sem matrícula | ponto sem matrícula |
| 18509 | 682 (id 15) | DB5-P-24076 (11959) / sem matrícula | DB5-P-24075 (11960) / sem matrícula | ponto sem matrícula |
| 18510 | 682 (id 15) | DB5-P-24075 (11960) / sem matrícula | DB5-P-24074 (11961) / sem matrícula | ponto sem matrícula |
| 18511 | 682 (id 15) | DB5-P-24074 (11961) / sem matrícula | DB5-P-24073 (11962) / sem matrícula | ponto sem matrícula |
| 18512 | 682 (id 15) | DB5-P-24073 (11962) / sem matrícula | DB5-P-24072 (11963) / sem matrícula | ponto sem matrícula |
| 18513 | 682 (id 15) | DB5-P-24072 (11963) / sem matrícula | DB5-P-3072 (11964) / sem matrícula | ponto sem matrícula |
| 18514 | 682 (id 15) | DB5-P-3072 (11964) / sem matrícula | DB5-P-3073 (11965) / sem matrícula | ponto sem matrícula |
| 18515 | 682 (id 15) | DB5-P-3073 (11965) / sem matrícula | DB5-P-3074 (11966) / sem matrícula | ponto sem matrícula |
| 18516 | 682 (id 15) | DB5-P-3074 (11966) / sem matrícula | DB5-P-3075 (11967) / sem matrícula | ponto sem matrícula |
| 18517 | 682 (id 15) | DB5-P-3075 (11967) / sem matrícula | DB5-P-3076 (11968) / sem matrícula | ponto sem matrícula |
| 18518 | 682 (id 15) | DB5-P-3076 (11968) / sem matrícula | DB5-P-3077 (11969) / sem matrícula | ponto sem matrícula |
| 18519 | 682 (id 15) | DB5-P-3077 (11969) / sem matrícula | DB5-P-3078 (11970) / sem matrícula | ponto sem matrícula |
| 18520 | 682 (id 15) | DB5-P-3078 (11970) / sem matrícula | DB5-P-3079 (11971) / sem matrícula | ponto sem matrícula |
| 18521 | 682 (id 15) | DB5-P-3079 (11971) / sem matrícula | DB5-P-3080 (11972) / sem matrícula | ponto sem matrícula |
| 18522 | 682 (id 15) | DB5-P-3080 (11972) / sem matrícula | DB5-P-3081 (11973) / sem matrícula | ponto sem matrícula |
| 18523 | 682 (id 15) | DB5-P-3081 (11973) / sem matrícula | DB5-P-3082 (11974) / sem matrícula | ponto sem matrícula |
| 18524 | 682 (id 15) | DB5-P-3082 (11974) / sem matrícula | DB5-P-3083 (11975) / sem matrícula | ponto sem matrícula |
| 18525 | 682 (id 15) | DB5-P-3083 (11975) / sem matrícula | DB5-P-3084 (11976) / sem matrícula | ponto sem matrícula |
| 18526 | 682 (id 15) | DB5-P-3084 (11976) / sem matrícula | DB5-P-3085 (11977) / sem matrícula | ponto sem matrícula |
| 18527 | 682 (id 15) | DB5-P-3085 (11977) / sem matrícula | DB5-P-3086 (11978) / sem matrícula | ponto sem matrícula |
| 18528 | 682 (id 15) | DB5-P-3086 (11978) / sem matrícula | DB5-P-3087 (11979) / sem matrícula | ponto sem matrícula |
| 18529 | 682 (id 15) | DB5-P-3087 (11979) / sem matrícula | DB5-P-3088 (11980) / sem matrícula | ponto sem matrícula |
| 18530 | 682 (id 15) | DB5-P-3088 (11980) / sem matrícula | DB5-P-3089 (11981) / sem matrícula | ponto sem matrícula |
| 18531 | 682 (id 15) | DB5-P-3089 (11981) / sem matrícula | DB5-P-3090 (11982) / sem matrícula | ponto sem matrícula |
| 18532 | 682 (id 15) | DB5-P-3090 (11982) / sem matrícula | DB5-P-3091 (11983) / sem matrícula | ponto sem matrícula |
| 18533 | 682 (id 15) | DB5-P-3091 (11983) / sem matrícula | DB5-P-3092 (11984) / sem matrícula | ponto sem matrícula |
| 18534 | 682 (id 15) | DB5-P-3092 (11984) / sem matrícula | DB5-P-3093 (11985) / sem matrícula | ponto sem matrícula |
| 18535 | 682 (id 15) | DB5-P-3093 (11985) / sem matrícula | DB5-P-3094 (11986) / sem matrícula | ponto sem matrícula |
| 18536 | 682 (id 15) | DB5-P-3094 (11986) / sem matrícula | DB5-P-3095 (11987) / sem matrícula | ponto sem matrícula |
| 18537 | 682 (id 15) | DB5-P-3095 (11987) / sem matrícula | DB5-P-3096 (11988) / sem matrícula | ponto sem matrícula |
| 18538 | 682 (id 15) | DB5-P-3096 (11988) / sem matrícula | DB5-P-3097 (11989) / sem matrícula | ponto sem matrícula |
| 18539 | 682 (id 15) | DB5-P-3097 (11989) / sem matrícula | DB5-P-3098 (11990) / sem matrícula | ponto sem matrícula |
| 18540 | 682 (id 15) | DB5-P-3098 (11990) / sem matrícula | DB5-P-3099 (11991) / sem matrícula | ponto sem matrícula |
| 18541 | 682 (id 15) | DB5-P-3099 (11991) / sem matrícula | XRXR-P-0068 (11992) / sem matrícula | ponto sem matrícula |
| 18542 | 682 (id 15) | XRXR-P-0068 (11992) / sem matrícula | UAUX-P-16746 (11993) / sem matrícula | ponto sem matrícula |
| 18543 | 682 (id 15) | UAUX-P-16746 (11993) / sem matrícula | UAUX-P-16745 (11994) / sem matrícula | ponto sem matrícula |
| 18544 | 682 (id 15) | UAUX-P-16745 (11994) / sem matrícula | UAUX-P-16744 (11995) / sem matrícula | ponto sem matrícula |
| 18545 | 682 (id 15) | UAUX-P-16744 (11995) / sem matrícula | UAUX-P-16743 (11996) / sem matrícula | ponto sem matrícula |
| 18546 | 682 (id 15) | UAUX-P-16743 (11996) / sem matrícula | UAUX-P-16742 (11997) / sem matrícula | ponto sem matrícula |
| 18547 | 682 (id 15) | UAUX-P-16742 (11997) / sem matrícula | UAUX-P-16741 (11998) / sem matrícula | ponto sem matrícula |
| 18548 | 682 (id 15) | UAUX-P-16741 (11998) / sem matrícula | UAUX-P-16740 (11999) / sem matrícula | ponto sem matrícula |
| 18549 | 682 (id 15) | UAUX-P-16740 (11999) / sem matrícula | UAUX-P-16739 (12000) / sem matrícula | ponto sem matrícula |
| 18550 | 682 (id 15) | UAUX-P-16739 (12000) / sem matrícula | UAUX-P-16738 (12001) / sem matrícula | ponto sem matrícula |
| 18551 | 682 (id 15) | UAUX-P-16738 (12001) / sem matrícula | UAUX-P-16737 (12002) / sem matrícula | ponto sem matrícula |
| 18552 | 682 (id 15) | UAUX-P-16737 (12002) / sem matrícula | UAUX-P-16736 (12003) / sem matrícula | ponto sem matrícula |
| 18553 | 682 (id 15) | UAUX-P-16736 (12003) / sem matrícula | UAUX-P-16735 (12004) / sem matrícula | ponto sem matrícula |
| 18554 | 682 (id 15) | UAUX-P-16735 (12004) / sem matrícula | UAUX-P-16734 (12005) / sem matrícula | ponto sem matrícula |
| 18555 | 682 (id 15) | UAUX-P-16734 (12005) / sem matrícula | UAUX-P-16733 (12006) / sem matrícula | ponto sem matrícula |
| 18556 | 682 (id 15) | UAUX-P-16733 (12006) / sem matrícula | UAUX-P-16732 (12007) / sem matrícula | ponto sem matrícula |
| 18557 | 682 (id 15) | UAUX-P-16732 (12007) / sem matrícula | UAUX-P-16731 (12008) / sem matrícula | ponto sem matrícula |
| 18558 | 682 (id 15) | UAUX-P-16731 (12008) / sem matrícula | UAUX-V-5189 (12009) / sem matrícula | ponto sem matrícula |
| 18559 | 682 (id 15) | UAUX-V-5189 (12009) / sem matrícula | UAUX-P-16730 (12010) / sem matrícula | ponto sem matrícula |
| 18560 | 682 (id 15) | UAUX-P-16730 (12010) / sem matrícula | UAUX-P-16729 (12011) / sem matrícula | ponto sem matrícula |
| 18561 | 682 (id 15) | UAUX-P-16729 (12011) / sem matrícula | UAUX-P-16728 (12012) / sem matrícula | ponto sem matrícula |
| 18562 | 682 (id 15) | UAUX-P-16728 (12012) / sem matrícula | UAUX-P-16727 (12013) / sem matrícula | ponto sem matrícula |
| 18563 | 682 (id 15) | UAUX-P-16727 (12013) / sem matrícula | UAUX-P-16726 (12014) / sem matrícula | ponto sem matrícula |
| 18564 | 682 (id 15) | UAUX-P-16726 (12014) / sem matrícula | UAUX-P-16725 (12015) / sem matrícula | ponto sem matrícula |
| 18565 | 682 (id 15) | UAUX-P-16725 (12015) / sem matrícula | UAUX-P-16724 (12016) / sem matrícula | ponto sem matrícula |
| 18566 | 682 (id 15) | UAUX-P-16724 (12016) / sem matrícula | UAUX-P-16723 (12017) / sem matrícula | ponto sem matrícula |
| 18567 | 682 (id 15) | UAUX-P-16723 (12017) / sem matrícula | UAUX-P-16722 (12018) / sem matrícula | ponto sem matrícula |
| 18568 | 682 (id 15) | UAUX-P-16722 (12018) / sem matrícula | UAUX-P-16721 (12019) / sem matrícula | ponto sem matrícula |
| 18569 | 682 (id 15) | UAUX-P-16721 (12019) / sem matrícula | UAUX-P-16720 (12020) / sem matrícula | ponto sem matrícula |
| 18570 | 682 (id 15) | UAUX-P-16720 (12020) / sem matrícula | UAUX-P-16719 (12021) / sem matrícula | ponto sem matrícula |
| 18571 | 682 (id 15) | UAUX-P-16719 (12021) / sem matrícula | UAUX-P-16718 (12022) / sem matrícula | ponto sem matrícula |
| 18572 | 682 (id 15) | UAUX-P-16718 (12022) / sem matrícula | UAUX-P-16717 (12023) / sem matrícula | ponto sem matrícula |
| 18573 | 682 (id 15) | UAUX-P-16717 (12023) / sem matrícula | UAUX-P-16716 (12024) / sem matrícula | ponto sem matrícula |
| 18574 | 682 (id 15) | UAUX-P-16716 (12024) / sem matrícula | UAUX-P-16715 (12025) / sem matrícula | ponto sem matrícula |
| 18575 | 682 (id 15) | UAUX-P-16715 (12025) / sem matrícula | UAUX-P-16714 (12026) / sem matrícula | ponto sem matrícula |
| 18576 | 682 (id 15) | UAUX-P-16714 (12026) / sem matrícula | UAUX-P-16713 (12027) / sem matrícula | ponto sem matrícula |
| 18577 | 682 (id 15) | UAUX-P-16713 (12027) / sem matrícula | UAUX-P-16712 (12028) / sem matrícula | ponto sem matrícula |
| 18578 | 682 (id 15) | UAUX-P-16712 (12028) / sem matrícula | UAUX-P-16711 (12029) / sem matrícula | ponto sem matrícula |
| 18579 | 682 (id 15) | UAUX-P-16711 (12029) / sem matrícula | UAUX-P-16710 (12030) / sem matrícula | ponto sem matrícula |
| 18580 | 682 (id 15) | UAUX-P-16710 (12030) / sem matrícula | UAUX-P-16709 (12031) / sem matrícula | ponto sem matrícula |
| 18581 | 682 (id 15) | UAUX-P-16709 (12031) / sem matrícula | UAUX-P-16708 (12032) / sem matrícula | ponto sem matrícula |
| 18582 | 682 (id 15) | UAUX-P-16708 (12032) / sem matrícula | UAUX-P-16707 (12033) / sem matrícula | ponto sem matrícula |
| 18583 | 682 (id 15) | UAUX-P-16707 (12033) / sem matrícula | UAUX-P-16706 (12034) / sem matrícula | ponto sem matrícula |
| 18584 | 682 (id 15) | UAUX-P-16706 (12034) / sem matrícula | UAUX-P-16705 (12035) / sem matrícula | ponto sem matrícula |
| 18585 | 682 (id 15) | UAUX-P-16705 (12035) / sem matrícula | UAUX-P-16704 (12036) / sem matrícula | ponto sem matrícula |
| 18586 | 682 (id 15) | UAUX-P-16704 (12036) / sem matrícula | UAUX-P-16703 (12037) / sem matrícula | ponto sem matrícula |
| 18587 | 682 (id 15) | UAUX-P-16703 (12037) / sem matrícula | UAUX-P-16702 (12038) / sem matrícula | ponto sem matrícula |
| 18588 | 682 (id 15) | UAUX-P-16702 (12038) / sem matrícula | UAUX-P-16701 (12039) / sem matrícula | ponto sem matrícula |
| 18589 | 682 (id 15) | UAUX-P-16701 (12039) / sem matrícula | UAUX-P-16700 (12040) / sem matrícula | ponto sem matrícula |
| 18590 | 682 (id 15) | UAUX-P-16700 (12040) / sem matrícula | UAUX-P-16699 (12041) / sem matrícula | ponto sem matrícula |
| 18591 | 682 (id 15) | UAUX-P-16699 (12041) / sem matrícula | UAUX-P-16698 (12042) / sem matrícula | ponto sem matrícula |
| 18592 | 682 (id 15) | UAUX-P-16698 (12042) / sem matrícula | UAUX-P-16697 (12043) / sem matrícula | ponto sem matrícula |
| 18593 | 682 (id 15) | UAUX-P-16697 (12043) / sem matrícula | UAUX-P-16696 (12044) / sem matrícula | ponto sem matrícula |
| 18594 | 682 (id 15) | UAUX-P-16696 (12044) / sem matrícula | UAUX-P-16695 (12045) / sem matrícula | ponto sem matrícula |
| 18595 | 682 (id 15) | UAUX-P-16695 (12045) / sem matrícula | UAUX-P-16694 (12046) / sem matrícula | ponto sem matrícula |
| 18596 | 682 (id 15) | UAUX-P-16694 (12046) / sem matrícula | UAUX-P-16693 (12047) / sem matrícula | ponto sem matrícula |
| 18597 | 682 (id 15) | UAUX-P-16693 (12047) / sem matrícula | UAUX-V-5188 (12048) / sem matrícula | ponto sem matrícula |
| 18598 | 682 (id 15) | UAUX-V-5188 (12048) / sem matrícula | XRXR-P-0069 (12049) / sem matrícula | ponto sem matrícula |
| 18599 | 682 (id 15) | XRXR-P-0069 (12049) / sem matrícula | XRXR-P-0070 (12050) / sem matrícula | ponto sem matrícula |
| 18600 | 682 (id 15) | XRXR-P-0070 (12050) / sem matrícula | XRXR-P-0071 (12051) / sem matrícula | ponto sem matrícula |
| 18601 | 682 (id 15) | XRXR-P-0071 (12051) / sem matrícula | XRXR-P-0072 (12052) / sem matrícula | ponto sem matrícula |
| 18602 | 682 (id 15) | XRXR-P-0072 (12052) / sem matrícula | XRXR-P-0073 (12053) / sem matrícula | ponto sem matrícula |
| 18603 | 682 (id 15) | XRXR-P-0073 (12053) / sem matrícula | XRXR-P-0074 (12054) / sem matrícula | ponto sem matrícula |
| 18604 | 682 (id 15) | XRXR-P-0074 (12054) / sem matrícula | XRXR-P-0075 (12055) / sem matrícula | ponto sem matrícula |
| 18605 | 682 (id 15) | XRXR-P-0075 (12055) / sem matrícula | XRXR-P-0076 (12056) / sem matrícula | ponto sem matrícula |
| 18606 | 682 (id 15) | XRXR-P-0076 (12056) / sem matrícula | XRXR-P-0077 (12057) / sem matrícula | ponto sem matrícula |
| 18607 | 682 (id 15) | XRXR-P-0077 (12057) / sem matrícula | XRXR-P-0078 (12058) / sem matrícula | ponto sem matrícula |
| 18608 | 682 (id 15) | XRXR-P-0078 (12058) / sem matrícula | XRXR-P-0079 (12059) / sem matrícula | ponto sem matrícula |
| 18609 | 682 (id 15) | XRXR-P-0079 (12059) / sem matrícula | XRXR-P-0080 (12060) / sem matrícula | ponto sem matrícula |
| 18610 | 682 (id 15) | XRXR-P-0080 (12060) / sem matrícula | XRXR-P-0081 (12061) / sem matrícula | ponto sem matrícula |
| 18611 | 682 (id 15) | XRXR-P-0081 (12061) / sem matrícula | XRXR-P-0082 (12062) / sem matrícula | ponto sem matrícula |
| 18612 | 682 (id 15) | XRXR-P-0082 (12062) / sem matrícula | XRXR-P-0083 (12063) / sem matrícula | ponto sem matrícula |
| 18613 | 682 (id 15) | XRXR-P-0083 (12063) / sem matrícula | XRXR-P-0084 (12064) / sem matrícula | ponto sem matrícula |
| 18614 | 682 (id 15) | XRXR-P-0084 (12064) / sem matrícula | XRXR-P-0085 (12065) / sem matrícula | ponto sem matrícula |
| 18615 | 682 (id 15) | XRXR-P-0085 (12065) / sem matrícula | XRXR-P-0086 (12066) / sem matrícula | ponto sem matrícula |
| 18616 | 682 (id 15) | XRXR-P-0086 (12066) / sem matrícula | XRXR-P-0087 (12067) / sem matrícula | ponto sem matrícula |
| 18617 | 682 (id 15) | XRXR-P-0087 (12067) / sem matrícula | XRXR-P-0088 (12068) / sem matrícula | ponto sem matrícula |
| 18618 | 682 (id 15) | XRXR-P-0088 (12068) / sem matrícula | XRXR-V-0032 (11875) / sem matrícula | ponto sem matrícula |

</details>

### Levantamento 17 — Fazenda Douradina (EM_ANDAMENTO)

Pontos no levantamento: 431 (com matrícula: 0); segmentos: 162.

| Matrícula do segmento | Causa | Segmentos |
|---|---|---|
| 7720 (id 16) | ponto sem matrícula | 145 |
| 4980 (id 17) | ponto sem matrícula | 17 |

<details><summary>Segmentos</summary>

| Segmento | Matrícula | Início (id) / matrícula | Fim (id) / matrícula | Causa |
|---|---|---|---|---|
| 21242 | 7720 (id 16) | XRXR-V-0097 (13360) / sem matrícula | XRXR-V-0098 (13361) / sem matrícula | ponto sem matrícula |
| 21243 | 7720 (id 16) | XRXR-V-0098 (13361) / sem matrícula | XRXR-V-0099 (13362) / sem matrícula | ponto sem matrícula |
| 21244 | 7720 (id 16) | XRXR-V-0099 (13362) / sem matrícula | XRXR-V-0100 (13363) / sem matrícula | ponto sem matrícula |
| 21245 | 7720 (id 16) | XRXR-V-0100 (13363) / sem matrícula | XRXR-V-0101 (13364) / sem matrícula | ponto sem matrícula |
| 21246 | 7720 (id 16) | XRXR-V-0101 (13364) / sem matrícula | XRXR-V-0102 (13365) / sem matrícula | ponto sem matrícula |
| 21247 | 7720 (id 16) | XRXR-V-0102 (13365) / sem matrícula | XRXR-V-0103 (13366) / sem matrícula | ponto sem matrícula |
| 21248 | 7720 (id 16) | XRXR-V-0103 (13366) / sem matrícula | XRXR-V-0104 (13367) / sem matrícula | ponto sem matrícula |
| 21249 | 7720 (id 16) | XRXR-V-0104 (13367) / sem matrícula | XRXR-V-0105 (13368) / sem matrícula | ponto sem matrícula |
| 21250 | 7720 (id 16) | XRXR-V-0105 (13368) / sem matrícula | XRXR-V-0106 (13369) / sem matrícula | ponto sem matrícula |
| 21251 | 7720 (id 16) | XRXR-V-0106 (13369) / sem matrícula | XRXR-V-0107 (13370) / sem matrícula | ponto sem matrícula |
| 21252 | 7720 (id 16) | XRXR-V-0107 (13370) / sem matrícula | XRXR-V-0049 (13371) / sem matrícula | ponto sem matrícula |
| 21253 | 7720 (id 16) | XRXR-V-0049 (13371) / sem matrícula | XRXR-V-0050 (13372) / sem matrícula | ponto sem matrícula |
| 21254 | 7720 (id 16) | XRXR-V-0050 (13372) / sem matrícula | XRXR-V-0051 (13373) / sem matrícula | ponto sem matrícula |
| 21255 | 7720 (id 16) | XRXR-V-0051 (13373) / sem matrícula | XRXR-V-0052 (13374) / sem matrícula | ponto sem matrícula |
| 21256 | 7720 (id 16) | XRXR-V-0052 (13374) / sem matrícula | XRXR-V-0053 (13375) / sem matrícula | ponto sem matrícula |
| 21257 | 7720 (id 16) | XRXR-V-0053 (13375) / sem matrícula | XRXR-V-0054 (13376) / sem matrícula | ponto sem matrícula |
| 21258 | 7720 (id 16) | XRXR-V-0054 (13376) / sem matrícula | XRXR-V-0055 (13377) / sem matrícula | ponto sem matrícula |
| 21259 | 7720 (id 16) | XRXR-V-0055 (13377) / sem matrícula | XRXR-V-0109 (13378) / sem matrícula | ponto sem matrícula |
| 21260 | 7720 (id 16) | XRXR-V-0109 (13378) / sem matrícula | XRXR-V-0110 (13379) / sem matrícula | ponto sem matrícula |
| 21261 | 7720 (id 16) | XRXR-V-0110 (13379) / sem matrícula | XRXR-V-0111 (13380) / sem matrícula | ponto sem matrícula |
| 21262 | 7720 (id 16) | XRXR-V-0111 (13380) / sem matrícula | XRXR-V-0056 (13381) / sem matrícula | ponto sem matrícula |
| 21263 | 7720 (id 16) | XRXR-V-0056 (13381) / sem matrícula | XRXR-V-0057 (13382) / sem matrícula | ponto sem matrícula |
| 21264 | 7720 (id 16) | XRXR-V-0057 (13382) / sem matrícula | XRXR-V-0058 (13383) / sem matrícula | ponto sem matrícula |
| 21265 | 7720 (id 16) | XRXR-V-0058 (13383) / sem matrícula | XRXR-V-0059 (13384) / sem matrícula | ponto sem matrícula |
| 21266 | 7720 (id 16) | XRXR-V-0059 (13384) / sem matrícula | XRXR-V-0060 (13385) / sem matrícula | ponto sem matrícula |
| 21267 | 7720 (id 16) | XRXR-V-0060 (13385) / sem matrícula | XRXR-V-0061 (13386) / sem matrícula | ponto sem matrícula |
| 21268 | 7720 (id 16) | XRXR-V-0061 (13386) / sem matrícula | XRXR-V-0062 (13387) / sem matrícula | ponto sem matrícula |
| 21269 | 7720 (id 16) | XRXR-V-0062 (13387) / sem matrícula | XRXR-V-0063 (13388) / sem matrícula | ponto sem matrícula |
| 21270 | 7720 (id 16) | XRXR-V-0063 (13388) / sem matrícula | XRXR-V-0064 (13389) / sem matrícula | ponto sem matrícula |
| 21271 | 7720 (id 16) | XRXR-V-0064 (13389) / sem matrícula | XRXR-V-0065 (13390) / sem matrícula | ponto sem matrícula |
| 21272 | 7720 (id 16) | XRXR-V-0065 (13390) / sem matrícula | XRXR-V-0066 (13391) / sem matrícula | ponto sem matrícula |
| 21273 | 7720 (id 16) | XRXR-V-0066 (13391) / sem matrícula | XRXR-V-0067 (13392) / sem matrícula | ponto sem matrícula |
| 21274 | 7720 (id 16) | XRXR-V-0067 (13392) / sem matrícula | XRXR-V-0068 (13393) / sem matrícula | ponto sem matrícula |
| 21275 | 7720 (id 16) | XRXR-V-0068 (13393) / sem matrícula | XRXR-V-0069 (13394) / sem matrícula | ponto sem matrícula |
| 21276 | 7720 (id 16) | XRXR-V-0069 (13394) / sem matrícula | XRXR-V-0070 (13395) / sem matrícula | ponto sem matrícula |
| 21277 | 7720 (id 16) | XRXR-V-0070 (13395) / sem matrícula | XRXR-V-0071 (13396) / sem matrícula | ponto sem matrícula |
| 21278 | 7720 (id 16) | XRXR-V-0071 (13396) / sem matrícula | XRXR-V-0072 (13397) / sem matrícula | ponto sem matrícula |
| 21279 | 7720 (id 16) | XRXR-V-0072 (13397) / sem matrícula | XRXR-V-0073 (13398) / sem matrícula | ponto sem matrícula |
| 21280 | 7720 (id 16) | XRXR-V-0073 (13398) / sem matrícula | XRXR-V-0074 (13399) / sem matrícula | ponto sem matrícula |
| 21281 | 7720 (id 16) | XRXR-V-0074 (13399) / sem matrícula | XRXR-V-0075 (13400) / sem matrícula | ponto sem matrícula |
| 21282 | 7720 (id 16) | XRXR-V-0075 (13400) / sem matrícula | XRXR-V-0076 (13401) / sem matrícula | ponto sem matrícula |
| 21283 | 7720 (id 16) | XRXR-V-0076 (13401) / sem matrícula | XRXR-V-0077 (13402) / sem matrícula | ponto sem matrícula |
| 21284 | 7720 (id 16) | XRXR-V-0077 (13402) / sem matrícula | XRXR-V-0078 (13403) / sem matrícula | ponto sem matrícula |
| 21285 | 7720 (id 16) | XRXR-V-0078 (13403) / sem matrícula | XRXR-V-0079 (13404) / sem matrícula | ponto sem matrícula |
| 21286 | 7720 (id 16) | XRXR-V-0079 (13404) / sem matrícula | XRXR-V-0080 (13405) / sem matrícula | ponto sem matrícula |
| 21287 | 7720 (id 16) | XRXR-V-0080 (13405) / sem matrícula | XRXR-V-0081 (13406) / sem matrícula | ponto sem matrícula |
| 21288 | 7720 (id 16) | XRXR-V-0081 (13406) / sem matrícula | XRXR-V-0082 (13407) / sem matrícula | ponto sem matrícula |
| 21289 | 7720 (id 16) | XRXR-V-0082 (13407) / sem matrícula | XRXR-V-0083 (13408) / sem matrícula | ponto sem matrícula |
| 21290 | 7720 (id 16) | XRXR-V-0083 (13408) / sem matrícula | XRXR-V-0084 (13409) / sem matrícula | ponto sem matrícula |
| 21291 | 7720 (id 16) | XRXR-V-0084 (13409) / sem matrícula | XRXR-V-0085 (13410) / sem matrícula | ponto sem matrícula |
| 21292 | 7720 (id 16) | XRXR-V-0085 (13410) / sem matrícula | XRXR-V-0086 (13411) / sem matrícula | ponto sem matrícula |
| 21293 | 7720 (id 16) | XRXR-V-0086 (13411) / sem matrícula | XRXR-V-0087 (13412) / sem matrícula | ponto sem matrícula |
| 21294 | 7720 (id 16) | XRXR-V-0087 (13412) / sem matrícula | XRXR-V-0088 (13413) / sem matrícula | ponto sem matrícula |
| 21295 | 7720 (id 16) | XRXR-V-0088 (13413) / sem matrícula | XRXR-V-0089 (13414) / sem matrícula | ponto sem matrícula |
| 21296 | 7720 (id 16) | XRXR-V-0089 (13414) / sem matrícula | XRXR-V-0090 (13415) / sem matrícula | ponto sem matrícula |
| 21297 | 7720 (id 16) | XRXR-V-0090 (13415) / sem matrícula | XRXR-V-0091 (13416) / sem matrícula | ponto sem matrícula |
| 21298 | 7720 (id 16) | XRXR-V-0091 (13416) / sem matrícula | XRXR-V-0092 (13417) / sem matrícula | ponto sem matrícula |
| 21299 | 7720 (id 16) | XRXR-V-0092 (13417) / sem matrícula | XRXR-V-0093 (13418) / sem matrícula | ponto sem matrícula |
| 21300 | 7720 (id 16) | XRXR-V-0093 (13418) / sem matrícula | XRXR-P-0092 (13419) / sem matrícula | ponto sem matrícula |
| 21301 | 7720 (id 16) | XRXR-P-0092 (13419) / sem matrícula | XRXR-P-0093 (13420) / sem matrícula | ponto sem matrícula |
| 21302 | 7720 (id 16) | XRXR-P-0093 (13420) / sem matrícula | XRXR-P-0094 (13421) / sem matrícula | ponto sem matrícula |
| 21303 | 7720 (id 16) | XRXR-P-0094 (13421) / sem matrícula | XRXR-P-0095 (13422) / sem matrícula | ponto sem matrícula |
| 21304 | 7720 (id 16) | XRXR-P-0095 (13422) / sem matrícula | XRXR-P-0096 (13423) / sem matrícula | ponto sem matrícula |
| 21305 | 7720 (id 16) | XRXR-P-0096 (13423) / sem matrícula | XRXR-P-0097 (13424) / sem matrícula | ponto sem matrícula |
| 21306 | 7720 (id 16) | XRXR-P-0097 (13424) / sem matrícula | XRXR-P-0098 (13425) / sem matrícula | ponto sem matrícula |
| 21307 | 7720 (id 16) | XRXR-P-0098 (13425) / sem matrícula | XRXR-P-0099 (13426) / sem matrícula | ponto sem matrícula |
| 21308 | 7720 (id 16) | XRXR-P-0099 (13426) / sem matrícula | XRXR-P-0100 (13427) / sem matrícula | ponto sem matrícula |
| 21309 | 7720 (id 16) | XRXR-P-0100 (13427) / sem matrícula | XRXR-P-0101 (13428) / sem matrícula | ponto sem matrícula |
| 21310 | 7720 (id 16) | XRXR-P-0101 (13428) / sem matrícula | XRXR-P-0102 (13429) / sem matrícula | ponto sem matrícula |
| 21311 | 7720 (id 16) | XRXR-P-0102 (13429) / sem matrícula | XRXR-P-0103 (13430) / sem matrícula | ponto sem matrícula |
| 21312 | 7720 (id 16) | XRXR-P-0103 (13430) / sem matrícula | XRXR-P-0104 (13431) / sem matrícula | ponto sem matrícula |
| 21313 | 7720 (id 16) | XRXR-P-0104 (13431) / sem matrícula | XRXR-P-0105 (13432) / sem matrícula | ponto sem matrícula |
| 21314 | 7720 (id 16) | XRXR-P-0105 (13432) / sem matrícula | XRXR-P-0106 (13433) / sem matrícula | ponto sem matrícula |
| 21315 | 7720 (id 16) | XRXR-P-0106 (13433) / sem matrícula | XRXR-P-0107 (13434) / sem matrícula | ponto sem matrícula |
| 21316 | 7720 (id 16) | XRXR-P-0107 (13434) / sem matrícula | XRXR-P-0108 (13435) / sem matrícula | ponto sem matrícula |
| 21317 | 7720 (id 16) | XRXR-P-0108 (13435) / sem matrícula | XRXR-P-0109 (13436) / sem matrícula | ponto sem matrícula |
| 21318 | 7720 (id 16) | XRXR-P-0109 (13436) / sem matrícula | XRXR-P-0110 (13437) / sem matrícula | ponto sem matrícula |
| 21319 | 7720 (id 16) | XRXR-P-0110 (13437) / sem matrícula | XRXR-P-0111 (13438) / sem matrícula | ponto sem matrícula |
| 21320 | 7720 (id 16) | XRXR-P-0111 (13438) / sem matrícula | XRXR-P-0112 (13439) / sem matrícula | ponto sem matrícula |
| 21321 | 7720 (id 16) | XRXR-P-0112 (13439) / sem matrícula | XRXR-P-0113 (13440) / sem matrícula | ponto sem matrícula |
| 21322 | 7720 (id 16) | XRXR-P-0113 (13440) / sem matrícula | XRXR-P-0114 (13441) / sem matrícula | ponto sem matrícula |
| 21323 | 7720 (id 16) | XRXR-P-0114 (13441) / sem matrícula | XRXR-P-0115 (13442) / sem matrícula | ponto sem matrícula |
| 21324 | 7720 (id 16) | XRXR-P-0115 (13442) / sem matrícula | XRXR-P-0116 (13443) / sem matrícula | ponto sem matrícula |
| 21325 | 7720 (id 16) | XRXR-P-0116 (13443) / sem matrícula | XRXR-P-0117 (13444) / sem matrícula | ponto sem matrícula |
| 21326 | 7720 (id 16) | XRXR-P-0117 (13444) / sem matrícula | XRXR-P-0118 (13445) / sem matrícula | ponto sem matrícula |
| 21327 | 7720 (id 16) | XRXR-P-0118 (13445) / sem matrícula | XRXR-P-0119 (13446) / sem matrícula | ponto sem matrícula |
| 21328 | 7720 (id 16) | XRXR-P-0119 (13446) / sem matrícula | XRXR-P-0120 (13447) / sem matrícula | ponto sem matrícula |
| 21329 | 7720 (id 16) | XRXR-P-0120 (13447) / sem matrícula | XRXR-P-0121 (13448) / sem matrícula | ponto sem matrícula |
| 21330 | 7720 (id 16) | XRXR-P-0121 (13448) / sem matrícula | XRXR-P-0122 (13449) / sem matrícula | ponto sem matrícula |
| 21331 | 7720 (id 16) | XRXR-P-0122 (13449) / sem matrícula | XRXR-P-0123 (13450) / sem matrícula | ponto sem matrícula |
| 21332 | 7720 (id 16) | XRXR-P-0123 (13450) / sem matrícula | XRXR-P-0124 (13451) / sem matrícula | ponto sem matrícula |
| 21333 | 7720 (id 16) | XRXR-P-0124 (13451) / sem matrícula | XRXR-P-0125 (13452) / sem matrícula | ponto sem matrícula |
| 21334 | 7720 (id 16) | XRXR-P-0125 (13452) / sem matrícula | XRXR-P-0126 (13453) / sem matrícula | ponto sem matrícula |
| 21335 | 7720 (id 16) | XRXR-P-0126 (13453) / sem matrícula | XRXR-P-0127 (13454) / sem matrícula | ponto sem matrícula |
| 21336 | 7720 (id 16) | XRXR-P-0127 (13454) / sem matrícula | XRXR-P-0128 (13455) / sem matrícula | ponto sem matrícula |
| 21337 | 7720 (id 16) | XRXR-P-0128 (13455) / sem matrícula | XRXR-P-0129 (13456) / sem matrícula | ponto sem matrícula |
| 21338 | 7720 (id 16) | XRXR-P-0129 (13456) / sem matrícula | XRXR-P-0130 (13457) / sem matrícula | ponto sem matrícula |
| 21339 | 7720 (id 16) | XRXR-P-0130 (13457) / sem matrícula | XRXR-P-0131 (13458) / sem matrícula | ponto sem matrícula |
| 21340 | 7720 (id 16) | XRXR-P-0131 (13458) / sem matrícula | XRXR-P-0132 (13459) / sem matrícula | ponto sem matrícula |
| 21341 | 7720 (id 16) | XRXR-P-0132 (13459) / sem matrícula | XRXR-P-0133 (13460) / sem matrícula | ponto sem matrícula |
| 21342 | 7720 (id 16) | XRXR-P-0133 (13460) / sem matrícula | XRXR-P-0134 (13461) / sem matrícula | ponto sem matrícula |
| 21343 | 7720 (id 16) | XRXR-P-0134 (13461) / sem matrícula | XRXR-P-0135 (13462) / sem matrícula | ponto sem matrícula |
| 21344 | 7720 (id 16) | XRXR-P-0135 (13462) / sem matrícula | XRXR-P-0136 (13463) / sem matrícula | ponto sem matrícula |
| 21345 | 7720 (id 16) | XRXR-P-0136 (13463) / sem matrícula | XRXR-P-0137 (13464) / sem matrícula | ponto sem matrícula |
| 21346 | 7720 (id 16) | XRXR-P-0137 (13464) / sem matrícula | XRXR-P-0138 (13465) / sem matrícula | ponto sem matrícula |
| 21347 | 7720 (id 16) | XRXR-P-0138 (13465) / sem matrícula | XRXR-P-0139 (13466) / sem matrícula | ponto sem matrícula |
| 21348 | 7720 (id 16) | XRXR-P-0139 (13466) / sem matrícula | XRXR-P-0140 (13467) / sem matrícula | ponto sem matrícula |
| 21349 | 7720 (id 16) | XRXR-P-0140 (13467) / sem matrícula | XRXR-P-0141 (13468) / sem matrícula | ponto sem matrícula |
| 21350 | 7720 (id 16) | XRXR-P-0141 (13468) / sem matrícula | XRXR-P-0142 (13469) / sem matrícula | ponto sem matrícula |
| 21351 | 7720 (id 16) | XRXR-P-0142 (13469) / sem matrícula | XRXR-P-0143 (13470) / sem matrícula | ponto sem matrícula |
| 21352 | 7720 (id 16) | XRXR-P-0143 (13470) / sem matrícula | XRXR-P-0144 (13471) / sem matrícula | ponto sem matrícula |
| 21353 | 7720 (id 16) | XRXR-P-0144 (13471) / sem matrícula | XRXR-P-0145 (13472) / sem matrícula | ponto sem matrícula |
| 21354 | 7720 (id 16) | XRXR-P-0145 (13472) / sem matrícula | XRXR-P-0146 (13473) / sem matrícula | ponto sem matrícula |
| 21355 | 7720 (id 16) | XRXR-P-0146 (13473) / sem matrícula | XRXR-P-0147 (13474) / sem matrícula | ponto sem matrícula |
| 21356 | 7720 (id 16) | XRXR-P-0147 (13474) / sem matrícula | XRXR-P-0148 (13475) / sem matrícula | ponto sem matrícula |
| 21357 | 7720 (id 16) | XRXR-P-0148 (13475) / sem matrícula | XRXR-P-0149 (13476) / sem matrícula | ponto sem matrícula |
| 21358 | 7720 (id 16) | XRXR-P-0149 (13476) / sem matrícula | XRXR-P-0150 (13477) / sem matrícula | ponto sem matrícula |
| 21359 | 7720 (id 16) | XRXR-P-0150 (13477) / sem matrícula | XRXR-P-0151 (13478) / sem matrícula | ponto sem matrícula |
| 21360 | 7720 (id 16) | XRXR-P-0151 (13478) / sem matrícula | XRXR-P-0152 (13479) / sem matrícula | ponto sem matrícula |
| 21361 | 7720 (id 16) | XRXR-P-0152 (13479) / sem matrícula | XRXR-P-0153 (13480) / sem matrícula | ponto sem matrícula |
| 21362 | 7720 (id 16) | XRXR-P-0153 (13480) / sem matrícula | XRXR-P-0154 (13481) / sem matrícula | ponto sem matrícula |
| 21363 | 7720 (id 16) | XRXR-P-0154 (13481) / sem matrícula | XRXR-P-0155 (13482) / sem matrícula | ponto sem matrícula |
| 21364 | 7720 (id 16) | XRXR-P-0155 (13482) / sem matrícula | XRXR-P-0156 (13483) / sem matrícula | ponto sem matrícula |
| 21365 | 7720 (id 16) | XRXR-P-0156 (13483) / sem matrícula | XRXR-P-0157 (13484) / sem matrícula | ponto sem matrícula |
| 21366 | 7720 (id 16) | XRXR-P-0157 (13484) / sem matrícula | XRXR-P-0158 (13485) / sem matrícula | ponto sem matrícula |
| 21367 | 7720 (id 16) | XRXR-P-0158 (13485) / sem matrícula | XRXR-P-0159 (13486) / sem matrícula | ponto sem matrícula |
| 21368 | 7720 (id 16) | XRXR-P-0159 (13486) / sem matrícula | XRXR-P-0160 (13487) / sem matrícula | ponto sem matrícula |
| 21369 | 7720 (id 16) | XRXR-P-0160 (13487) / sem matrícula | XRXR-P-0161 (13488) / sem matrícula | ponto sem matrícula |
| 21370 | 7720 (id 16) | XRXR-P-0161 (13488) / sem matrícula | XRXR-P-0162 (13489) / sem matrícula | ponto sem matrícula |
| 21371 | 7720 (id 16) | XRXR-P-0162 (13489) / sem matrícula | XRXR-P-0163 (13490) / sem matrícula | ponto sem matrícula |
| 21372 | 7720 (id 16) | XRXR-P-0163 (13490) / sem matrícula | XRXR-P-0164 (13491) / sem matrícula | ponto sem matrícula |
| 21373 | 7720 (id 16) | XRXR-P-0164 (13491) / sem matrícula | XRXR-P-0165 (13492) / sem matrícula | ponto sem matrícula |
| 21374 | 7720 (id 16) | XRXR-P-0165 (13492) / sem matrícula | XRXR-P-0166 (13493) / sem matrícula | ponto sem matrícula |
| 21375 | 7720 (id 16) | XRXR-P-0166 (13493) / sem matrícula | XRXR-P-0167 (13494) / sem matrícula | ponto sem matrícula |
| 21376 | 7720 (id 16) | XRXR-P-0167 (13494) / sem matrícula | XRXR-P-0168 (13495) / sem matrícula | ponto sem matrícula |
| 21377 | 7720 (id 16) | XRXR-P-0168 (13495) / sem matrícula | XRXR-P-0169 (13496) / sem matrícula | ponto sem matrícula |
| 21378 | 7720 (id 16) | XRXR-P-0169 (13496) / sem matrícula | XRXR-P-0170 (13497) / sem matrícula | ponto sem matrícula |
| 21379 | 7720 (id 16) | XRXR-P-0170 (13497) / sem matrícula | SDEX-P-5675 (13498) / sem matrícula | ponto sem matrícula |
| 21380 | 7720 (id 16) | SDEX-P-5675 (13498) / sem matrícula | SDEX-V-0104 (13499) / sem matrícula | ponto sem matrícula |
| 21381 | 7720 (id 16) | SDEX-V-0104 (13499) / sem matrícula | SDEX-M-0818 (13500) / sem matrícula | ponto sem matrícula |
| 21382 | 7720 (id 16) | SDEX-M-0818 (13500) / sem matrícula | SDEX-M-0817 (13501) / sem matrícula | ponto sem matrícula |
| 21383 | 7720 (id 16) | SDEX-M-0817 (13501) / sem matrícula | XRXR-V-0094 (13502) / sem matrícula | ponto sem matrícula |
| 21384 | 7720 (id 16) | XRXR-V-0094 (13502) / sem matrícula | XRXR-V-0095 (13503) / sem matrícula | ponto sem matrícula |
| 21385 | 7720 (id 16) | XRXR-V-0095 (13503) / sem matrícula | XRXR-V-0096 (13504) / sem matrícula | ponto sem matrícula |
| 21386 | 7720 (id 16) | XRXR-V-0096 (13504) / sem matrícula | XRXR-V-0097 (13360) / sem matrícula | ponto sem matrícula |
| 20645 | 4980 (id 17) | XRXR-V-0036 (12763) / sem matrícula | XRXR-P-0091 (12764) / sem matrícula | ponto sem matrícula |
| 20646 | 4980 (id 17) | XRXR-P-0091 (12764) / sem matrícula | XRXR-V-0037 (12765) / sem matrícula | ponto sem matrícula |
| 20647 | 4980 (id 17) | XRXR-V-0037 (12765) / sem matrícula | SDER-V-1372 (12766) / sem matrícula | ponto sem matrícula |
| 20648 | 4980 (id 17) | SDER-V-1372 (12766) / sem matrícula | SDER-M-1448 (12767) / sem matrícula | ponto sem matrícula |
| 20649 | 4980 (id 17) | SDER-M-1448 (12767) / sem matrícula | SDER-M-1447 (12768) / sem matrícula | ponto sem matrícula |
| 20650 | 4980 (id 17) | SDER-M-1447 (12768) / sem matrícula | XRXR-V-0038 (12769) / sem matrícula | ponto sem matrícula |
| 20651 | 4980 (id 17) | XRXR-V-0038 (12769) / sem matrícula | XRXR-V-0039 (12770) / sem matrícula | ponto sem matrícula |
| 20652 | 4980 (id 17) | XRXR-V-0039 (12770) / sem matrícula | XRXR-V-0040 (12771) / sem matrícula | ponto sem matrícula |
| 20653 | 4980 (id 17) | XRXR-V-0040 (12771) / sem matrícula | XRXR-V-0041 (12772) / sem matrícula | ponto sem matrícula |
| 20654 | 4980 (id 17) | XRXR-V-0041 (12772) / sem matrícula | XRXR-V-0042 (12773) / sem matrícula | ponto sem matrícula |
| 20655 | 4980 (id 17) | XRXR-V-0042 (12773) / sem matrícula | XRXR-V-0043 (12774) / sem matrícula | ponto sem matrícula |
| 20656 | 4980 (id 17) | XRXR-V-0043 (12774) / sem matrícula | XRXR-V-0044 (12775) / sem matrícula | ponto sem matrícula |
| 20657 | 4980 (id 17) | XRXR-V-0044 (12775) / sem matrícula | XRXR-V-0045 (12776) / sem matrícula | ponto sem matrícula |
| 20658 | 4980 (id 17) | XRXR-V-0045 (12776) / sem matrícula | XRXR-V-0046 (12777) / sem matrícula | ponto sem matrícula |
| 20659 | 4980 (id 17) | XRXR-V-0046 (12777) / sem matrícula | XRXR-V-0047 (12778) / sem matrícula | ponto sem matrícula |
| 20660 | 4980 (id 17) | XRXR-V-0047 (12778) / sem matrícula | XRXR-V-0048 (12779) / sem matrícula | ponto sem matrícula |
| 20661 | 4980 (id 17) | XRXR-V-0048 (12779) / sem matrícula | XRXR-V-0036 (12763) / sem matrícula | ponto sem matrícula |

</details>

### Levantamento 18 — Lote nº 3C e 3N (EM_ANDAMENTO)

Pontos no levantamento: 46 (com matrícula: 0); segmentos: 46.

| Matrícula do segmento | Causa | Segmentos |
|---|---|---|
| 64630 (id 30) | ponto sem matrícula | 46 |

<details><summary>Segmentos</summary>

| Segmento | Matrícula | Início (id) / matrícula | Fim (id) / matrícula | Causa |
|---|---|---|---|---|
| 18751 | 64630 (id 30) | AYC-M-0019 (10265) / sem matrícula | AYC-M-0018 (10266) / sem matrícula | ponto sem matrícula |
| 18752 | 64630 (id 30) | AYC-M-0018 (10266) / sem matrícula | UAUX-V-0416 (10267) / sem matrícula | ponto sem matrícula |
| 18753 | 64630 (id 30) | UAUX-V-0416 (10267) / sem matrícula | UAUX-V-0417 (10268) / sem matrícula | ponto sem matrícula |
| 18754 | 64630 (id 30) | UAUX-V-0417 (10268) / sem matrícula | UAUX-V-0418 (10269) / sem matrícula | ponto sem matrícula |
| 18755 | 64630 (id 30) | UAUX-V-0418 (10269) / sem matrícula | UAUX-V-0419 (10270) / sem matrícula | ponto sem matrícula |
| 18756 | 64630 (id 30) | UAUX-V-0419 (10270) / sem matrícula | UAUX-V-0420 (10271) / sem matrícula | ponto sem matrícula |
| 18757 | 64630 (id 30) | UAUX-V-0420 (10271) / sem matrícula | AYC-M-2213 (10272) / sem matrícula | ponto sem matrícula |
| 18758 | 64630 (id 30) | AYC-M-2213 (10272) / sem matrícula | AYC-M-2230 (10273) / sem matrícula | ponto sem matrícula |
| 18759 | 64630 (id 30) | AYC-M-2230 (10273) / sem matrícula | AYC-V-1756 (10274) / sem matrícula | ponto sem matrícula |
| 18760 | 64630 (id 30) | AYC-V-1756 (10274) / sem matrícula | UAUX-P-2119 (10275) / sem matrícula | ponto sem matrícula |
| 18761 | 64630 (id 30) | UAUX-P-2119 (10275) / sem matrícula | UAUX-P-2120 (10276) / sem matrícula | ponto sem matrícula |
| 18762 | 64630 (id 30) | UAUX-P-2120 (10276) / sem matrícula | UAUX-P-2121 (10277) / sem matrícula | ponto sem matrícula |
| 18763 | 64630 (id 30) | UAUX-P-2121 (10277) / sem matrícula | UAUX-P-2122 (10278) / sem matrícula | ponto sem matrícula |
| 18764 | 64630 (id 30) | UAUX-P-2122 (10278) / sem matrícula | UAUX-P-2123 (10279) / sem matrícula | ponto sem matrícula |
| 18765 | 64630 (id 30) | UAUX-P-2123 (10279) / sem matrícula | UAUX-P-2124 (10280) / sem matrícula | ponto sem matrícula |
| 18766 | 64630 (id 30) | UAUX-P-2124 (10280) / sem matrícula | UAUX-P-2125 (10281) / sem matrícula | ponto sem matrícula |
| 18767 | 64630 (id 30) | UAUX-P-2125 (10281) / sem matrícula | UAUX-P-2126 (10282) / sem matrícula | ponto sem matrícula |
| 18768 | 64630 (id 30) | UAUX-P-2126 (10282) / sem matrícula | UAUX-P-2127 (10283) / sem matrícula | ponto sem matrícula |
| 18769 | 64630 (id 30) | UAUX-P-2127 (10283) / sem matrícula | UAUX-P-2128 (10284) / sem matrícula | ponto sem matrícula |
| 18770 | 64630 (id 30) | UAUX-P-2128 (10284) / sem matrícula | UAUX-P-2129 (10285) / sem matrícula | ponto sem matrícula |
| 18771 | 64630 (id 30) | UAUX-P-2129 (10285) / sem matrícula | UAUX-P-2130 (10286) / sem matrícula | ponto sem matrícula |
| 18772 | 64630 (id 30) | UAUX-P-2130 (10286) / sem matrícula | UAUX-P-2131 (10287) / sem matrícula | ponto sem matrícula |
| 18773 | 64630 (id 30) | UAUX-P-2131 (10287) / sem matrícula | UAUX-P-2132 (10288) / sem matrícula | ponto sem matrícula |
| 18774 | 64630 (id 30) | UAUX-P-2132 (10288) / sem matrícula | UAUX-P-2133 (10289) / sem matrícula | ponto sem matrícula |
| 18775 | 64630 (id 30) | UAUX-P-2133 (10289) / sem matrícula | UAUX-P-2134 (10290) / sem matrícula | ponto sem matrícula |
| 18776 | 64630 (id 30) | UAUX-P-2134 (10290) / sem matrícula | UAUX-P-2135 (10291) / sem matrícula | ponto sem matrícula |
| 18777 | 64630 (id 30) | UAUX-P-2135 (10291) / sem matrícula | UAUX-P-2136 (10292) / sem matrícula | ponto sem matrícula |
| 18778 | 64630 (id 30) | UAUX-P-2136 (10292) / sem matrícula | UAUX-P-2137 (10293) / sem matrícula | ponto sem matrícula |
| 18779 | 64630 (id 30) | UAUX-P-2137 (10293) / sem matrícula | UAUX-P-2138 (10294) / sem matrícula | ponto sem matrícula |
| 18780 | 64630 (id 30) | UAUX-P-2138 (10294) / sem matrícula | UAUX-P-2139 (10295) / sem matrícula | ponto sem matrícula |
| 18781 | 64630 (id 30) | UAUX-P-2139 (10295) / sem matrícula | UAUX-P-2140 (10296) / sem matrícula | ponto sem matrícula |
| 18782 | 64630 (id 30) | UAUX-P-2140 (10296) / sem matrícula | UAUX-P-2141 (10297) / sem matrícula | ponto sem matrícula |
| 18783 | 64630 (id 30) | UAUX-P-2141 (10297) / sem matrícula | UAUX-P-2142 (10298) / sem matrícula | ponto sem matrícula |
| 18784 | 64630 (id 30) | UAUX-P-2142 (10298) / sem matrícula | UAUX-P-2143 (10299) / sem matrícula | ponto sem matrícula |
| 18785 | 64630 (id 30) | UAUX-P-2143 (10299) / sem matrícula | UAUX-P-2144 (10300) / sem matrícula | ponto sem matrícula |
| 18786 | 64630 (id 30) | UAUX-P-2144 (10300) / sem matrícula | UAUX-P-2145 (10301) / sem matrícula | ponto sem matrícula |
| 18787 | 64630 (id 30) | UAUX-P-2145 (10301) / sem matrícula | UAUX-P-2146 (10302) / sem matrícula | ponto sem matrícula |
| 18788 | 64630 (id 30) | UAUX-P-2146 (10302) / sem matrícula | UAUX-P-2147 (10303) / sem matrícula | ponto sem matrícula |
| 18789 | 64630 (id 30) | UAUX-P-2147 (10303) / sem matrícula | UAUX-P-2148 (10304) / sem matrícula | ponto sem matrícula |
| 18790 | 64630 (id 30) | UAUX-P-2148 (10304) / sem matrícula | UAUX-P-2149 (10305) / sem matrícula | ponto sem matrícula |
| 18791 | 64630 (id 30) | UAUX-P-2149 (10305) / sem matrícula | UAUX-P-2150 (10306) / sem matrícula | ponto sem matrícula |
| 18792 | 64630 (id 30) | UAUX-P-2150 (10306) / sem matrícula | UAUX-P-2151 (10307) / sem matrícula | ponto sem matrícula |
| 18793 | 64630 (id 30) | UAUX-P-2151 (10307) / sem matrícula | UAUX-P-2152 (10308) / sem matrícula | ponto sem matrícula |
| 18794 | 64630 (id 30) | UAUX-P-2152 (10308) / sem matrícula | UAUX-P-2153 (10309) / sem matrícula | ponto sem matrícula |
| 18795 | 64630 (id 30) | UAUX-P-2153 (10309) / sem matrícula | UAUX-P-2154 (10310) / sem matrícula | ponto sem matrícula |
| 18796 | 64630 (id 30) | UAUX-P-2154 (10310) / sem matrícula | AYC-M-0019 (10265) / sem matrícula | ponto sem matrícula |

</details>

