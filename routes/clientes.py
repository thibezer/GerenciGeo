"""
routes/clientes.py — CRUD de Clientes, Profissionais e Pendências
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel, Field
from collections import defaultdict
from database.connection import DatabaseManager, execute_query
from services.gestores.levantamento_manager import cadastrar_cliente, atualizar_cliente, vincular_cliente_propriedade
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
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@router.get("/clientes")
def get_clientes():
    try:
        query = """
            SELECT c.id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie,
                   p.nacionalidade, p.profissao, p.estado_civil, p.regime_bens,
                   p.endereco_completo, p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge,
                   c.data_nascimento_fundacao, c.email, c.telefone, c.cidade, c.estado, c.cep, c.sexo, c.senha_gov, c.created_at
            FROM clientes c
            JOIN pessoas p ON c.pessoa_id = p.id
        """
        clientes = [dict(r) for r in execute_query(query, fetch_all=True)]
        if not clientes:
            return clientes

        client_ids = [c['id'] for c in clientes]
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

        # Atribuir os valores mapeados aos clientes
        for c in clientes:
            c_id = c['id']
            c['metadados'] = dict(metadados_map.get(c_id, {}))
            c['total_levantamentos'] = levs_map.get(c_id, 0)
            c['total_propriedades'] = props_count_map.get(c_id, 0)
            c['propriedades'] = list(props_detail_map.get(c_id, []))

        return clientes
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao listar clientes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao buscar lista de clientes.")

@router.delete("/clientes/{cliente_id}")
def delete_cliente(cliente_id: int):
    try:
        levs = execute_query("SELECT count(l.id) as qtd FROM propriedade_clientes pc JOIN propriedades p ON pc.propriedade_id = p.id JOIN levantamentos l ON p.id = l.propriedade_id WHERE pc.cliente_id = ?", params=(cliente_id,), fetch_one=True)
        if levs and levs['qtd'] > 0:
            raise HTTPException(
                status_code=409,
                detail="Não é possível excluir cliente com levantamentos vinculados."
            )
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cliente_id,))
            cursor.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))

            # Limpa pessoas órfãs (não associadas a clientes nem confrontantes)
            cursor.execute("""
                DELETE FROM pessoas
                WHERE id NOT IN (SELECT pessoa_id FROM clientes WHERE pessoa_id IS NOT NULL)
                  AND id NOT IN (SELECT pessoa_id FROM confrontantes WHERE pessoa_id IS NOT NULL);
            """)
            conn.commit()
        return {"message": "Cliente excluído com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao excluir cliente id={cliente_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao excluir cliente.")

@router.put("/clientes/{cliente_id}")
def update_cliente(cliente_id: int, cli: ClienteCreate):
    res = atualizar_cliente(cliente_id, cli.dict())
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
