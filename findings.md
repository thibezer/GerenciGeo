# findings.md — Pesquisas e Descobertas (Protocolo V.L.A.E.G.)

Este arquivo registra a análise profunda da arquitetura do GerenciGeo, restrições e invariantes de engenharia antes do desenvolvimento do código de produção.

---

## 🔎 Análise do Estado Atual

### 1. Banco de Dados (`database/models.py`)
- **Tabela `pontos`**: 
  - Possui a constraint `UNIQUE(levantamento_id, matricula_id, nome_vertice, tipo_ponto)`.
  - Contém campos de rastreabilidade geodésica avançada (`lat_corrigido`, `lon_corrigido`, `alt_corrigido`, `n_original`, `e_original`, `alt_original`).
  - **Restrição identificada**: Ao adicionar `status_ponto` e `ponto_base_id`, a inicialização em `create_tables()` deve rodar um `ALTER TABLE` tolerando execuções recorrentes. Como o SQLite não possui suporte nativo simples a `IF NOT EXISTS` em `ALTER TABLE ADD COLUMN`, utilizaremos `PRAGMA table_info` para inspecionar de forma determinística a presença das colunas antes de executar os comandos.

### 2. Motor de Translação (`business/txt_parser.py`)
- **Funcionamento Atual**:
  - `identificar_layout()` detecta se é `rtk` ou `topcon` (estático).
  - Se for `rtk`, ele localiza a base bruta no arquivo usando a descrição exata `"set_base"`.
  - O fuso UTM é inferido da base PPP do banco ou tem fallback para `31982` (UTM 22S).
  - A translação geocêntrica 3D ECEF aplica-se a todos os rovers combinando as coordenadas e propagando sigmas quadraticamente.
  - **Descoberta/Aperfeiçoamento**: Se o usuário fornecer um ID específico de base, extrairemos este vértice corrigido do banco para translação. A base de amarração no arquivo poderá ser encontrada não só pelo marcador `"set_base"`, mas também pelo nome do vértice condizente com a base (ex: `"M-100"`), removendo o acoplamento rígido de layout.

### 3. Exposição de APIs (`api.py`)
- O endpoint `@app.post("/levantamentos/{id}/importar-txt")` recebe parâmetros como `Form(...)` e `file`. Adicionaremos a `base_escolhida_id: int = Form(None)` para que ela flua perfeitamente do frontend para o núcleo de translação.
- Atualmente, as poligonais de matrícula são reordenadas automaticamente pelo botão de sentido horário a partir do ponto mais ao norte.
- **Nova lógica**: O reordenamento de perímetro manual do frontend necessita de uma API de reordenação customizada que atualize atomicamente o `ordem_caminhamento` e reconstrua os segmentos (fechamento de polígono) de forma limpa e sem órfãos.

---

## ⚠️ Restrições e Invariantes
1. **Tranca de Segurança Read-Only**: O middleware de auditoria bloqueia qualquer modificação de pontos ou segmentos se o levantamento estiver em status `'ARQUIVADO'`. Esta regra deve ser preservada.
2. **Propagação de Incerteza**: Os desvios padrão (Sigmas) de base e rovers devem ser combinados de forma quadrática:
   $$\sigma_{final} = \sqrt{\sigma_{rover}^2 + \sigma_{base}^2}$$
3. **Fechamento de Polígono**: Toda topologia deve possuir um segmento ligando o último ponto de volta ao primeiro na cadeia de caminhamento.
