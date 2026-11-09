---
name: cadastrar-matricula
description: "Extrai automaticamente todos os dados de matrículas imobiliárias rurais (cartório de registro de imóveis, livro, folha, área em alqueires/hectares, CCIR/INCRA, ITR/NIRF, proprietários vigentes, confrontantes e memorial descritivo) e cadastra ou atualiza a matrícula e a propriedade no GerenciGeo via scripts/cadastrar_matricula_ia.py."
---

# Skill: `cadastrar-matricula` — Extração de Certidões de Registro & Lançamento de Propriedades

Esta skill orienta o agente a realizar a leitura visual minuciosa (OCR Multimodal) de certidões de matrícula de imóveis rurais (PDFs ou imagens escaneadas), extrair os dados registrais, titularidade vigente, áreas, confrontações e lançar/atualizar a propriedade e matrícula no **GerenciGeo**.

---

## 🎯 Quando Ativar Esta Skill
- Quando o usuário enviar uma certidão de matrícula (PDF, imagem ou print de livro de registro) e pedir para extrair os dados, cadastrar a matrícula ou lançar a propriedade.
- Quando o usuário disser *"lance essa matrícula"*, *"cadastre essa propriedade da certidão"*, *"extraia os dados desse registro de imóveis"* ou variações.

---

## 📋 Protocolo de Execução Passo a Passo

### 1. Leitura Completa de Todas as Folhas e Fichas
Inspecione visualmente o cabeçalho do imóvel e **toda a cadeia de atos registrais** (Registros `R.` e Averbações `Av.`):

1. **Dados Cartorários do Cabeçalho**:
   - `numero_matricula`: Número de registro da matrícula (ex.: `10.189`).
   - `cri_comarca`: Comarca do Registro de Imóveis (ex.: `Iporã`).
   - `cri_circunscricao`: Nome da serventia / cartório (ex.: `Serviço de Registro de Imóveis de Iporã - PR`).
   - `livro_registro`: Livro de registro (geralmente `2` - Registro Geral).
   - `folha_registro`: Ficha e folha (ex.: `1.1`).
   - `data_registro`: Data do registro primitivo.

2. **Identificação e Dimensões do Imóvel**:
   - `denominacao`: Nome da gleba, lote, fazenda ou sítio (ex.: `Lotes nºs 161-A, 162, 163, 163-P, 164 e 164-A - Gleba Atlântida, Bairro Leomar`).
   - `municipio` e `uf`: Localização do imóvel.
   - `area_alqueires` e `tipo_alqueire`: Quantidade de alqueires e padrão (ex.: `40,00 alqueires paulistas`).
   - `area_m2`: Metros quadrados descritos (ex.: `968.000,00 m²`).
   - `area_ha`: Área calculada em hectares (no PR/SP: $1\text{ alqueire paulista} = 2,42\text{ ha} = 24.200\text{ m}^2$).
   - `codigo_ccir`: Código INCRA / CCIR registrado no cabeçalho ou nas averbações (ex.: `718.092.046.140/12`).
   - `codigo_itr` / `nirf`: Código da Receita Federal (ITR / NIRF, ex.: `0.981.437-0` ou `6.035.093`).
   - `codigo_car`: Código do CAR (se constar averbado).

3. **Memorial Descritivo e Confrontações Perimetrais**:
   - Transcreva fielmente a amarração perimetral descrita no imóvel: ponto de partida, rumos/azimutes, distâncias métricas, divisas, confrontantes e acidentes geográficos (córregos, rios, estradas municipais).
   - Salve no campo `georreferenciamento` da matrícula.

4. **Rastreamento da Cadeia Dominial (Proprietários Vigentes)**:
   - ⚠️ **ATENÇÃO CRÍTICA**: Nunca utilize apenas os proprietários do cabeçalho da matrícula se houver vendas posteriores (`R.`) ou averbações de partilha!
   - Percorra todos os registros de compra e venda (`R.`) até o último ato para determinar quem são os **atuais titulares**:
     - Identifique nome, CPF, RG, estado civil e regime de bens dos adquirentes finais.
     - Verifique averbações de qualificação subjetiva (ex.: inclusão de RG/CPF do cônjuge).
     - Defina a proporção de participação (ex.: 50% para cada cônjuge ou 100% condomínio).

5. **Ônus e Gravames Ativos**:
   - Liste hipotecas, penhoras, cédulas rurais e verifique se há cancelamentos averbados (`Av. de Cancelamento`).

---

### 2. Montagem do Payload Estruturado
Monte o JSON com os dados consolidados:
```json
{
  "numero_matricula": "10.189",
  "nome_propriedade": "Lotes nºs 161-A a 164-A - Gleba Atlântida",
  "denominacao": "Lotes nºs 161-A, 162, 163, 163-P, 164 e 164-A - Gleba Atlântida, Bairro Leomar",
  "municipio": "Iporã",
  "uf": "PR",
  "cri_comarca": "Iporã",
  "cri_circunscricao": "Serviço de Registro de Imóveis de Iporã - PR",
  "livro_registro": "2",
  "folha_registro": "1.1",
  "area_alqueires": 40.0,
  "tipo_alqueire": "paulista",
  "area_m2": 968000.0,
  "area_ha": 96.8,
  "codigo_ccir": "718.092.046.140-2",
  "codigo_itr": "0.981.437-0",
  "georreferenciamento": "Partindo do marco nº 01... até marco 02...",
  "proprietarios": [
    {
      "nome": "Francisco Antonio Cripa",
      "cpf": "18886442904",
      "percentual": 50.0
    },
    {
      "nome": "Zilda Aparecida Cripa",
      "cpf": "00914999923",
      "percentual": 50.0
    }
  ]
}
```

---

### 3. Execução da Automação no GerenciGeo
Execute o utilitário oficial passando o JSON e o caminho do PDF:
```powershell
python scripts/cadastrar_matricula_ia.py --json '<PAYLOAD_JSON>' --pdf '<CAMINHO_DO_PDF>'
```

O script executa de forma atômica:
1. Encontra ou cadastra a `propriedade`.
2. Cria ou atualiza a `matricula` com o memorial descritivo e dados cartorários.
3. Associa automaticamente os proprietários já cadastrados no banco via tabela `propriedade_clientes`.
4. Copia e arquiva o arquivo PDF físico na pasta oficial (`uploads/documentos_matriculas/{id}/`).

---

### 4. Apresentação do Resumo ao Usuário
Retorne uma apresentação clara contendo:
- Tabela com os dados cartorários, área oficial e códigos INCRA/ITR.
- Rastreamento dos proprietários atuais vinculados à matrícula.
- Memorial perimetral e confrontações identificadas no registro.
- Identificação dos IDs cadastrados no sistema e confirmação do PDF arquivado.
