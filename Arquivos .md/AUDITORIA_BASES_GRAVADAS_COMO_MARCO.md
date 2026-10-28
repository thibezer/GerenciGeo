# Auditoria: bases gravadas como Marco (M)

Gerado em 2026-10-28 14:21 a partir de `gerencigeo.db` por `scripts/diagnosticar_bases_como_marco.py` (somente leitura; nenhum dado foi alterado).

## Como corrigir sem perder correções

1. Antes de mexer, confira o retrato das coordenadas abaixo (é o estado atual de cada ponto).
2. Se o ponto **é base**: no painel de propriedades, troque **apenas o tipo** de `Marco [M]` para `Base [B]`. Não reenvie N/E/H: trocar o tipo não altera coordenadas nem os rovers vinculados.
3. Se o ponto **é marco de divisa de verdade**: não faça nada (o sistema agora o trata como vértice).
4. Depois de cada troca, confira se a contagem de rovers vinculados e as coordenadas continuam iguais.

Enquanto um ponto M ainda tiver rovers vinculados, o sistema continua tratando-o como base (compatibilidade), então nada quebra até a correção. A Triagem Inteligente também mostra esses casos.

Nível: **ALTA** = é usado como base (rovers, histórico ou nome); **MÉDIA** = RINEX/fora do polígono; **BAIXA** = só o nome fora do padrão SIGEF e/ou fora das divisas (provável marco legítimo, conferir).

## Resumo por projeto

| Levantamento | Propriedade | Status | ALTA | MÉDIA | BAIXA | Corrigido? |
|---|---|---|---|---|---|---|
| 16 | Fazenda Serra dos Dourados | EM_ANDAMENTO | 0 | 2 | 3 | [ ] |

## Pontos M suspeitos (detalhe)

### Levantamento 16 — Fazenda Serra dos Dourados (EM_ANDAMENTO)

- [ ] **mcrio** (id 7223) — suspeita **MÉDIA**
  - Sinais: marcado para ficar fora do polígono; não compõe nenhuma divisa; nome fora do padrão SIGEF (tipo M atribuído pela letra inicial do nome)
  - Retrato atual: status `CORRIGIDO`, lat -23.58603125, lon -53.47576785, alt 306.889, lat_corr -23.58603125, lon_corr -53.47576785, alt_corr 306.889
  - Campo bruto: E 247334.801, N 7389419.008, H 305.486 — arquivo `Joaopozzobomriomato15052_txt_0.txt`, matrícula —, ponto_base_id 7222, rovers vinculados 0
- [ ] **mcriomata** (id 7396) — suspeita **MÉDIA**
  - Sinais: marcado para ficar fora do polígono; não compõe nenhuma divisa; nome fora do padrão SIGEF (tipo M atribuído pela letra inicial do nome)
  - Retrato atual: status `CORRIGIDO`, lat -23.58912501, lon -53.47572534, alt 301.784, lat_corr -23.58912501, lon_corr -53.47572534, alt_corr 301.784
  - Campo bruto: E 247345.072, N 7389076.360, H 300.381 — arquivo `Joaopozzobomriomato15052_txt_0.txt`, matrícula —, ponto_base_id 7222, rovers vinculados 0
- [ ] **marco2** (id 7402) — suspeita **BAIXA**
  - Sinais: não compõe nenhuma divisa; nome fora do padrão SIGEF (tipo M atribuído pela letra inicial do nome)
  - Retrato atual: status `BRUTO`, lat -23.57033797, lon -53.47357837, alt 306.757, lat_corr —, lon_corr —, alt_corr —
  - Campo bruto: E 247527.730, N 7391161.515, H 306.757 — arquivo `1pozzobom270125_txt_011414.txt`, matrícula —, ponto_base_id —, rovers vinculados 0
- [ ] **mcest** (id 7383) — suspeita **BAIXA**
  - Sinais: não compõe nenhuma divisa; nome fora do padrão SIGEF (tipo M atribuído pela letra inicial do nome)
  - Retrato atual: status `BRUTO`, lat -23.57794176, lon -53.46683318, alt 354.009, lat_corr -23.57794176, lon_corr -53.46683318, alt_corr 354.009
  - Campo bruto: E 248231.575, N 7390330.900, H 352.606 — arquivo `Joaopozzobomriomato15052_txt_0.txt`, matrícula —, ponto_base_id —, rovers vinculados 0
- [ ] **mcest1** (id 7384) — suspeita **BAIXA**
  - Sinais: não compõe nenhuma divisa; nome fora do padrão SIGEF (tipo M atribuído pela letra inicial do nome)
  - Retrato atual: status `BRUTO`, lat -23.57799874, lon -53.46688165, alt 354.239, lat_corr -23.57799874, lon_corr -53.46688165, alt_corr 354.239
  - Campo bruto: E 248226.735, N 7390324.502, H 352.836 — arquivo `Joaopozzobomriomato15052_txt_0.txt`, matrícula —, ponto_base_id —, rovers vinculados 0

## Bases já excluídas enquanto estavam como M (informativo)

- Levantamento 16: `B011016` excluída em 2026-07-14 00:38:44

## Problema inverso: vértices gravados como Base (B)

Pontos B ficam fora do perímetro e aparecem nos filtros de Bases. Os pontos abaixo têm código SIGEF de vértice (inclusive de vizinhos, que não têm base própria) ou compõem divisas, mas estão gravados como B. Trocar só o tipo para o indicado não altera coordenadas.

### Levantamento 12 — Sítio Santa Terezinha (EM_ANDAMENTO)

- [ ] **B061613** (id 3156): compõe 2 segmento(s) de divisa — status `CORRIGIDO`, lat -23.77824458, lon -53.38397186, rovers vinculados 0

