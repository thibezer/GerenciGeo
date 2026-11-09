---
name: cadastrar-cliente
description: "Extrai automaticamente todos os dados cadastrais (PF/PJ) a partir de imagens, prints ou fotos de documentos de identidade (RG novo/CIN, RG verde clássico, CNH física ou digital, Certidão de Casamento/Nascimento, CPF, Comprovante de Residência) e cadastra ou atualiza o cliente diretamente no GerenciGeo via scripts/cadastrar_cliente_ia.py."
---

# Skill: `cadastrar-cliente` — Extração de Documentos & Lançamento Automático

Esta skill orienta o agente a inspecionar visualmente imagens ou prints de documentos de identidade enviados pelo usuário, realizar a leitura e extração estruturada de todos os dados cadastrais (OCR multimodal) e gravá-los diretamente no banco de dados do **GerenciGeo**.

---

## 🎯 Quando Ativar Esta Skill
- Quando o usuário enviar uma print, foto ou anexo de documento (RG, CNH, Certidão de Casamento, Cartão CNPJ, Comprovante de Endereço) e pedir para cadastrar, lançar ou extrair dados do cliente.
- Quando o usuário disser *"cadastre esse cliente"*, *"lance os dados desse documento"*, *"pegue os dados da print e lance no programa"* ou variações.

---

## 📋 Protocolo de Execução Passo a Passo

### 1. Inspecionar e Reconhecer o Documento Visualmente
Identifique visualmente o modelo do documento:
1. **RG Tradicional (Verde) ou Nova CIN (Carteira de Identidade Nacional com QR Code)**:
   - `nome_completo`: Nome completo sem abreviações.
   - `cpf_cnpj`: 11 dígitos do CPF.
   - `rg_ie`: Número do Registro Geral.
   - `rg_orgao`: Órgão expedidor (ex: `SSP`, `SESP`, `PC`, `IIEP`, `DETRAN`).
   - `rg_uf`: Sigla do estado emissor (ex: `PR`, `MS`, `SP`, `SC`).
   - `data_nascimento_fundacao`: Data de nascimento formatada como `AAAA-MM-DD`.
   - `naturalidade`: Cidade e UF de nascimento (ex: `Campo Mourão - PR`).
   - `nacionalidade`: Ex: `Brasileira`.
   - `sexo`: `M` ou `F`.
   - `filiacao_mae` e `filiacao_pai`: Nomes dos genitores.

2. **CNH (Carteira Nacional de Habilitação - Física ou Digital)**:
   - `nome_completo` e `cpf_cnpj`.
   - `cnh_numero`: Número de registro da CNH (geralmente 11 dígitos).
   - `cnh_categoria`: Ex: `B`, `AB`, `C`, `AD`, etc.
   - `cnh_validade`: Data de validade no formato `AAAA-MM-DD`.
   - `cnh_orgao_uf`: Órgão e UF (ex: `DETRAN/PR`).
   - `rg_ie`, `rg_orgao`, `rg_uf`.
   - `data_nascimento_fundacao`.
   - `filiacao_mae` e `filiacao_pai`.

3. **Certidão de Casamento / Qualificação Civil**:
   - `nome_completo` e `nome_conjuge`.
   - `cpf_cnpj` e `cpf_conjuge`.
   - `rg_ie` e `rg_conjuge`.
   - `estado_civil`: `Casado(a)` ou `União Estável`.
   - `regime_bens`: `Comunhão Parcial de Bens`, `Comunhão Universal`, `Separação Total de Bens`, etc.
   - `data_casamento`: `AAAA-MM-DD`.
   - `certidao_casamento_matricula`: Matrícula com 32 dígitos (se presente).
   - `cartorio_casamento`, `livro_casamento`, `folha_casamento`, `termo_casamento`.

4. **Comprovante de Endereço**:
   - `endereco_completo`: Logradouro, Avenida, Linha Rural ou Fazenda.
   - `numero_endereco`: Número (ou marcar `endereco_sem_numero=True`).
   - `bairro`: Bairro ou Localidade.
   - `cidade`: Município.
   - `estado`: UF do estado (ex: `PR`).
   - `cep`: 8 dígitos.

---

### 2. Sanitização e Montagem do Payload JSON
Monte um JSON padronizado com os campos identificados:
```json
{
  "nome_completo": "Nome Completo Extraído",
  "cpf_cnpj": "12345678900",
  "rg_ie": "12.345.678-9",
  "rg_orgao": "SSP",
  "rg_uf": "PR",
  "data_nascimento_fundacao": "1985-12-25",
  "naturalidade": "Maringá - PR",
  "nacionalidade": "Brasileira",
  "sexo": "M",
  "estado_civil": "Casado(a)",
  "profissao": "Produtor Rural",
  "filiacao_mae": "Nome da Mãe",
  "filiacao_pai": "Nome do Pai",
  "cnh_numero": null,
  "cnh_categoria": null,
  "cnh_validade": null,
  "cnh_orgao_uf": null,
  "nome_conjuge": null,
  "cpf_conjuge": null,
  "regime_bens": null,
  "endereco_completo": null,
  "cidade": null,
  "estado": null,
  "cep": null
}
```

---

### 3. Gravação Automática no GerenciGeo
Execute o utilitário oficial de persistência:
```powershell
python scripts/cadastrar_cliente_ia.py --json '<PAYLOAD_JSON>'
```
> Se o arquivo de imagem/print estiver disponível em disco (ex: em `media/`, pasta temporária ou caminho informado), passe o parâmetro `--image "<caminho_da_imagem>"` para que o GerenciGeo arquive automaticamente a cópia na pasta de documentos do cliente (`uploads/documentos_clientes/{id}/`) e gere o registro em `cliente_documentos`.

#### Regras de Banco e Automação:
- **Cliente Existente**: Se o CPF já constar no banco, o script realiza um **enriquecimento cadastral inteligente**, preenchendo novos campos (ex.: CNH, RG, data de nascimento) sem sobrescrever dados pré-existentes válidos.
- **Cliente Novo**: Cadastra atomicamente a pessoa e o registro comercial de cliente.
- **Alerta de Cônjuge para Georreferenciamento**: Se o cliente for qualificado como `Casado(a)` ou `União Estável` e faltarem os dados do cônjuge (Nome e CPF), o sistema abre uma pendência técnica automática para fins de INCRA/SIGEF.

---

### 4. Apresentação do Resumo ao Usuário
Apresente uma resposta objetiva em Português do Brasil contendo:
1. Status da operação (`✅ Cliente Cadastrado com Sucesso` ou `🔄 Cadastro Atualizado com Novos Dados`).
2. Tabela com todos os dados extraídos e inseridos no banco.
3. Informações sobre o anexo do documento e ID gerado no sistema.
4. Avisos/Pendências técnicas caso o cliente seja casado e faltem dados do cônjuge para as peças técnicas de georreferenciamento.
