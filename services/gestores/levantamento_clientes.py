import re
import math
import logging
from database.connection import DatabaseManager, execute_query
from services.gestores.cliente_manager import ClienteManager, validar_cpf_cnpj
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from services.processamento.geoprocessamento import geodesic_to_ecef, ecef_to_geodesic, calcular_zona_utm_segura
from utils.transformer_cache import get_transformer

logger = logging.getLogger(__name__)

def cadastrar_cliente(cli_data: dict) -> dict:
    """
    Sanitiza e valida os dados de um novo cliente.
    Efetua o cadastro no banco de dados e metadados.
    Retorna dicionário com sucesso ou erro.
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
    senha_gov = cli_data.get("senha_gov")
    metadados = cli_data.get("metadados", {})

    # Sanitização de CPF/CNPJ
    cpf_cnpj = re.sub(r'\D', '', cpf_cnpj) if (cpf_cnpj and str(cpf_cnpj).strip()) else None
    if cpf_conjuge:
        cpf_conjuge = re.sub(r'\D', '', cpf_conjuge)

    if not validar_cpf_cnpj(cpf_cnpj):
        return {"error": "CPF/CNPJ inválido"}

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
                        nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, regime_bens,
                        endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (nome_completo, cli_data.get("cpf_cnpj"), rg_ie, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge))
                pessoa_id = cursor.lastrowid

            # 3. Insere a associação do cliente apontando para a pessoa
            cursor.execute("""
                INSERT INTO clientes (pessoa_id, profissional_id, email, telefone, cidade, estado, cep, sexo, senha_gov)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (pessoa_id, cli_data.get("profissional_id") or 1, email, telefone, cidade, estado, cep, sexo, senha_gov))
            cliente_id = cursor.lastrowid

            if metadados:
                for k, v in metadados.items():
                    cursor.execute("INSERT INTO cliente_metadados (id_cliente, chave, valor) VALUES (?, ?, ?)", (cliente_id, k, v))
            conn.commit()

        mgr = ClienteManager()
        mgr.verificar_dados_conjuge(cliente_id)

        return {"id": cliente_id, "message": "Cliente cadastrado com sucesso"}
    except Exception as e:
        logger.error(f"Erro no cadastro de cliente: {e}")
        return {"error": str(e)}

def atualizar_cliente(cliente_id: int, cli_data: dict) -> dict:
    """
    Sanitiza, valida e atualiza os dados do cliente no banco.
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
    senha_gov = cli_data.get("senha_gov")
    metadados = cli_data.get("metadados", {})

    # Sanitização de CPF/CNPJ
    cpf_cnpj = re.sub(r'\D', '', cpf_cnpj) if (cpf_cnpj and str(cpf_cnpj).strip()) else None
    if cpf_conjuge:
        cpf_conjuge = re.sub(r'\D', '', cpf_conjuge)

    if not validar_cpf_cnpj(cpf_cnpj):
        return {"error": "CPF/CNPJ inválido"}

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # 1. Pega dados antigos da pessoa mesclados para histórico de auditoria
            query_old = """
                SELECT c.id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.nacionalidade,
                       p.profissao, p.estado_civil, p.regime_bens, p.endereco_completo,
                       p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, c.email, c.telefone,
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

            # 3. Atualiza os dados civis da pessoa
            cursor.execute("""
                UPDATE pessoas
                SET nome = ?, cpf_cnpj = ?, rg = ?, nacionalidade = ?, profissao = ?,
                    estado_civil = ?, regime_bens = ?, endereco_completo = ?,
                    nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?
                WHERE id = ?
            """, (nome_completo, cli_data.get("cpf_cnpj"), rg_ie, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge, pessoa_id))

            # 4. Atualiza os dados de relacionamento na tabela clientes
            cursor.execute("""
                UPDATE clientes
                SET email = ?, telefone = ?, cidade = ?, estado = ?, cep = ?, sexo = ?, senha_gov = ?
                WHERE id = ?
            """, (email, telefone, cidade, estado, cep, sexo, senha_gov, cliente_id))

            # Atualiza metadados (limpa e insere novos)
            cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cliente_id,))
            if metadados:
                for k, v in metadados.items():
                    cursor.execute("INSERT INTO cliente_metadados (id_cliente, chave, valor) VALUES (?, ?, ?)", (cliente_id, k, v))

            conn.commit()

        # AUDITORIA COMPLETA: Itera sobre todos os campos para registrar mudanças
        mgr = ClienteManager()
        for campo, valor_novo in cli_data.items():
            if campo == 'metadados': continue
            valor_antigo = old_data.get(campo)
            if str(valor_antigo) != str(valor_novo) and valor_novo is not None:
                mgr.registrar_historico(cliente_id, campo, valor_antigo, valor_novo)

        # SINCRONIZAÇÃO DE WORKSPACE: Atualiza JSON em todos os levantamentos ATIVOS vinculados
        query_ativos = """
            SELECT l.id
            FROM propriedade_clientes pc
            JOIN propriedades p ON pc.propriedade_id = p.id
            JOIN levantamentos l ON p.id = l.propriedade_id
            WHERE pc.cliente_id = ? AND l.status = 'EM_ANDAMENTO'
        """
        levs_vinculados = execute_query(query_ativos, params=(cliente_id,), fetch_all=True)
        wm = WorkspaceManager()
        for lev in levs_vinculados:
            ExportacaoService.gerar_documento_cliente_workspace(lev['id'])

        mgr.verificar_dados_conjuge(cliente_id)

        return {"message": "Cliente atualizado e sincronizado com sucesso"}
    except Exception as e:
        logger.error(f"Erro na atualização do cliente {cliente_id}: {e}")
        return {"error": str(e)}

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
        logger.error(f"Erro na vinculação cliente-propriedade: {e}")
        return {"error": str(e)}
