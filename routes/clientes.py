"""
routes/clientes.py — CRUD de Clientes, Profissionais e Pendências
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from database.connection import DatabaseManager, execute_query
from business.levantamento_manager import cadastrar_cliente, atualizar_cliente, vincular_cliente_propriedade
from database.repository import PendenciaRepo

router = APIRouter(tags=["Clientes & Profissionais"])

# ── Modelos ────────────────────────────────────────────────────────────────────

class PendenciaCreate(BaseModel):
    titulo: str
    descricao: str = ""
    prioridade: str = "MEDIA"

class PendenciaUpdate(BaseModel):
    status: str

class ClienteCreate(BaseModel):
    nome_completo: str
    cpf_cnpj: str
    rg_ie: str = None
    data_nascimento_fundacao: str = None
    estado_civil: str = None
    profissao: str = None
    nacionalidade: str = None
    nome_conjuge: str = None
    cpf_conjuge: str = None
    rg_conjuge: str = None
    regime_bens: str = None
    email: str = None
    telefone: str = None
    endereco_completo: str = None
    cidade: str = None
    estado: str = None
    cep: str = None
    sexo: str = "M"
    metadados: dict = {}

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

# ── Clientes ──────────────────────────────────────────────────────────────────

@router.post("/clientes")
def create_cliente(cli: ClienteCreate):
    res = cadastrar_cliente(cli.dict())
    if "error" in res:
        return {"error": res["error"]}
    return res

@router.get("/clientes")
def get_clientes():
    try:
        clientes = [dict(r) for r in execute_query("SELECT * FROM clientes", fetch_all=True)]
        for c in clientes:
            metas = execute_query("SELECT chave, valor FROM cliente_metadados WHERE id_cliente = ?", params=(c['id'],), fetch_all=True)
            c['metadados'] = {m['chave']: m['valor'] for m in metas}
            levs = execute_query("SELECT count(l.id) as qtd FROM propriedade_clientes pc JOIN propriedades p ON pc.propriedade_id = p.id JOIN levantamentos l ON p.id = l.propriedade_id WHERE pc.cliente_id = ?", params=(c['id'],), fetch_one=True)
            c['total_levantamentos'] = levs['qtd'] if levs else 0
            props_count = execute_query("SELECT COUNT(*) as qtd FROM propriedade_clientes WHERE cliente_id = ?", params=(c['id'],), fetch_one=True)
            c['total_propriedades'] = props_count['qtd'] if props_count else 0
            props_detail_query = """
                SELECT p.id, p.nome_propriedade, pc.percentual_participacao
                FROM propriedade_clientes pc
                JOIN propriedades p ON pc.propriedade_id = p.id
                WHERE pc.cliente_id = ?
            """
            c['propriedades'] = [dict(r) for r in execute_query(props_detail_query, params=(c['id'],), fetch_all=True)]
        return clientes
    except Exception as e:
        return {"error": str(e)}

@router.delete("/clientes/{cliente_id}")
def delete_cliente(cliente_id: int):
    try:
        levs = execute_query("SELECT count(l.id) as qtd FROM propriedade_clientes pc JOIN propriedades p ON pc.propriedade_id = p.id JOIN levantamentos l ON p.id = l.propriedade_id WHERE pc.cliente_id = ?", params=(cliente_id,), fetch_one=True)
        if levs and levs['qtd'] > 0:
            return {"error": "Não é possível excluir cliente com levantamentos vinculados."}
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cliente_id,))
            cursor.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))
            conn.commit()
        return {"message": "Cliente excluído com sucesso"}
    except Exception as e:
        return {"error": str(e)}

@router.put("/clientes/{cliente_id}")
def update_cliente(cliente_id: int, cli: ClienteCreate):
    res = atualizar_cliente(cliente_id, cli.dict())
    if "error" in res:
        return {"error": res["error"]}
    return res

@router.get("/clientes/{cliente_id}/historico")
def get_cliente_historico(cliente_id: int):
    try:
        query = "SELECT campo_alterado, valor_antigo, valor_novo, data_alteracao FROM cliente_historico_logs WHERE id_cliente = ? ORDER BY data_alteracao DESC"
        logs = [dict(r) for r in execute_query(query, params=(cliente_id,), fetch_all=True)]
        return logs
    except Exception as e:
        return {"error": str(e)}

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
            return {"error": "Não é possível excluir um profissional que possui levantamentos técnicos vinculados."}
        execute_query("DELETE FROM profissionais WHERE id = ?", params=(prof_id,), commit=True)
        return {"sucesso": True, "message": "Profissional removido com sucesso!"}
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
