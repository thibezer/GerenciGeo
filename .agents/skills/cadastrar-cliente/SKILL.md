---
name: cadastrar-cliente
description: "Extrai automaticamente todos os dados cadastrais (PF/PJ) a partir de imagens, prints, PDFs ou textos de documentos (RG novo/CIN, RG verde clássico, CNH física ou digital, Certidão de Casamento/Nascimento, Cartão CNPJ/Contrato Social, Comprovante de Residência e prints de contato) e cadastra ou atualiza o cliente diretamente no GerenciGeo via scripts/cadastrar_cliente_ia.py."
---

# Skill: `cadastrar-cliente` — Extração de Documentos & Lançamento Automático

Esta skill orienta o agente a inspecionar visualmente imagens, prints, PDFs ou informações enviadas pelo usuário, realizar a extração estruturada de todos os dados cadastrais (OCR multimodal) e gravá-los diretamente no banco de dados do **GerenciGeo**.

---

## 🎯 Quando Ativar Esta Skill
- Quando o usuário enviar uma print, foto, PDF ou anexo de documento (RG, CIN, CNH, Certidão de Casamento/Nascimento, Cartão CNPJ, Contrato Social, Comprovante de Endereço, print de WhatsApp/ficha cadastral) e pedir para cadastrar, lançar ou atualizar dados do cliente.
- Quando o usuário disser *"cadastre esse cliente"*, *"lance os dados desse documento"*, *"atualize o cadastro com esse comprovante"*, *"pegue os dados da print e lance no programa"* ou variações.

---

## 📋 Protocolo de Execução Passo a Passo

### 1. Inspecionar e Reconhecer o(s) Documento(s)
Identifique visualmente o(s) modelo(s) enviado(s). Se houver múltiplos arquivos do mesmo cliente (ex.: frente e verso do RG, ou RG + Comprovante + Certidão de Casamento), **consolide todos os campos em um único payload JSON** e anexe todas as imagens juntas.

1. **RG Tradicional (Verde) ou Nova CIN (Carteira de Identidade Nacional / QR Code)**:
   - `tipo_documento`: `"RG"` (ou `"CIN"` se for a nova identidade nacional).
   - `nome_completo`: Nome completo sem abreviações.
   - `cpf_cnpj`: 11 dígitos do CPF (na CIN, o número principal da carteira já é o CPF).
   - `rg_ie`: Número do Registro Geral (se RG tradicional) ou CPF (na CIN, apenas se não houver RG estadual distinto).
   - `rg_orgao`: Órgão expedidor (ex: `SSP`, `SESP`, `PC`, `IIEP`, `DETRAN`).
   - `rg_uf`: Sigla do estado emissor (ex: `PR`, `MS`, `SP`, `SC`).
   - `data_nascimento_fundacao`: Data de nascimento no formato `AAAA-MM-DD`.
   - `naturalidade`: Cidade e UF de nascimento (ex: `Campo Mourão - PR`).
   - `nacionalidade`: Ex: `Brasileira`.
   - `sexo`: `"M"` ou `"F"` (extraia apenas se estiver explícito ou inequivocamente identificável).
   - `filiacao_mae` e `filiacao_pai`: Nomes dos genitores.

2. **CNH (Carteira Nacional de Habilitação — Física ou Digital / e-CNH)**:
   - `tipo_documento`: `"CNH"`.
   - `nome_completo` e `cpf_cnpj`.
   - `cnh_numero`: Número de registro da CNH (11 dígitos).
   - `cnh_categoria`: Ex: `B`, `AB`, `C`, `AD`, `AE`.
   - `cnh_validade`: Data de validade (`AAAA-MM-DD`).
   - `cnh_orgao_uf`: Órgão e UF (ex: `DETRAN/PR`).
   - `rg_ie`, `rg_orgao`, `rg_uf` (quando constarem no campo Doc. Identidade).
   - `data_nascimento_fundacao`, `filiacao_mae`, `filiacao_pai`.

3. **Certidão de Casamento / Nascimento / União Estável**:
   - `tipo_documento`: `"CERTIDAO_CASAMENTO"`.
   - **Titular principal**: `nome_completo`, `cpf_cnpj`, `rg_ie`, `rg_orgao`, `rg_uf`, `sexo`, `nacionalidade`, `profissao`, `naturalidade`, `data_nascimento_fundacao`.
   - **Qualificação do casamento**:
     - `estado_civil`: `"Casado(a)"` ou `"União Estável"`.
     - `regime_bens`: `"Comunhão Parcial de Bens"`, `"Comunhão Universal de Bens"`, `"Separação Total de Bens"`, etc.
     - `data_casamento`: `AAAA-MM-DD`.
     - `certidao_casamento_matricula`: Matrícula com 32 dígitos (se presente).
     - `cartorio_casamento`, `livro_casamento`, `folha_casamento`, `termo_casamento`.
   - **Dados completos do cônjuge**:
     - `nome_conjuge`, `cpf_conjuge`, `rg_conjuge`, `rg_orgao_conjuge`, `rg_uf_conjuge`.
     - `genero_conjuge` (`"M"` ou `"F"`), `nacionalidade_conjuge`, `profissao_conjuge`.
   - ⚠️ **Regra para Casal**: Se o documento contiver os dados de ambos os cônjuges (incluindo ambos os CPFs) e o usuário pedir para cadastrar o casal ou ambos forem proprietários de matrícula, execute também o cadastro/enriquecimento do cônjuge como cliente espelhando os dados civis do casamento.

4. **Pessoa Jurídica (Cartão CNPJ / Contrato Social / Ficha QSA)**:
   - `tipo_pessoa`: `"PJ"`.
   - `tipo_documento`: `"CARTAO_CNPJ"`.
   - `cpf_cnpj`: 14 dígitos do CNPJ.
   - `razao_social` e `nome_completo` (usar a Razão Social como `nome_completo`).
   - `nome_fantasia`.
   - `inscricao_estadual`, `inscricao_municipal`.
   - `data_nascimento_fundacao`: Data de abertura da empresa (`AAAA-MM-DD`).
   - `endereco_completo`, `numero_endereco`, `bairro`, `cidade`, `estado`, `cep`.
   - `email`, `telefone`.

5. **Comprovante de Residência**:
   - `tipo_documento`: `"COMPROVANTE_RESIDENCIA"`.
   - `nome_completo` e `cpf_cnpj` (se constarem no comprovante, para localizar o cliente).
   - `endereco_completo`: Logradouro, Avenida, Linha Rural ou Fazenda.
   - `numero_endereco`: Número (ou `endereco_sem_numero: true` se `S/N` ou rural sem número).
   - `bairro`: Bairro, Distrito ou Localidade Rural.
   - `cidade`: Município.
   - `estado`: UF (ex: `PR`).
   - `cep`: 8 dígitos.

6. **Print de Contato / WhatsApp / Ficha Cadastral**:
   - `telefone`, `email`, `profissao`, `estado_civil`, `endereco_completo` e quaisquer outros dados informados na conversa.

---

### 2. Regras de Qualidade na Montagem do Payload JSON
- **Omita campos não encontrados**: Não envie chaves com `null` ou `""` no JSON — envie **apenas** os campos efetivamente lidos no documento.
- **Nunca invente ou deduza dados ilegíveis**: Se um número, CPF ou letra estiver borrado/cortado, omita o campo e avise o usuário no resumo final.
- **Padronize datas**: Use `AAAA-MM-DD` (o script também converte `DD/MM/AAAA` e datas por extenso como `"15 de março de 1985"`).

Exemplo de payload limpo (somente campos extraídos):
```json
{
  "tipo_documento": "RG",
  "nome_completo": "Nome Completo Extraído",
  "cpf_cnpj": "12345678900",
  "rg_ie": "12.345.678-9",
  "rg_orgao": "SSP",
  "rg_uf": "PR",
  "data_nascimento_fundacao": "1985-12-25",
  "naturalidade": "Maringá - PR",
  "sexo": "M",
  "filiacao_mae": "Nome da Mãe",
  "filiacao_pai": "Nome do Pai"
}
```

---

### 3. Gravação Automática no GerenciGeo
Execute o utilitário oficial de persistência:
```powershell
python scripts/cadastrar_cliente_ia.py --json '<PAYLOAD_JSON>'
```

**Anexo de arquivos (imagens ou PDFs)**:
- Passe `--image "<caminho>"` para que o GerenciGeo arquive a cópia em `uploads/documentos_clientes/{id}/` e registre em `cliente_documentos`.
- Para **múltiplos arquivos** (ex.: frente e verso do documento, ou vários documentos do mesmo cliente), repita `--image`:
  ```powershell
  python scripts/cadastrar_cliente_ia.py --json '<PAYLOAD_JSON>' --image "frente.jpg" --image "verso.jpg"
  ```

**Regras de Enriquecimento e Sobrescrita**:
- **Cliente Novo**: Cadastra atomicamente a pessoa e o registro de cliente.
- **Cliente Existente (Padrão — Enriquecimento Seguro)**: Se o CPF/CNPJ já existir no banco, o script **preenche apenas os campos que estavam vazios/nulos** e faz merge de metadados (como filiação), **sem sobrescrever** dados pré-existentes válidos.
- **Correção/Substituição Explícita (`--sobrescrever`)**: Use `--sobrescrever` **somente** quando o usuário pedir explicitamente para atualizar/substituir um dado já cadastrado (ex.: *"atualize o endereço dele para esse novo"*).
- **Alerta de Cônjuge para Georreferenciamento**: Se o cliente for `Casado(a)` ou `União Estável` e faltarem Nome ou CPF do cônjuge, o sistema abre pendência técnica automática para fins de INCRA/SIGEF.
- **Integração com Matrículas**: Caso o usuário também peça para lançar uma matrícula em seguida (skill `cadastrar-matricula`), os clientes cadastrados aqui já estarão disponíveis para vínculo automático por CPF.

---

### 4. Apresentação do Resumo ao Usuário
Apresente uma resposta objetiva em Português do Brasil contendo:
1. Status da operação (`✅ Cliente Cadastrado com Sucesso` ou `🔄 Cadastro Atualizado/Enriquecido`).
2. Tabela com os dados extraídos e gravados no banco (e indicação de campos que foram preservados, se aplicável).
3. Confirmação do(s) documento(s) anexado(s), tipo detectado e ID do cliente no sistema.
4. Avisos/Pendências técnicas (ex.: falta de dados do cônjuge para INCRA/SIGEF ou algum campo ilegível no documento que precise de confirmação manual).
