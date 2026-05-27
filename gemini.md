# gemini.md — Constituição do Projeto (Protocolo V.L.A.E.G.)

Este arquivo estabelece os esquemas de dados de entrada/saída, invariantes de banco de dados e as regras de estabilidade comportamental do GerenciGeo.

---

## 💾 Esquemas de Dados e Estruturas de Payload

### 1. Novo Endpoint de Ordenação Perimetral
**Rota**: `POST /levantamentos/{id}/matriculas/{matricula_id}/salvar-ordem`

#### JSON Input Schema (Entrada)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PayloadSalvarOrdem",
  "type": "object",
  "properties": {
    "pontos_ordem": {
      "type": "array",
      "description": "Lista contendo todos os pontos da matrícula na nova ordem de caminhamento perimetral.",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer",
            "description": "ID físico do ponto na tabela 'pontos' do banco de dados."
          },
          "ordem": {
            "type": "integer",
            "description": "Nova posição sequencial do ponto (1-indexada) no caminhamento perimetral."
          }
        },
        "required": ["id", "ordem"]
      }
    }
  },
  "required": ["pontos_ordem"]
}
```

#### JSON Output Schema (Saída Sucesso)
```json
{
  "type": "object",
  "properties": {
    "sucesso": {
      "type": "boolean",
      "description": "Indica se o processo de ordenação e reconstrução perimetral foi bem-sucedido."
    },
    "segmentos_gerados": {
      "type": "integer",
      "description": "Número de divisas físicas recalculadas e inseridas no banco de dados."
    },
    "mensagem": {
      "type": "string",
      "description": "Mensagem descritiva de sucesso."
    }
  },
  "required": ["sucesso", "segmentos_gerados", "mensagem"]
}
```

---

## 🏛️ Invariantes do Banco de Dados (Tabela `pontos`)

As seguintes colunas foram adicionadas na especificação física da tabela `pontos` (V2.0):
1. **`status_ponto`**:
   - Tipo: `TEXT`
   - Default: `'BRUTO'`
   - Constraint: `CHECK(status_ponto IN ('BRUTO', 'CORRIGIDO'))`
   - Regra: Ponto manual ou arquivos brutos de rinex ficam como `'BRUTO'`. Pontos processados por caderneta RTK recebem `'CORRIGIDO'`.
2. **`ponto_base_id`**:
   - Tipo: `INTEGER`
   - Relacionamento: `FOREIGN KEY (ponto_base_id) REFERENCES pontos(id) ON DELETE SET NULL`
   - Regra: Identifica qual Base do levantamento serviu de apoio para a translação 3D ECEF daquele Rover.

---

## ⚙️ Regras Arquiteturais e Comportamentais
1. **Determinismo Lógico**: Nenhuma regra de translação geodésica ou geometria perimetral pode ser gerada ou inferida por probabilidade. A translação 3D geocêntrica no espaço ECEF segue rigidamente os cálculos geodésicos definidos no núcleo de negócio.
2. **Autorregeneração de Divisas**: Sempre que a ordem de caminhamento for alterada, os segmentos anteriores da matrícula devem ser purgados e a polilinha reconstruída ligando sequencialmente $P_n \to P_{n+1}$, com fechamento obrigatório $P_{last} \to P_1$.
3. **Tranca Read-Only**: Projetos em status `'ARQUIVADO'` são imutáveis. Qualquer tentativa de escrita nos endpoints de pontos ou segmentos retornará HTTP 403 Forbidden.
4. **Mesa de Ingestão Quadripolar**: Os arquivos GNSS brutos ou corrigidos são categorizados na ingestão estritamente em uma das 4 opções (Base PPP, Rover Estático Corrigido, Rover Estático Bruto, RTK Rover).
5. **AutoCAD UTM Default**: Toda exibição inicial de tabelas de vértices na UI deve priorizar o formato UTM em metros para compatibilidade imediata com o CAD, mantendo a plotagem do mapa em background SIRGAS 2000.
