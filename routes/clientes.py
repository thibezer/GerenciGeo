"""
routes/clientes.py — CRUD de Clientes, Profissionais, Documentos e Auditoria
"""
import logging
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List
from pydantic import BaseModel, Field
from collections import defaultdict
from database.connection import DatabaseManager, execute_query
from services.gestores.cliente_manager import (
    cadastrar_cliente,
    atualizar_cliente,
    excluir_cliente,
    excluir_clientes_lote,
    vincular_cliente_propriedade,
    revelar_senha_gov,
    obter_acessos_cliente,
    obter_documentos_cliente,
    salvar_documento_cliente,
    excluir_documento_cliente
)
from database.repository import PendenciaRepo

router = APIRouter(tags=["Clientes & Profissionais"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class PendenciaCreate(BaseModel):
    titulo: str
    descricao: str = ""
    prioridade: str = "MEDIA"

class PendenciaUpdate(BaseModel):
    status: str

class ClientesLoteDelete(BaseModel):
    cliente_ids: List[int] = Field(default_factory=list)

class DocumentoCreate(BaseModel):
    tipo_documento: str = "RG"
    numero: str
    orgao_emissor: Optional[str] = None
    uf_emissor: Optional[str] = None
    categoria_cnh: Optional[str] = None
    data_emissao: Optional[str] = None
    data_validade: Optional[str] = None
    observacoes: Optional[str] = None

class ClienteCreate(BaseModel):
    nome_completo: str
    cpf_cnpj: str
    rg_ie: Optional[str] = None
    data_nascimento_fundacao: Optional[str] = None
    estado_civil: Optional[str] = None
    profissao: Optional[str] = None
    nacionalidade: Optional[str] = None
    nome_conjuge: Optional[str] = None
    cpf_conjuge: Optional[str] = None
    rg_conjuge: Optional[str] = None
    regime_bens: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    endereco_completo: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None
    sexo: str = "M"
    senha_gov: Optional[str] = None
    metadados: dict = Field(default_factory=dict)
    
    # Campos PF / PJ e Qualificação Civil Expandida
    tipo_pessoa: Optional[str] = "PF"
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    inscricao_estadual: Optional[str] = None
    inscricao_municipal: Optional[str] = None
    representante_legal_id: Optional[int] = None
    cnh_numero: Optional[str] = None
    cnh_categoria: Optional[str] = None
    cnh_validade: Optional[str] = None
    cnh_orgao_uf: Optional[str] = None
    rg_orgao: Optional[str] = None
    rg_uf: Optional[str] = None
    naturalidade: Optional[str] = None
    certidao_casamento_matricula: Optional[str] = None
    documentos: Optional[List[dict]] = None

class ProfissionalCreate(BaseModel):
    nome: str
    registro: str
    codigo_credenciado: str = ""
    endereco: Optional[str] = ""
    nacionalidade: Optional[str] = "brasileiro(a)"
    formacao: Optional[str] = ""
    cpf: Optional[str] = ""
    rg: Optional[str] = ""
    conselho: Optional[str] = ""
    endereco_residencial: Optional[str] = ""

# ── Pendências ─────────────────────────────────────────────────────────────────

@router.get("/pendencias")
def get_pendencias():
    repo = PendenciaRepo()
    pendencias = repo.get_all()
    pendencias.sort(key=lambda x: x['data_criacao'], reverse=True)
    return pendencias

@router.post("/pendencias")
def create_pendencia(p: PendenciaCreate):
    repo = PendenciaRepo()
    repo.insert(p.titulo, p.descricao, "PENDENTE", p.prioridade)
    return {"message": "Pendência criada com sucesso"}

@router.put("/pendencias/{item_id}")
def update_pendencia(item_id: int, payload: PendenciaUpdate):
    repo = PendenciaRepo()
    repo.update_status(item_id, payload.status)
    return {"message": "Status atualizado"}

@router.delete("/pendencias/{item_id}")
def delete_pendencia(item_id: int):
    repo = PendenciaRepo()
    repo.delete(item_id)
    return {"message": "Pendência excluída com sucesso"}

@router.post("/pendencias/{item_id}/concluir")
def concluir_pendencia(item_id: int):
    repo = PendenciaRepo()
    repo.update_status(item_id, "CONCLUIDO")
    return {"message": "Pendência concluída com sucesso"}

# ── Clientes ──────────────────────────────────────────────────────────────────

@router.post("/clientes")
@router.post("/api/clientes")
def create_cliente(cli: ClienteCreate):
    res = cadastrar_cliente(cli.model_dump() if hasattr(cli, 'model_dump') else cli.dict())
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@router.get("/clientes")
@router.get("/api/clientes")
def get_clientes():
    try:
        query = """
            SELECT c.id, p.id as pessoa_id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie,
                   p.nacionalidade, p.profissao, p.estado_civil, p.regime_bens,
                   p.endereco_completo, p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge,
                   p.tipo_pessoa, p.razao_social, p.nome_fantasia, p.inscricao_estadual,
                   p.inscricao_municipal, p.representante_legal_id, rep.nome as representante_legal_nome,
                   p.cnh_numero, p.cnh_categoria, p.cnh_validade, p.cnh_orgao_uf,
                   p.rg_orgao, p.rg_uf, p.naturalidade, p.certidao_casamento_matricula,
                   c.data_nascimento_fundacao, c.email, c.telefone, c.cidade, c.estado, c.cep, c.sexo, c.senha_gov, c.created_at
            FROM clientes c
            JOIN pessoas p ON c.pessoa_id = p.id
            LEFT JOIN pessoas rep ON p.representante_legal_id = rep.id
            ORDER BY c.id DESC
        """
        clientes = [dict(r) for r in execute_query(query, fetch_all=True)]
        if not clientes:
            return clientes

        client_ids = [c['id'] for c in clientes]
        pessoa_ids = list({c['pessoa_id'] for c in clientes if c.get('pessoa_id')})
        placeholders = ",".join(["?"] * len(client_ids))

        # 1. Metadados
        metas_query = f"SELECT id_cliente, chave, valor FROM cliente_metadados WHERE id_cliente IN ({placeholders})"
        metas_rows = execute_query(metas_query, params=tuple(client_ids), fetch_all=True)
        metadados_map = defaultdict(dict)
        for row in metas_rows:
            metadados_map[row['id_cliente']][row['chave']] = row['valor']

        # 2. Total de levantamentos
        levs_query = f"""
            SELECT pc.cliente_id, count(l.id) as qtd
            FROM propriedade_clientes pc
            JOIN propriedades p ON pc.propriedade_id = p.id
            JOIN levantamentos l ON p.id = l.propriedade_id
            WHERE pc.cliente_id IN ({placeholders})
            GROUP BY pc.cliente_id
        """
        levs_rows = execute_query(levs_query, params=tuple(client_ids), fetch_all=True)
        levs_map = {row['cliente_id']: row['qtd'] for row in levs_rows}

        # 3. Total de propriedades
        props_count_query = f"""
            SELECT cliente_id, COUNT(*) as qtd
            FROM propriedade_clientes
            WHERE cliente_id IN ({placeholders})
            GROUP BY cliente_id
        """
        props_count_rows = execute_query(props_count_query, params=tuple(client_ids), fetch_all=True)
        props_count_map = {row['cliente_id']: row['qtd'] for row in props_count_rows}

        # 4. Detalhes das propriedades
        props_detail_query = f"""
            SELECT pc.cliente_id, p.id, p.nome_propriedade, pc.percentual_participacao
            FROM propriedade_clientes pc
            JOIN propriedades p ON pc.propriedade_id = p.id
            WHERE pc.cliente_id IN ({placeholders})
        """
        props_detail_rows = execute_query(props_detail_query, params=tuple(client_ids), fetch_all=True)
        props_detail_map = defaultdict(list)
        for row in props_detail_rows:
            props_detail_map[row['cliente_id']].append({
                'id': row['id'],
                'nome_propriedade': row['nome_propriedade'],
                'percentual_participacao': row['percentual_participacao']
            })

        # 5. Documentos estruturados por pessoa_id
        docs_map = defaultdict(list)
        if pessoa_ids:
            p_placeholders = ",".join(["?"] * len(pessoa_ids))
            docs_query = f"""
                SELECT id, pessoa_id, tipo_documento, numero, orgao_emissor, uf_emissor,
                       categoria_cnh, data_emissao, data_validade, observacoes
                FROM cliente_documentos
                WHERE pessoa_id IN ({p_placeholders})
                ORDER BY created_at ASC
            """
            docs_rows = execute_query(docs_query, params=tuple(pessoa_ids), fetch_all=True)
            for d in docs_rows:
                docs_map[d['pessoa_id']].append(dict(d))

        # Atribuir os valores mapeados e sanitizar a Senha GOV
        for c in clientes:
            c_id = c['id']
            p_id = c['pessoa_id']
            c['metadados'] = dict(metadados_map.get(c_id, {}))
            c['total_levantamentos'] = levs_map.get(c_id, 0)
            c['total_propriedades'] = props_count_map.get(c_id, 0)
            c['propriedades'] = list(props_detail_map.get(c_id, []))
            c['documentos'] = list(docs_map.get(p_id, []))
            
            # SEGURANÇA: Mascaramento estrito de senha na listagem pública
            tem_senha = bool(c.get('senha_gov'))
            c['tem_senha_gov'] = tem_senha
            c['senha_gov'] = '••••••••' if tem_senha else None

        return clientes
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao listar clientes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao buscar lista de clientes.")

@router.get("/clientes/{cliente_id}")
@router.get("/api/clientes/{cliente_id}")
def get_cliente_por_id(cliente_id: int):
    try:
        query = """
            SELECT c.id, p.id as pessoa_id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie,
                   p.nacionalidade, p.profissao, p.estado_civil, p.regime_bens,
                   p.endereco_completo, p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge,
                   p.tipo_pessoa, p.razao_social, p.nome_fantasia, p.inscricao_estadual,
                   p.inscricao_municipal, p.representante_legal_id, rep.nome as representante_legal_nome,
                   p.cnh_numero, p.cnh_categoria, p.cnh_validade, p.cnh_orgao_uf,
                   p.rg_orgao, p.rg_uf, p.naturalidade, p.certidao_casamento_matricula,
                   c.data_nascimento_fundacao, c.email, c.telefone, c.cidade, c.estado, c.cep, c.sexo, c.senha_gov, c.created_at
            FROM clientes c
            JOIN pessoas p ON c.pessoa_id = p.id
            LEFT JOIN pessoas rep ON p.representante_legal_id = rep.id
            WHERE c.id = ?
        """
        row = execute_query(query, params=(cliente_id,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Cliente não encontrado.")
        
        c = dict(row)
        p_id = c['pessoa_id']
        
        # Metadados
        metas = execute_query("SELECT chave, valor FROM cliente_metadados WHERE id_cliente = ?", params=(cliente_id,), fetch_all=True)
        c['metadados'] = {m['chave']: m['valor'] for m in metas} if metas else {}
        
        # Documentos
        docs = execute_query("""
            SELECT id, pessoa_id, tipo_documento, numero, orgao_emissor, uf_emissor,
                   categoria_cnh, data_emissao, data_validade, observacoes
            FROM cliente_documentos
            WHERE pessoa_id = ?
            ORDER BY created_at ASC
        """, params=(p_id,), fetch_all=True)
        c['documentos'] = [dict(d) for d in docs] if docs else []
        
        tem_senha = bool(c.get('senha_gov'))
        c['tem_senha_gov'] = tem_senha
        c['senha_gov'] = '••••••••' if tem_senha else None
        
        return c
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar cliente {cliente_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao buscar cliente.")

@router.delete("/clientes/{cliente_id}")
@router.delete("/api/clientes/{cliente_id}")
def delete_cliente(cliente_id: int):
    res = excluir_cliente(cliente_id)
    if "error" in res:
        status_code = res.get("status_code", 400)
        raise HTTPException(status_code=status_code, detail=res["error"])
    return res

@router.post("/clientes/excluir-lote")
@router.post("/api/clientes/excluir-lote")
def delete_clientes_lote(payload: ClientesLoteDelete):
    res = excluir_clientes_lote(payload.cliente_ids)
    return res

@router.put("/clientes/{cliente_id}")
@router.put("/api/clientes/{cliente_id}")
def update_cliente(cliente_id: int, cli: ClienteCreate):
    res = atualizar_cliente(cliente_id, cli.model_dump() if hasattr(cli, 'model_dump') else cli.dict())
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@router.get("/clientes/{cliente_id}/historico")
def get_cliente_historico(cliente_id: int):
    try:
        query = "SELECT campo_alterado, valor_antigo, valor_novo, data_alteracao FROM cliente_historico_logs WHERE id_cliente = ? ORDER BY data_alteracao DESC"
        logs = [dict(r) for r in execute_query(query, params=(cliente_id,), fetch_all=True)]
        return logs
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar histórico do cliente id={cliente_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao buscar histórico do cliente.")

@router.post("/clientes/{cliente_id}/revelar-senha")
def post_revelar_senha_cliente(cliente_id: int, request: Request):
    """
    Endpoint auditado que descriptografa a senha GOV sob demanda explícita.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    res = revelar_senha_gov(cliente_id, usuario="Operador do Sistema", ip_origem=client_ip)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@router.get("/clientes/{cliente_id}/acessos")
def get_cliente_acessos(cliente_id: int):
    """
    Retorna a trilha de auditoria de acessos aos dados sensíveis do cliente.
    """
    return obter_acessos_cliente(cliente_id)

@router.get("/clientes/{cliente_id}/documentos")
def get_cliente_documentos(cliente_id: int):
    """
    Retorna os documentos de identificação do cliente.
    """
    return obter_documentos_cliente(cliente_id)

@router.post("/clientes/{cliente_id}/documentos")
def post_cliente_documento(cliente_id: int, doc: DocumentoCreate):
    """
    Adiciona um novo documento de identificação ao cliente.
    """
    res = salvar_documento_cliente(cliente_id, doc.model_dump() if hasattr(doc, 'model_dump') else doc.dict())
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@router.delete("/clientes/documentos/{doc_id}")
def delete_cliente_documento(doc_id: int):
    """
    Exclui um documento pelo ID.
    """
    res = excluir_documento_cliente(doc_id)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

# ── Profissionais ─────────────────────────────────────────────────────────────

@router.get("/profissionais")
def get_profissionais():
    try:
        rows = execute_query("SELECT id, nome, registro, codigo_credenciado, endereco, nacionalidade, formacao, cpf, rg, conselho, endereco_residencial, contador_m, contador_p, contador_v FROM profissionais ORDER BY nome ASC", fetch_all=True)
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/profissionais")
def create_profissional(p: ProfissionalCreate):
    try:
        query = "INSERT INTO profissionais (nome, registro, codigo_credenciado, endereco, nacionalidade, formacao, cpf, rg, conselho, endereco_residencial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        execute_query(query, params=(p.nome, p.registro, p.codigo_credenciado, p.endereco, p.nacionalidade, p.formacao, p.cpf, p.rg, p.conselho, p.endereco_residencial), commit=True)
        return {"sucesso": True, "message": "Profissional cadastrado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/profissionais/{prof_id}")
def update_profissional(prof_id: int, p: ProfissionalCreate):
    try:
        query = "UPDATE profissionais SET nome = ?, registro = ?, codigo_credenciado = ?, endereco = ?, nacionalidade = ?, formacao = ?, cpf = ?, rg = ?, conselho = ?, endereco_residencial = ? WHERE id = ?"
        execute_query(query, params=(p.nome, p.registro, p.codigo_credenciado, p.endereco, p.nacionalidade, p.formacao, p.cpf, p.rg, p.conselho, p.endereco_residencial, prof_id), commit=True)
        return {"sucesso": True, "message": "Cadastro do profissional atualizado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/profissionais/{prof_id}")
def delete_profissional(prof_id: int):
    try:
        check = execute_query("SELECT COUNT(*) as count FROM levantamentos WHERE profissional_id = ?", params=(prof_id,), fetch_one=True)
        if check and check["count"] > 0:
            raise HTTPException(
                status_code=409,
                detail="Não é possível excluir um profissional que possui levantamentos técnicos vinculados."
            )
        execute_query("DELETE FROM profissionais WHERE id = ?", params=(prof_id,), commit=True)
        return {"sucesso": True, "message": "Profissional removido com sucesso!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/profissionais/{prof_id}/banco-pontos")
def get_banco_pontos_profissional(prof_id: int):
    try:
        prof = execute_query("SELECT id, nome, codigo_credenciado FROM profissionais WHERE id = ?", params=(prof_id,), fetch_one=True)
        if not prof:
            raise HTTPException(status_code=404, detail="Profissional não encontrado.")
        rows = execute_query("""
            SELECT bp.id, bp.tipo_ponto, bp.numero, bp.codigo_completo, bp.created_at, bp.levantamento_id, bp.matricula_id,
                   bp.norte, bp.este, bp.altitude, bp.lat, bp.lon, bp.metodo_posicionamento, bp.tipo_limite, bp.confrontante_descritivo,
                   p.nome_propriedade
            FROM banco_pontos bp
            LEFT JOIN levantamentos l ON bp.levantamento_id = l.id
            LEFT JOIN propriedades p ON l.propriedade_id = p.id
            WHERE bp.profissional_id = ?
            ORDER BY bp.tipo_ponto ASC, bp.numero ASC
        """, params=(prof_id,), fetch_all=True)
        pontos_usados = [dict(r) for r in rows]
        estatisticas = {}
        for t in ['M', 'P', 'V']:
            nums_tipo = [p['numero'] for p in pontos_usados if p['tipo_ponto'] == t]
            if nums_tipo:
                max_num = max(nums_tipo)
                proximo = max_num + 1
                set_usados = set(nums_tipo)
                lacunas = [n for n in range(1, max_num) if n not in set_usados]
            else:
                max_num = 0
                proximo = 1
                lacunas = []
            estatisticas[t] = {
                "ultimo_usado": max_num,
                "proximo_recomendado": proximo,
                "total_usados": len(nums_tipo),
                "lacunas": lacunas[:100]
            }
        return {"profissional": dict(prof), "estatisticas": estatisticas, "pontos": pontos_usados}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))
