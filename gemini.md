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

### 2. Endpoint de Exportação de Shapefile (.ZIP)
**Rota**: `GET /levantamentos/{id}/matriculas/{matricula_id}/exportar-shapefile`

#### JSON Output Schema (Saída Sucesso)
Retorna um arquivo binário comprimido no formato ZIP contendo as camadas geométricas oficiais do perímetro do imóvel rural projetadas no sistema UTM Zona 22S.

### 3. Endpoints de Laudo de Faixa de Fronteira e Requerimento de Ratificação (HTML Nativos)
**Rotas**:
- `GET /levantamentos/{id}/matriculas/{matricula_id}/laudo-fronteira-html?numero_trt={numero_trt}&data_trt={data_trt}`
- `GET /levantamentos/{id}/matriculas/{matricula_id}/requerimento-ratificacao-html`

#### Output (Saída Sucesso)
Retorna uma resposta HTTP `HTMLResponse` contendo o documento formatado em HTML nativo estilizado via Tailwind CSS para renderização direta no navegador do usuário, pronto para impressão/geração de PDF via `window.print()`.

#### Mapeamento de Tags nos Templates HTML
Os seguintes metadados serão injetados diretamente no código HTML estruturado:
- `NOME_PROFISSIONAL`: Nome do profissional responsável.
- `REGISTRO_CFTA`: Registro profissional (CREA/CFTA).
- `ENDERECO_PROFISSIONAL`: Endereço comercial completo do profissional.
- `NOME_PROPRIETARIO`: Nome do proprietário do imóvel rural.
- `CPF_PROPRIETARIO`: CPF/CNPJ do proprietário.
- `RG_PROPRIETARIO`: RG/IE do proprietário.
- `ESTADO_CIVIL`: Estado civil do proprietário.
- `REGIME_BENS`: Regime de bens do casamento (se aplicável).
- `NOME_CONJUGE`: Nome do cônjuge (se casado).
- `NOME_PROPRIEDADE`: Nome da fazenda/imóvel rural.
- `MATRICULA_NUM`: Número da matrícula de registro.
- `COMARCA_CRI`: Comarca do Cartório de Registro de Imóveis (CRI).
- `REGISTRO_CAR`: Código do Cadastro Ambiental Rural (CAR).
- `CODIGO_INCRA`: Código do CCIR cadastrado na propriedade.
- `NUMERO_TRT`: Número da TRT informada no ato da renderização.
- `DATA_QUITACAO_TRT`: Data de quitação informada formatada (formato DD/MM/AAAA).
- `DISTANCIA_FRONTEIRA_KM`: Distância geodésica determinística até o limite de fronteira com 3 casas decimais.

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
6. **Invariante de Projeção (.PRJ)**: O arquivo de projeção (`.prj`) injetado nos pacotes Shapefile deve conter estritamente a string WKT oficial da nossa EPSG padrão do motor matemático: SIRGAS 2000 / UTM Zone 22S (EPSG:31982), definida por:
   `PROJCS["SIRGAS 2000 / UTM zone 22S",GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101],TOWGS84[0,0,0,0,0,0,0]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4674"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-51],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","31982"]]`
7. **Empacotamento In-Memory e Dupla Camada**: A exportação de Shapefiles deve gerar um único arquivo `.ZIP` contendo duas camadas: uma de pontos (`pontos.shp` para os vértices do perímetro) e uma de polígono (`perimetro.shp` para o contorno fechado da matrícula). O processo de empacotamento deve ocorrer estritamente na memória do servidor via `zipfile` para não entulhar o HD do usuário com arquivos lixo temporários.
8. **Invariante Matemática de Faixa de Fronteira (Módulo 8)**: O cálculo de distância de isolamento da faixa de fronteira internacional (Brasil-Paraguai) deve ocorrer de forma determinística e rigorosa no espaço bidimensional elipsoidal. É proibido qualquer aproximação plana simples em escala de grandes distâncias. A distância deve ser calculada utilizando a classe `pyproj.Geod(ellps="GRS80")` a partir da base do levantamento (ponto tipo `'M'` ativo prioritariamente corrigido) até o limite fixo internacional Brasil-Paraguai estabelecido na coordenada: Lat `-24.0671222`, Lon `-54.2868778`.
9. Geração Dinâmica de Documentos de Fronteira: Todos os laudos de faixa de fronteira e requerimentos de ratificação são gerados dinamicamente em formato HTML estruturado sob demanda via endpoints GET e enviados diretamente para o navegador do usuário, onde a impressão/conversão em PDF é acionada nativamente pelo cliente via window.print() e a classe CSS .no-print oculta os botões e painéis de controle durante a impressão. Não há persistência desnecessária no disco rígido do servidor para evitar desperdício de espaço e simplificar a auditoria.
10. **Manutenção do Manifesto Técnico Híbrido**: Toda e qualquer atualização funcional de grande porte ou alteração de regras de negócio realizada no ecossistema (sejam modificações em payloads de API, tabelas e colunas físicas do SQLite, lógicas matemáticas do motor geodésico ou novos componentes/telas na UI), excetuando-se estritamente correções internas pontuais de sintaxe ou hotfixes de erros que não alterem o comportamento do sistema, deve ser obrigatoriamente documentada e atualizada na sua respectiva seção do Manifesto Técnico Global (`gerencigeo_manifesto_v2.md`) ou no Manifesto de Georreferenciamento Avançado (`gerencigeo_georreferenciamento.md`), mantendo a documentação como a única e atualizada fonte da verdade arquitetural.

