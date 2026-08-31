import os
import json
import re
import logging
from datetime import datetime
from database.connection import DatabaseManager, execute_query
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from database.repository import PendenciaRepo

logger = logging.getLogger(__name__)

def validar_cpf_cnpj(documento: str) -> bool:
    """Valida formato e dígitos verificadores de CPF ou CNPJ."""
    if not documento or not str(documento).strip():
        return True
    doc = re.sub(r'\D', '', str(documento))
    if len(doc) == 11:
        # Validação CPF
        if doc == doc[0] * 11:
            return False
        for i in range(9, 11):
            val = sum((int(doc[num]) * ((i + 1) - num) for num in range(0, i)))
            dig = ((val * 10) % 11) % 10
            if dig != int(doc[i]):
                return False
        return True
    elif len(doc) == 14:
        # Validação CNPJ
        if doc == doc[0] * 14:
            return False
        tamanho = len(doc) - 2
        numeros = doc[:tamanho]
        digitos = doc[tamanho:]
        def calc(num, tam):
            soma = 0
            pos = tam - 7
            for i in range(tam, 0, -1):
                soma += int(num[tam - i]) * pos
                pos -= 1
                if pos < 2:
                    pos = 9
            return 0 if soma % 11 < 2 else 11 - (soma % 11)
        if calc(numeros, tamanho) != int(digitos[0]):
            return False
        if calc(numeros + doc[tamanho], tamanho + 1) != int(digitos[1]):
            return False
        return True
    return False

from services.seguranca.crypto_service import encrypt_sensitive_data, decrypt_sensitive_data, CIPHER_PREFIX

class ClienteManager:
    """Gestor de ciclo de vida e operações de domínio sobre Clientes."""

    def verificar_dados_conjuge(self, cliente_id: int):
        """Verifica se cliente casado possui dados do cônjuge; se não, cria pendência automática."""
        query = """
            SELECT p.nome as nome_completo, p.estado_civil, p.nome_conjuge, p.cpf_conjuge 
            FROM clientes c
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE c.id = ?
        """
        cliente = execute_query(query, params=(cliente_id,), fetch_one=True)
        if not cliente:
            return
            
        cliente = dict(cliente)
        estado_civil = str(cliente.get('estado_civil', '')).lower()
        if any(x in estado_civil for x in ['casado', 'uniao estavel', 'união estável']):
            if not cliente.get('nome_conjuge') or not cliente.get('cpf_conjuge'):
                titulo = f"Dados Faltantes - Cônjuge: {cliente.get('nome_completo')}"
                # Verifica se já existe pendência aberta com esse título
                check_query = "SELECT id FROM pendencias WHERE titulo = ? AND status != 'CONCLUIDO'"
                if not execute_query(check_query, params=(titulo,), fetch_one=True):
                    repo = PendenciaRepo()
                    repo.insert(
                        titulo=titulo,
                        descricao=f"O cliente {cliente.get('nome_completo')} está marcado como casado ou em união estável, mas faltam dados do cônjuge para georreferenciamento.",
                        prioridade="ALTA"
                    )

    def gerar_documento_cliente_workspace(self, cliente_id: int, levantamento_id: int):
        """Redireciona para o WorkspaceManager que gera o DADOS_GERAIS.json unificado."""
        try:
            ExportacaoService.gerar_documento_cliente_workspace(levantamento_id)
        except Exception as e:
            logger.error(f"Erro ao delegar geração de dados gerais no workspace: {e}")

    def registrar_historico(self, cliente_id: int, campo: str, valor_antigo: str, valor_novo: str):
        """Registra auditoria de alteração cadastral de cliente."""
        query = "INSERT INTO cliente_historico_logs (id_cliente, campo_alterado, valor_antigo, valor_novo) VALUES (?, ?, ?, ?)"
        execute_query(query, params=(cliente_id, campo, str(valor_antigo) if valor_antigo is not None else None, str(valor_novo) if valor_novo is not None else None), commit=True)


def registrar_acesso_sensivel(cliente_id: int, tipo_dado: str, acao: str, usuario: str = "Operador Local", ip_origem: str = None):
    """Grava registro de auditoria de visualização/revelação de dado sensível."""
    try:
        query = """
            INSERT INTO cliente_acesso_logs (id_cliente, tipo_dado, acao, usuario, ip_origem)
            VALUES (?, ?, ?, ?, ?)
        """
        execute_query(query, params=(cliente_id, tipo_dado, acao, usuario, ip_origem), commit=True)
    except Exception as e:
        logger.error(f"Erro ao gravar auditoria de acesso sensível: {e}")


def revelar_senha_gov(cliente_id: int, usuario: str = "Operador Local", ip_origem: str = None) -> dict:
    """
    Revela a senha GOV decodificada sob demanda e registra trilha de auditoria de acesso.
    """
    try:
        row = execute_query("SELECT id, senha_gov FROM clientes WHERE id = ?", params=(cliente_id,), fetch_one=True)
        if not row:
            return {"error": "Cliente não encontrado."}
        
        senha_cifrada = row["senha_gov"]
        if not senha_cifrada:
            return {"senha_gov": None, "message": "Nenhuma senha cadastrada."}
        
        senha_plana = decrypt_sensitive_data(senha_cifrada)
        registrar_acesso_sensivel(cliente_id, "SENHA_GOV", "REVELACAO_VISUAL", usuario=usuario, ip_origem=ip_origem)
        return {"senha_gov": senha_plana}
    except Exception as e:
        logger.error(f"Erro ao revelar senha GOV do cliente {cliente_id}: {e}", exc_info=True)
        return {"error": str(e)}


def obter_acessos_cliente(cliente_id: int) -> list[dict]:
    """Retorna o histórico de auditoria de acessos aos dados sensíveis do cliente."""
    try:
        query = """
            SELECT id, tipo_dado, acao, usuario, ip_origem, data_acesso
            FROM cliente_acesso_logs
            WHERE id_cliente = ?
            ORDER BY data_acesso DESC
        """
        rows = execute_query(query, params=(cliente_id,), fetch_all=True)
        return [dict(r) for r in rows] if rows else []
    except Exception as e:
        logger.error(f"Erro ao obter acessos do cliente {cliente_id}: {e}")
        return []


def obter_documentos_cliente(cliente_id: int) -> list[dict]:
    """Retorna todos os documentos vinculados à pessoa do cliente, incluindo caminho de anexo se houver."""
    try:
        query = """
            SELECT cd.id, cd.pessoa_id, cd.tipo_documento, cd.numero, cd.orgao_emissor,
                   cd.uf_emissor, cd.categoria_cnh, cd.data_emissao, cd.data_validade,
                   cd.observacoes, cd.arquivo_path, cd.arquivo_nome, cd.tamanho_bytes, cd.created_at
            FROM cliente_documentos cd
            JOIN clientes c ON c.pessoa_id = cd.pessoa_id
            WHERE c.id = ?
            ORDER BY cd.created_at DESC
        """
        rows = execute_query(query, params=(cliente_id,), fetch_all=True)
        return [dict(r) for r in rows] if rows else []
    except Exception as e:
        logger.error(f"Erro ao obter documentos do cliente {cliente_id}: {e}")
        return []


def salvar_documento_cliente(cliente_id: int, doc_data: dict) -> dict:
    """Insere um novo documento estruturado para a pessoa do cliente."""
    try:
        row = execute_query("SELECT pessoa_id FROM clientes WHERE id = ?", params=(cliente_id,), fetch_one=True)
        if not row or not row["pessoa_id"]:
            return {"error": "Pessoa associada ao cliente não encontrada."}
        
        pessoa_id = row["pessoa_id"]
        tipo = str(doc_data.get("tipo_documento", "RG")).upper()
        numero = str(doc_data.get("numero", "")).strip()
        if not numero:
            return {"error": "Número do documento é obrigatório."}
        
        query = """
            INSERT INTO cliente_documentos (
                pessoa_id, tipo_documento, numero, orgao_emissor, uf_emissor,
                categoria_cnh, data_emissao, data_validade, observacoes,
                arquivo_path, arquivo_nome, tamanho_bytes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        execute_query(query, params=(
            pessoa_id,
            tipo,
            numero,
            doc_data.get("orgao_emissor"),
            doc_data.get("uf_emissor"),
            doc_data.get("categoria_cnh"),
            doc_data.get("data_emissao"),
            doc_data.get("data_validade"),
            doc_data.get("observacoes"),
            doc_data.get("arquivo_path"),
            doc_data.get("arquivo_nome"),
            doc_data.get("tamanho_bytes")
        ), commit=True)
        return {"message": "Documento salvo com sucesso"}
    except Exception as e:
        logger.error(f"Erro ao salvar documento do cliente {cliente_id}: {e}")
        return {"error": str(e)}


def excluir_documento_cliente(doc_id: int) -> dict:
    """Remove um documento da tabela cliente_documentos."""
    try:
        execute_query("DELETE FROM cliente_documentos WHERE id = ?", params=(doc_id,), commit=True)
        return {"message": "Documento excluído com sucesso."}
    except Exception as e:
        logger.error(f"Erro ao excluir documento id={doc_id}: {e}")
        return {"error": str(e)}


def importar_identidade_pdf(cliente_id: int, file_bytes: bytes, filename: str, usuario: str = "Operador Local", ip_origem: str = None) -> dict:
    """
    Processa o upload de um PDF de identidade (RG, CNH, Certidões),
    salva o arquivo em disco, extrai os dados estruturados via PyMuPDF (fitz),
    atualiza o cadastro do cliente e anexa o documento na tabela cliente_documentos.
    """
    try:
        from services.processamento.identidade_parser import parse_identidade_pdf
        from config import BASE_DIR
        
        # 1. Localiza a pessoa vinculada ao cliente
        cli_row = execute_query("SELECT c.id, c.pessoa_id, p.nome, p.cpf_cnpj FROM clientes c JOIN pessoas p ON c.pessoa_id = p.id WHERE c.id = ?", params=(cliente_id,), fetch_one=True)
        if not cli_row:
            return {"error": "Cliente não encontrado.", "status_code": 404}
        pessoa_id = cli_row["pessoa_id"]

        # 2. Salva o arquivo PDF no diretório de uploads seguro
        upload_dir = os.path.join(BASE_DIR, "uploads", "documentos_clientes", str(cliente_id))
        os.makedirs(upload_dir, exist_ok=True)
        safe_filename = re.sub(r'[^\w\.-]', '_', filename) or f"identidade_{cliente_id}.pdf"
        file_path = os.path.join(upload_dir, safe_filename)
        with open(file_path, "wb") as f:
            f.write(file_bytes)
        tamanho_bytes = len(file_bytes)

        # 3. Analisa e extrai dados do PDF
        dados_extraidos = parse_identidade_pdf(file_bytes, filename)
        tipo_doc = dados_extraidos.get("tipo_identificado") or "IDENTIDADE"
        
        num_doc = dados_extraidos.get("cnh_numero") if tipo_doc == "CNH" else (dados_extraidos.get("rg_numero") or dados_extraidos.get("cpf") or "N/D")

        # 4. Registra o documento com anexo de arquivo na tabela cliente_documentos
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO cliente_documentos (
                    pessoa_id, tipo_documento, numero, orgao_emissor, uf_emissor,
                    categoria_cnh, data_validade, observacoes, arquivo_path, arquivo_nome, tamanho_bytes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pessoa_id,
                tipo_doc,
                num_doc,
                dados_extraidos.get("rg_orgao") or dados_extraidos.get("cnh_orgao_uf") or "SSP",
                dados_extraidos.get("rg_uf"),
                dados_extraidos.get("cnh_categoria"),
                dados_extraidos.get("cnh_validade"),
                f"Importado via PDF: {filename}",
                file_path,
                safe_filename,
                tamanho_bytes
            ))
            doc_id = cursor.lastrowid

            # 5. Atualiza dados faltantes na tabela pessoas e clientes
            campos_atualizar_pessoa = []
            params_pessoa = []
            
            if dados_extraidos.get("cnh_numero"):
                campos_atualizar_pessoa.append("cnh_numero = COALESCE(cnh_numero, ?)")
                params_pessoa.append(dados_extraidos["cnh_numero"])
            if dados_extraidos.get("cnh_categoria"):
                campos_atualizar_pessoa.append("cnh_categoria = COALESCE(cnh_categoria, ?)")
                params_pessoa.append(dados_extraidos["cnh_categoria"])
            if dados_extraidos.get("cnh_validade"):
                campos_atualizar_pessoa.append("cnh_validade = COALESCE(cnh_validade, ?)")
                params_pessoa.append(dados_extraidos["cnh_validade"])
            if dados_extraidos.get("cnh_orgao_uf"):
                campos_atualizar_pessoa.append("cnh_orgao_uf = COALESCE(cnh_orgao_uf, ?)")
                params_pessoa.append(dados_extraidos["cnh_orgao_uf"])
            if dados_extraidos.get("rg_numero"):
                campos_atualizar_pessoa.append("rg = COALESCE(rg, ?)")
                params_pessoa.append(dados_extraidos["rg_numero"])
            if dados_extraidos.get("rg_orgao"):
                campos_atualizar_pessoa.append("rg_orgao = COALESCE(rg_orgao, ?)")
                params_pessoa.append(dados_extraidos["rg_orgao"])
            if dados_extraidos.get("rg_uf"):
                campos_atualizar_pessoa.append("rg_uf = COALESCE(rg_uf, ?)")
                params_pessoa.append(dados_extraidos["rg_uf"])
            if dados_extraidos.get("naturalidade"):
                campos_atualizar_pessoa.append("naturalidade = COALESCE(naturalidade, ?)")
                params_pessoa.append(dados_extraidos["naturalidade"])
            if dados_extraidos.get("nacionalidade"):
                campos_atualizar_pessoa.append("nacionalidade = COALESCE(nacionalidade, ?)")
                params_pessoa.append(dados_extraidos["nacionalidade"])

            if campos_atualizar_pessoa:
                params_p = list(params_pessoa) + [pessoa_id]
                cursor.execute(f"UPDATE pessoas SET {', '.join(campos_atualizar_pessoa)} WHERE id = ?", params_p)
                
            # Atualiza na tabela clientes
            campos_atualizar_cli = [c for c in campos_atualizar_pessoa if not c.startswith("rg = ") and not c.startswith("nacionalidade = ")]
            params_cli = [p for i, p in enumerate(params_pessoa) if not campos_atualizar_pessoa[i].startswith("rg = ") and not campos_atualizar_pessoa[i].startswith("nacionalidade = ")]
            if dados_extraidos.get("data_nascimento"):
                campos_atualizar_cli.append("data_nascimento_fundacao = COALESCE(data_nascimento_fundacao, ?)")
                params_cli.append(dados_extraidos["data_nascimento"])
                
            if campos_atualizar_cli:
                params_cli.append(cliente_id)
                cursor.execute(f"UPDATE clientes SET {', '.join(campos_atualizar_cli)} WHERE id = ?", params_cli)

            conn.commit()

        # 6. Grava trilha de auditoria
        registrar_acesso_sensivel(cliente_id, "DOCUMENTO_PDF", f"IMPORTACAO_IDENTIDADE_{tipo_doc} ({filename})", usuario=usuario, ip_origem=ip_origem)

        return {
            "sucesso": True,
            "documento_id": doc_id,
            "tipo_documento": tipo_doc,
            "dados_extraidos": {k: v for k, v in dados_extraidos.items() if k != "texto_bruto"},
            "arquivo_nome": safe_filename,
            "mensagem": f"Documento {tipo_doc} importado e analisado com sucesso!"
        }
    except Exception as e:
        logger.error(f"Erro ao importar PDF de identidade do cliente {cliente_id}: {e}", exc_info=True)
        return {"error": f"Falha no processamento do PDF: {str(e)}"}


def cadastrar_cliente(cli_data: dict) -> dict:
    """
    Sanitiza e valida os dados de um novo cliente (PF ou PJ).
    Efetua o cadastro atômico no banco de dados, criptografa senha GOV e salva metadados e documentos.
    """
    nome_completo = cli_data.get("nome_completo")
    cpf_cnpj = cli_data.get("cpf_cnpj")
    rg_ie = cli_data.get("rg_ie")
    data_nascimento_fundacao = cli_data.get("data_nascimento_fundacao")
    estado_civil = cli_data.get("estado_civil")
    profissao = cli_data.get("profissao")
    nacionalidade = cli_data.get("nacionalidade")
    nome_conjuge = cli_data.get("nome_conjuge")
    cpf_conjuge = cli_data.get("cpf_conjuge")
    rg_conjuge = cli_data.get("rg_conjuge")
    regime_bens = cli_data.get("regime_bens")
    email = cli_data.get("email")
    telefone = cli_data.get("telefone")
    endereco_completo = cli_data.get("endereco_completo")
    cidade = cli_data.get("cidade")
    estado = cli_data.get("estado")
    cep = cli_data.get("cep")
    sexo = cli_data.get("sexo", "M")
    senha_gov_raw = cli_data.get("senha_gov")
    metadados = cli_data.get("metadados", {})
    documentos = cli_data.get("documentos", [])
    
    # Novos campos PF / PJ e Qualificação Civil Expandida
    tipo_pessoa = cli_data.get("tipo_pessoa")
    razao_social = cli_data.get("razao_social")
    nome_fantasia = cli_data.get("nome_fantasia")
    inscricao_estadual = cli_data.get("inscricao_estadual")
    inscricao_municipal = cli_data.get("inscricao_municipal")
    representante_legal_id = cli_data.get("representante_legal_id")
    cnh_numero = cli_data.get("cnh_numero")
    cnh_categoria = cli_data.get("cnh_categoria")
    cnh_validade = cli_data.get("cnh_validade")
    cnh_orgao_uf = cli_data.get("cnh_orgao_uf")
    rg_orgao = cli_data.get("rg_orgao")
    rg_uf = cli_data.get("rg_uf")
    naturalidade = cli_data.get("naturalidade")
    certidao_casamento_matricula = cli_data.get("certidao_casamento_matricula")
    genero_conjuge = cli_data.get("genero_conjuge")
    nacionalidade_conjuge = cli_data.get("nacionalidade_conjuge")
    profissao_conjuge = cli_data.get("profissao_conjuge")
    rg_orgao_conjuge = cli_data.get("rg_orgao_conjuge")
    rg_uf_conjuge = cli_data.get("rg_uf_conjuge")
    data_casamento = cli_data.get("data_casamento")
    cartorio_casamento = cli_data.get("cartorio_casamento")
    livro_casamento = cli_data.get("livro_casamento")
    folha_casamento = cli_data.get("folha_casamento")
    termo_casamento = cli_data.get("termo_casamento")
    bairro = cli_data.get("bairro")
    endereco_sem_numero = cli_data.get("endereco_sem_numero")
    numero_endereco = cli_data.get("numero_endereco")

    # Sanitização de CPF/CNPJ
    cpf_cnpj = re.sub(r'\D', '', str(cpf_cnpj)) if (cpf_cnpj and str(cpf_cnpj).strip()) else None
    if cpf_conjuge:
        cpf_conjuge = re.sub(r'\D', '', str(cpf_conjuge))

    # Inferência inteligente de tipo_pessoa se não fornecido
    if not tipo_pessoa:
        if cpf_cnpj and len(cpf_cnpj) == 14:
            tipo_pessoa = "PJ"
        elif razao_social or nome_fantasia:
            tipo_pessoa = "PJ"
        else:
            tipo_pessoa = "PF"

    if not validar_cpf_cnpj(cpf_cnpj):
        return {"error": "CPF/CNPJ inválido"}

    # Se PJ e nome_completo não informado mas razao_social informada, padroniza
    if tipo_pessoa == "PJ" and not nome_completo and razao_social:
        nome_completo = razao_social
    elif tipo_pessoa == "PJ" and not razao_social and nome_completo:
        razao_social = nome_completo

    # Criptografia segura da Senha GOV
    senha_gov = encrypt_sensitive_data(senha_gov_raw) if (senha_gov_raw and senha_gov_raw.strip() and senha_gov_raw != '••••••••') else None

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # 1. Verifica se já existe uma pessoa com esse CPF/CNPJ
            pessoa_id = None
            if cpf_cnpj:
                cursor.execute("""
                    SELECT id FROM pessoas 
                    WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ?
                """, (cpf_cnpj,))
                row_p = cursor.fetchone()
                if row_p:
                    pessoa_id = row_p[0]
                    # Verifica se essa pessoa já possui papel de cliente comercial
                    cursor.execute("SELECT id FROM clientes WHERE pessoa_id = ?", (pessoa_id,))
                    if cursor.fetchone():
                        return {"error": "CPF/CNPJ já cadastrado"}
            
            # 2. Se não existir, insere os dados da pessoa
            if not pessoa_id:
                cursor.execute("""
                    INSERT INTO pessoas (
                        nome, cpf_cnpj, rg, genero, nacionalidade, profissao, estado_civil, regime_bens, 
                        endereco_completo, endereco_sem_numero, numero_endereco, bairro,
                        nome_conjuge, cpf_conjuge, rg_conjuge, genero_conjuge, nacionalidade_conjuge, profissao_conjuge,
                        rg_orgao_conjuge, rg_uf_conjuge, data_casamento, cartorio_casamento, livro_casamento, folha_casamento, termo_casamento,
                        tipo_pessoa, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal, representante_legal_id,
                        cnh_numero, cnh_categoria, cnh_validade, cnh_orgao_uf, rg_orgao, rg_uf, naturalidade, certidao_casamento_matricula
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    nome_completo, cpf_cnpj, rg_ie, sexo, nacionalidade, profissao, estado_civil, regime_bens, 
                    endereco_completo, endereco_sem_numero, numero_endereco, bairro,
                    nome_conjuge, cpf_conjuge, rg_conjuge, genero_conjuge, nacionalidade_conjuge, profissao_conjuge,
                    rg_orgao_conjuge, rg_uf_conjuge, data_casamento, cartorio_casamento, livro_casamento, folha_casamento, termo_casamento,
                    tipo_pessoa, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal, representante_legal_id,
                    cnh_numero, cnh_categoria, cnh_validade, cnh_orgao_uf, rg_orgao, rg_uf, naturalidade, certidao_casamento_matricula
                ))
                pessoa_id = cursor.lastrowid
            else:
                # Atualiza os dados da pessoa existente
                cursor.execute("""
                    UPDATE pessoas
                    SET tipo_pessoa = ?, razao_social = ?, nome_fantasia = ?, inscricao_estadual = ?, inscricao_municipal = ?, representante_legal_id = ?,
                        cnh_numero = ?, cnh_categoria = ?, cnh_validade = ?, cnh_orgao_uf = ?, rg_orgao = ?, rg_uf = ?, naturalidade = ?, certidao_casamento_matricula = ?,
                        genero = ?, nacionalidade = ?, profissao = ?, estado_civil = ?, regime_bens = ?,
                        endereco_completo = ?, endereco_sem_numero = ?, numero_endereco = ?, bairro = ?,
                        nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?, genero_conjuge = ?, nacionalidade_conjuge = ?, profissao_conjuge = ?,
                        rg_orgao_conjuge = ?, rg_uf_conjuge = ?, data_casamento = ?, cartorio_casamento = ?, livro_casamento = ?, folha_casamento = ?, termo_casamento = ?
                    WHERE id = ?
                """, (
                    tipo_pessoa, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal, representante_legal_id,
                    cnh_numero, cnh_categoria, cnh_validade, cnh_orgao_uf, rg_orgao, rg_uf, naturalidade, certidao_casamento_matricula,
                    sexo, nacionalidade, profissao, estado_civil, regime_bens,
                    endereco_completo, endereco_sem_numero, numero_endereco, bairro,
                    nome_conjuge, cpf_conjuge, rg_conjuge, genero_conjuge, nacionalidade_conjuge, profissao_conjuge,
                    rg_orgao_conjuge, rg_uf_conjuge, data_casamento, cartorio_casamento, livro_casamento, folha_casamento, termo_casamento,
                    pessoa_id
                ))
                
            # 3. Insere a associação do cliente apontando para a pessoa
            cursor.execute("""
                INSERT INTO clientes (
                    pessoa_id, profissional_id, data_nascimento_fundacao, email, telefone, cidade, estado, cep, sexo, senha_gov,
                    cnh_numero, cnh_categoria, cnh_validade, cnh_orgao_uf, rg_orgao, rg_uf, naturalidade, certidao_casamento_matricula, bairro
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pessoa_id, cli_data.get("profissional_id") or 1, data_nascimento_fundacao, email, telefone, cidade, estado, cep, sexo, senha_gov,
                cnh_numero, cnh_categoria, cnh_validade, cnh_orgao_uf, rg_orgao, rg_uf, naturalidade, certidao_casamento_matricula, bairro
            ))
            cliente_id = cursor.lastrowid
            
            # 4. Grava metadados customizados
            if metadados:
                for k, v in metadados.items():
                    cursor.execute("INSERT INTO cliente_metadados (id_cliente, chave, valor) VALUES (?, ?, ?)", (cliente_id, k, v))
            
            # 5. Grava documentos se informados
            if documentos and isinstance(documentos, list):
                for doc in documentos:
                    if isinstance(doc, dict) and doc.get("numero"):
                        cursor.execute("""
                            INSERT INTO cliente_documentos (
                                pessoa_id, tipo_documento, numero, orgao_emissor, uf_emissor,
                                categoria_cnh, data_emissao, data_validade, observacoes
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            pessoa_id,
                            doc.get("tipo_documento", "RG").upper(),
                            str(doc.get("numero")).strip(),
                            doc.get("orgao_emissor"),
                            doc.get("uf_emissor"),
                            doc.get("categoria_cnh"),
                            doc.get("data_emissao"),
                            doc.get("data_validade"),
                            doc.get("observacoes")
                        ))
            else:
                if rg_ie and rg_ie.strip():
                    cursor.execute("""
                        INSERT INTO cliente_documentos (pessoa_id, tipo_documento, numero, orgao_emissor, uf_emissor)
                        VALUES (?, 'RG', ?, ?, ?)
                    """, (pessoa_id, rg_ie.strip(), rg_orgao or 'SSP', rg_uf or estado or 'PR'))
                if cnh_numero and cnh_numero.strip():
                    cursor.execute("""
                        INSERT INTO cliente_documentos (pessoa_id, tipo_documento, numero, orgao_emissor, categoria_cnh, data_validade)
                        VALUES (?, 'CNH', ?, ?, ?, ?)
                    """, (pessoa_id, cnh_numero.strip(), cnh_orgao_uf or 'DETRAN', cnh_categoria, cnh_validade))

            conn.commit()
            
        mgr = ClienteManager()
        mgr.verificar_dados_conjuge(cliente_id)
        
        return {"id": cliente_id, "message": "Cliente cadastrado com sucesso"}
    except Exception as e:
        logger.error(f"Erro no cadastro de cliente: {e}", exc_info=True)
        return {"error": str(e)}


def atualizar_cliente(cliente_id: int, cli_data: dict) -> dict:
    """
    Sanitiza, valida e atualiza os dados do cliente no banco (PF ou PJ).
    Registra histórico de auditoria comparativo e sincroniza workspaces de levantamentos ativos.
    """
    nome_completo = cli_data.get("nome_completo")
    cpf_cnpj = cli_data.get("cpf_cnpj")
    rg_ie = cli_data.get("rg_ie")
    data_nascimento_fundacao = cli_data.get("data_nascimento_fundacao")
    estado_civil = cli_data.get("estado_civil")
    profissao = cli_data.get("profissao")
    nacionalidade = cli_data.get("nacionalidade")
    nome_conjuge = cli_data.get("nome_conjuge")
    cpf_conjuge = cli_data.get("cpf_conjuge")
    rg_conjuge = cli_data.get("rg_conjuge")
    regime_bens = cli_data.get("regime_bens")
    email = cli_data.get("email")
    telefone = cli_data.get("telefone")
    endereco_completo = cli_data.get("endereco_completo")
    cidade = cli_data.get("cidade")
    estado = cli_data.get("estado")
    cep = cli_data.get("cep")
    sexo = cli_data.get("sexo", "M")
    senha_gov_input = cli_data.get("senha_gov")
    metadados = cli_data.get("metadados", {})
    documentos = cli_data.get("documentos")
    
    # Novos campos PF / PJ e Qualificação Civil Expandida
    tipo_pessoa = cli_data.get("tipo_pessoa")
    razao_social = cli_data.get("razao_social")
    nome_fantasia = cli_data.get("nome_fantasia")
    inscricao_estadual = cli_data.get("inscricao_estadual")
    inscricao_municipal = cli_data.get("inscricao_municipal")
    representante_legal_id = cli_data.get("representante_legal_id")
    cnh_numero = cli_data.get("cnh_numero")
    cnh_categoria = cli_data.get("cnh_categoria")
    cnh_validade = cli_data.get("cnh_validade")
    cnh_orgao_uf = cli_data.get("cnh_orgao_uf")
    rg_orgao = cli_data.get("rg_orgao")
    rg_uf = cli_data.get("rg_uf")
    naturalidade = cli_data.get("naturalidade")
    certidao_casamento_matricula = cli_data.get("certidao_casamento_matricula")
    genero_conjuge = cli_data.get("genero_conjuge")
    nacionalidade_conjuge = cli_data.get("nacionalidade_conjuge")
    profissao_conjuge = cli_data.get("profissao_conjuge")
    rg_orgao_conjuge = cli_data.get("rg_orgao_conjuge")
    rg_uf_conjuge = cli_data.get("rg_uf_conjuge")
    data_casamento = cli_data.get("data_casamento")
    cartorio_casamento = cli_data.get("cartorio_casamento")
    livro_casamento = cli_data.get("livro_casamento")
    folha_casamento = cli_data.get("folha_casamento")
    termo_casamento = cli_data.get("termo_casamento")
    bairro = cli_data.get("bairro")
    endereco_sem_numero = cli_data.get("endereco_sem_numero")
    numero_endereco = cli_data.get("numero_endereco")

    # Sanitização de CPF/CNPJ
    cpf_cnpj = re.sub(r'\D', '', str(cpf_cnpj)) if (cpf_cnpj and str(cpf_cnpj).strip()) else None
    if cpf_conjuge:
        cpf_conjuge = re.sub(r'\D', '', str(cpf_conjuge))

    if not tipo_pessoa:
        if cpf_cnpj and len(cpf_cnpj) == 14:
            tipo_pessoa = "PJ"
        else:
            tipo_pessoa = "PF"

    if not validar_cpf_cnpj(cpf_cnpj):
        return {"error": "CPF/CNPJ inválido"}
        
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # 1. Pega dados antigos da pessoa mesclados para histórico de auditoria
            query_old = """
                SELECT c.id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.genero, p.nacionalidade,
                       p.profissao, p.estado_civil, p.regime_bens, p.endereco_completo, p.endereco_sem_numero, p.numero_endereco, p.bairro,
                       p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, p.genero_conjuge, p.nacionalidade_conjuge, p.profissao_conjuge,
                       p.rg_orgao_conjuge, p.rg_uf_conjuge, p.data_casamento, p.cartorio_casamento, p.livro_casamento, p.folha_casamento, p.termo_casamento,
                       p.tipo_pessoa, p.razao_social,
                       p.nome_fantasia, p.inscricao_estadual, p.inscricao_municipal, p.representante_legal_id,
                       p.cnh_numero, p.cnh_categoria, p.cnh_validade, p.cnh_orgao_uf, p.rg_orgao, p.rg_uf,
                       p.naturalidade, p.certidao_casamento_matricula,
                       c.data_nascimento_fundacao, c.email, c.telefone,
                       c.cidade, c.estado, c.cep, c.sexo, c.senha_gov, c.created_at, c.pessoa_id
                FROM clientes c
                JOIN pessoas p ON c.pessoa_id = p.id
                WHERE c.id = ?
            """
            cursor.execute(query_old, (cliente_id,))
            row = cursor.fetchone()
            if not row:
                return {"error": "Cliente não encontrado."}
            old_data = dict(row)
            pessoa_id = old_data["pessoa_id"]
            
            # 2. Valida se o CPF já pertence a outro cliente comercial
            if cpf_cnpj:
                cursor.execute("""
                    SELECT c.id FROM clientes c
                    JOIN pessoas p ON c.pessoa_id = p.id
                    WHERE REPLACE(REPLACE(REPLACE(p.cpf_cnpj, '.', ''), '-', ''), '/', '') = ? AND c.id != ?
                """, (cpf_cnpj, cliente_id))
                if cursor.fetchone():
                    return {"error": "CPF/CNPJ já cadastrado para outro cliente"}
            
            # 3. Tratamento de senha GOV criptografada
            senha_gov_final = old_data.get("senha_gov")
            if senha_gov_input is not None and senha_gov_input != '••••••••':
                if senha_gov_input.strip():
                    senha_gov_final = encrypt_sensitive_data(senha_gov_input.strip())
                else:
                    senha_gov_final = None

            # 4. Atualiza os dados civis da pessoa
            cursor.execute("""
                UPDATE pessoas
                SET nome = ?, cpf_cnpj = ?, rg = ?, genero = ?, nacionalidade = ?, profissao = ?,
                    estado_civil = ?, regime_bens = ?, endereco_completo = ?, endereco_sem_numero = ?, numero_endereco = ?, bairro = ?,
                    nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?, genero_conjuge = ?, nacionalidade_conjuge = ?, profissao_conjuge = ?,
                    rg_orgao_conjuge = ?, rg_uf_conjuge = ?, data_casamento = ?, cartorio_casamento = ?, livro_casamento = ?, folha_casamento = ?, termo_casamento = ?,
                    tipo_pessoa = ?, razao_social = ?, nome_fantasia = ?,
                    inscricao_estadual = ?, inscricao_municipal = ?, representante_legal_id = ?,
                    cnh_numero = ?, cnh_categoria = ?, cnh_validade = ?, cnh_orgao_uf = ?,
                    rg_orgao = ?, rg_uf = ?, naturalidade = ?, certidao_casamento_matricula = ?
                WHERE id = ?
            """, (
                nome_completo, cpf_cnpj, rg_ie, sexo, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo, endereco_sem_numero, numero_endereco, bairro,
                nome_conjuge, cpf_conjuge, rg_conjuge, genero_conjuge, nacionalidade_conjuge, profissao_conjuge,
                rg_orgao_conjuge, rg_uf_conjuge, data_casamento, cartorio_casamento, livro_casamento, folha_casamento, termo_casamento,
                tipo_pessoa, razao_social, nome_fantasia,
                inscricao_estadual, inscricao_municipal, representante_legal_id,
                cnh_numero, cnh_categoria, cnh_validade, cnh_orgao_uf,
                rg_orgao, rg_uf, naturalidade, certidao_casamento_matricula,
                pessoa_id
            ))
            
            # 5. Atualiza os dados de relacionamento na tabela clientes
            cursor.execute("""
                UPDATE clientes 
                SET data_nascimento_fundacao = ?, email = ?, telefone = ?, cidade = ?, estado = ?, cep = ?, sexo = ?, senha_gov = ?,
                    cnh_numero = ?, cnh_categoria = ?, cnh_validade = ?, cnh_orgao_uf = ?,
                    rg_orgao = ?, rg_uf = ?, naturalidade = ?, certidao_casamento_matricula = ?, bairro = ?
                WHERE id = ?
            """, (
                data_nascimento_fundacao, email, telefone, cidade, estado, cep, sexo, senha_gov_final,
                cnh_numero, cnh_categoria, cnh_validade, cnh_orgao_uf,
                rg_orgao, rg_uf, naturalidade, certidao_casamento_matricula, bairro,
                cliente_id
            ))
            
            # Atualiza metadados (limpa e insere novos)
            cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cliente_id,))
            if metadados:
                for k, v in metadados.items():
                    cursor.execute("INSERT INTO cliente_metadados (id_cliente, chave, valor) VALUES (?, ?, ?)", (cliente_id, k, v))

            # Atualiza documentos de identificação se CNH ou RG foram informados
            if cnh_numero and cnh_numero.strip():
                cursor.execute("""
                    SELECT id FROM cliente_documentos WHERE pessoa_id = ? AND tipo_documento = 'CNH'
                """, (pessoa_id,))
                cnh_row = cursor.fetchone()
                if cnh_row:
                    cursor.execute("""
                        UPDATE cliente_documentos
                        SET numero = ?, categoria_cnh = ?, data_validade = ?, orgao_emissor = ?
                        WHERE id = ?
                    """, (cnh_numero.strip(), cnh_categoria, cnh_validade, cnh_orgao_uf or 'DETRAN', cnh_row[0]))
                else:
                    cursor.execute("""
                        INSERT INTO cliente_documentos (pessoa_id, tipo_documento, numero, orgao_emissor, categoria_cnh, data_validade)
                        VALUES (?, 'CNH', ?, ?, ?, ?)
                    """, (pessoa_id, cnh_numero.strip(), cnh_orgao_uf or 'DETRAN', cnh_categoria, cnh_validade))
            
            # Sincroniza documentos se fornecidos explicitamente
            if documentos is not None and isinstance(documentos, list):
                cursor.execute("DELETE FROM cliente_documentos WHERE pessoa_id = ?", (pessoa_id,))
                for doc in documentos:
                    if isinstance(doc, dict) and doc.get("numero"):
                        cursor.execute("""
                            INSERT INTO cliente_documentos (
                                pessoa_id, tipo_documento, numero, orgao_emissor, uf_emissor,
                                categoria_cnh, data_emissao, data_validade, observacoes
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            pessoa_id,
                            doc.get("tipo_documento", "RG").upper(),
                            str(doc.get("numero")).strip(),
                            doc.get("orgao_emissor"),
                            doc.get("uf_emissor"),
                            doc.get("categoria_cnh"),
                            doc.get("data_emissao"),
                            doc.get("data_validade"),
                            doc.get("observacoes")
                        ))

            conn.commit()
            
        # AUDITORIA COMPLETA: Itera sobre os campos para registrar mudanças
        mgr = ClienteManager()
        for campo, valor_novo in cli_data.items():
            if campo == 'metadados':
                continue
            valor_antigo = old_data.get(campo)
            str_antigo = str(valor_antigo) if valor_antigo is not None else ""
            str_novo = str(valor_novo) if valor_novo is not None else ""
            if str_antigo != str_novo and valor_novo is not None:
                mgr.registrar_historico(cliente_id, campo, str_antigo, str_novo)
        
        # SINCRONIZAÇÃO DE WORKSPACE: Atualiza JSON em todos os levantamentos ATIVOS vinculados
        query_ativos = """
            SELECT l.id 
            FROM propriedade_clientes pc 
            JOIN propriedades p ON pc.propriedade_id = p.id 
            JOIN levantamentos l ON p.id = l.propriedade_id 
            WHERE pc.cliente_id = ? AND l.status = 'EM_ANDAMENTO'
        """
        levs_vinculados = execute_query(query_ativos, params=(cliente_id,), fetch_all=True)
        for lev in levs_vinculados:
            try:
                ExportacaoService.gerar_documento_cliente_workspace(lev['id'])
            except Exception as e_ws:
                logger.warning(f"Aviso ao sincronizar workspace do levantamento {lev['id']}: {e_ws}")
        
        mgr.verificar_dados_conjuge(cliente_id)
            
        return {"message": "Cliente atualizado e sincronizado com sucesso"}
    except Exception as e:
        logger.error(f"Erro na atualização do cliente {cliente_id}: {e}", exc_info=True)
        return {"error": str(e)}


def excluir_cliente(cliente_id: int) -> dict:
    """
    Exclui um cliente com validação de levantamentos vinculados e
    limpeza cirúrgica da pessoa apenas se ela não possuir outros vínculos no sistema.
    """
    try:
        # 1. Verifica se há levantamentos vinculados
        levs = execute_query(
            "SELECT count(l.id) as qtd FROM propriedade_clientes pc JOIN propriedades p ON pc.propriedade_id = p.id JOIN levantamentos l ON p.id = l.propriedade_id WHERE pc.cliente_id = ?",
            params=(cliente_id,),
            fetch_one=True
        )
        if levs and levs['qtd'] > 0:
            return {
                "error": "Não é possível excluir cliente com levantamentos vinculados.",
                "status_code": 409
            }

        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # 2. Localiza a pessoa associada ao cliente
            cursor.execute("SELECT pessoa_id FROM clientes WHERE id = ?", (cliente_id,))
            row = cursor.fetchone()
            if not row:
                return {"error": "Cliente não encontrado.", "status_code": 404}
            pessoa_id = row[0]

            # 3. Limpa dependências diretas do cliente
            cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cliente_id,))
            cursor.execute("DELETE FROM cliente_historico_logs WHERE id_cliente = ?", (cliente_id,))
            cursor.execute("DELETE FROM propriedade_clientes WHERE cliente_id = ?", (cliente_id,))
            cursor.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))

            # 4. Limpeza cirúrgica de pessoa: remove apenas se não pertencer a outro cliente ou confrontante
            if pessoa_id:
                cursor.execute("SELECT 1 FROM clientes WHERE pessoa_id = ? LIMIT 1", (pessoa_id,))
                outro_cli = cursor.fetchone()
                cursor.execute("SELECT 1 FROM confrontantes WHERE pessoa_id = ? LIMIT 1", (pessoa_id,))
                outro_conf = cursor.fetchone()
                if not outro_cli and not outro_conf:
                    cursor.execute("DELETE FROM pessoas WHERE id = ?", (pessoa_id,))

            conn.commit()

        return {"sucesso": True, "message": "Cliente excluído com sucesso"}
    except Exception as e:
        logger.error(f"Erro ao excluir cliente id={cliente_id}: {e}", exc_info=True)
        return {"error": f"Erro interno ao excluir cliente: {str(e)}", "status_code": 500}


def excluir_clientes_lote(cliente_ids: list[int]) -> dict:
    """
    Exclui múltiplos clientes em uma única transação atômica no SQLite,
    garantindo que nenhum lock concorrente ocorra e reportando sucessos e erros.
    """
    if not cliente_ids:
        return {"sucessos": 0, "erros": [], "total_processado": 0}

    sucessos = 0
    erros = []

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            for cid in cliente_ids:
                # 1. Verifica se há levantamentos vinculados
                cursor.execute("""
                    SELECT count(l.id) as qtd 
                    FROM propriedade_clientes pc 
                    JOIN propriedades p ON pc.propriedade_id = p.id 
                    JOIN levantamentos l ON p.id = l.propriedade_id 
                    WHERE pc.cliente_id = ?
                """, (cid,))
                lev_row = cursor.fetchone()
                if lev_row and lev_row[0] > 0:
                    erros.append(f"Cliente ID {cid}: possui levantamentos vinculados.")
                    continue

                # 2. Localiza a pessoa
                cursor.execute("SELECT pessoa_id FROM clientes WHERE id = ?", (cid,))
                row = cursor.fetchone()
                if not row:
                    erros.append(f"Cliente ID {cid}: não encontrado.")
                    continue
                pessoa_id = row[0]

                # 3. Limpa dependências
                cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cid,))
                cursor.execute("DELETE FROM cliente_historico_logs WHERE id_cliente = ?", (cid,))
                cursor.execute("DELETE FROM propriedade_clientes WHERE cliente_id = ?", (cid,))
                cursor.execute("DELETE FROM clientes WHERE id = ?", (cid,))

                # 4. Limpeza cirúrgica da pessoa
                if pessoa_id:
                    cursor.execute("SELECT 1 FROM clientes WHERE pessoa_id = ? LIMIT 1", (pessoa_id,))
                    outro_cli = cursor.fetchone()
                    cursor.execute("SELECT 1 FROM confrontantes WHERE pessoa_id = ? LIMIT 1", (pessoa_id,))
                    outro_conf = cursor.fetchone()
                    if not outro_cli and not outro_conf:
                        cursor.execute("DELETE FROM pessoas WHERE id = ?", (pessoa_id,))

                sucessos += 1

            conn.commit()

        return {
            "sucessos": sucessos,
            "erros": erros,
            "total_processado": len(cliente_ids)
        }
    except Exception as e:
        logger.error(f"Erro na exclusão em lote de clientes: {e}", exc_info=True)
        return {
            "sucessos": sucessos,
            "erros": erros + [f"Erro na transação: {str(e)}"],
            "total_processado": len(cliente_ids)
        }


def vincular_cliente_propriedade(prop_id: int, cliente_id: int, percentual_participacao: float) -> dict:
    """
    Vincula ou atualiza a participação do proprietário na fazenda com limite estrito de 100% no total.
    """
    try:
        # Validação estrita de 100% de participação
        # 1. Pega a soma das participações dos OUTROS clientes vinculados
        soma_outros_row = execute_query(
            "SELECT SUM(percentual_participacao) as soma FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id != ?",
            params=(prop_id, cliente_id),
            fetch_one=True
        )
        soma_outros = float(soma_outros_row['soma']) if (soma_outros_row and soma_outros_row['soma'] is not None) else 0.0
        
        if soma_outros + percentual_participacao > 100.0:
            restante = max(0.0, 100.0 - soma_outros)
            return {"error": f"Participação inválida. A soma das participações não pode exceder 100%. Restante disponível: {restante:.2f}%"}

        # 2. Verifica se o vínculo já existe para atualizar ou se deve criar
        exists = execute_query(
            "SELECT id FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?",
            params=(prop_id, cliente_id),
            fetch_one=True
        )
        if exists:
            execute_query(
                "UPDATE propriedade_clientes SET percentual_participacao = ? WHERE propriedade_id = ? AND cliente_id = ?",
                params=(percentual_participacao, prop_id, cliente_id),
                commit=True
            )
            return {"message": "Participação do proprietário atualizada com sucesso"}
        else:
            execute_query(
                "INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, ?)",
                params=(prop_id, cliente_id, percentual_participacao),
                commit=True
            )
            return {"message": "Proprietário vinculado com sucesso"}
    except Exception as e:
        logger.error(f"Erro na vinculação cliente-propriedade: {e}", exc_info=True)
        return {"error": str(e)}
