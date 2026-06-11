import os
import logging
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Request, Form, HTTPException, Query
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uvicorn

from business.ppp_processor import LotePPPManager
from business.triagem_inteligente import ler_metadados_rinex, organizar_rastreios, gerar_alertas_integridade
from database.repository import HistoricoRinexRepo, PendenciaRepo
from pydantic import BaseModel
from config import EXPORT_BASE_FOLDER
from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from business.workspace_manager import WorkspaceManager
from business.txt_parser import TxtGeodesicParser
from business.levantamento_manager import (
    cadastrar_cliente,
    atualizar_cliente,
    vincular_cliente_propriedade,
    salvar_ordem_caminhamento,
    recomputar_rover_apos_vinculo_base,
    atualizar_ponto_geodesico,
    gerar_requerimento_html,
    gerar_termo_anuencia_html
)

from fastapi import Depends
from business.sigef_validator import SigefValidator

def registrar_tentativa_violacao(levantamento_id: int, rota: str, metodo: str):
    try:
        execute_query(
            "INSERT INTO logs_auditoria_seguranca (levantamento_id, rota, metodo) VALUES (?, ?, ?)",
            params=(levantamento_id, rota, metodo),
            commit=True
        )
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao registrar log de violação: {e}")

async def verificar_tranca_read_only(request: Request):
    """
    Middleware/Dependency do FastAPI. 
    Analisa requisições de escrita e bloqueia se o levantamento estiver ARQUIVADO.
    """
    if request.method not in ["POST", "PUT", "DELETE"]:
        return

    if "/desarquivar" in request.url.path:
        return

    levantamento_id = None
    
    # 1. Tenta extrair levantamento_id ou lev_id do Path Params
    path_params = request.path_params
    if "id" in path_params and "levantamentos" in request.url.path:
        levantamento_id = path_params["id"]
    elif "lev_id" in path_params:
        levantamento_id = path_params["lev_id"]
    
    # 2. Se for rotas de pontos, segmentos, matriculas ou confrontantes sem levantamento_id direto no path:
    if not levantamento_id:
        path_str = request.url.path
        partes = path_str.split("/")
        
        # /pontos/{pid}
        if "/pontos/" in path_str and len(partes) >= 3:
            entidade_id = partes[-1]
            if entidade_id.isdigit():
                row = execute_query("SELECT levantamento_id FROM pontos WHERE id = ?", params=(int(entidade_id),), fetch_one=True)
                if row: levantamento_id = row["levantamento_id"]
                
        # /segmentos/{sid}
        elif "/segmentos/" in path_str and len(partes) >= 3:
            entidade_id = partes[-1]
            if entidade_id.isdigit():
                row = execute_query("SELECT levantamento_id FROM segmentos WHERE id = ?", params=(int(entidade_id),), fetch_one=True)
                if row: levantamento_id = row["levantamento_id"]

        # /confrontantes/{cid}
        elif "/confrontantes/" in path_str and len(partes) >= 3:
            entidade_id = partes[-1]
            if entidade_id.isdigit():
                row = execute_query("SELECT levantamento_id FROM confrontantes WHERE id = ?", params=(int(entidade_id),), fetch_one=True)
                if row: levantamento_id = row["levantamento_id"]

        # /matriculas/{mid}
        elif "/matriculas/" in path_str and len(partes) >= 3:
            entidade_id = partes[-1]
            if entidade_id.isdigit():
                row = execute_query("SELECT propriedade_id FROM matriculas WHERE id = ?", params=(int(entidade_id),), fetch_one=True)
                if row:
                    prop_id = row["propriedade_id"]
                    row_lev = execute_query("SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'", params=(prop_id,), fetch_one=True)
                    if row_lev:
                        levantamento_id = row_lev["id"]

    if levantamento_id and str(levantamento_id).isdigit():
        try:
            row = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(int(levantamento_id),), fetch_one=True)
            if row and dict(row).get("status") == "ARQUIVADO":
                registrar_tentativa_violacao(int(levantamento_id), request.url.path, request.method)
                raise HTTPException(
                    status_code=403,
                    detail="Operação Bloqueada: O Levantamento correspondente está ARQUIVADO (Tranca de Segurança Read-Only ativa)."
                )
        except HTTPException:
            raise
        except Exception:
            pass

app = FastAPI(title="GerenciGeo API", dependencies=[Depends(verificar_tranca_read_only)])

def verificar_levantamento_arquivado(levantamento_id: int):
    """Tranca de Segurança Read-Only (Módulo 7): Impede escrita/exclusão em projetos ARQUIVADOS"""
    row = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(levantamento_id,), fetch_one=True)
    if row and dict(row).get("status") == "ARQUIVADO":
        raise HTTPException(
            status_code=403, 
            detail="Operação Bloqueada: O Levantamento correspondente está ARQUIVADO (Tranca de Segurança Read-Only ativa)."
        )


# Ensure database tables exist
try:
    with DatabaseManager() as conn:
        create_tables(conn)
except Exception as e:
    logging.getLogger(__name__).critical(f"Erro crítico na inicialização do banco: {e}")


# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.getLogger(__name__).error(f"Erro inesperado no servidor: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": f"Erro interno do servidor: {str(exc)}"}
    )

# In-memory storage for logs (for the terminal)
system_logs = []

def add_log(msg: str):
    system_logs.append(msg)
    if len(system_logs) > 100:
        system_logs.pop(0)

@app.get("/status")
def get_status():
    return {"status": "online", "version": "2.0.0"}

@app.get("/logs")
def get_logs():
    return {"logs": system_logs}

@app.get("/history")
def get_history():
    repo = HistoricoRinexRepo()
    return repo.get_all_ordered()

@app.get("/stats")
def get_stats():
    from database.connection import execute_query
    try:
        cli = execute_query("SELECT COUNT(*) as count FROM clientes", fetch_one=True)
        prop = execute_query("SELECT COUNT(*) as count FROM propriedades", fetch_one=True)
        prof = execute_query("SELECT COUNT(*) as count FROM profissionais", fetch_one=True)
        return {
            "clientes": cli['count'] if cli else 0,
            "propriedades": prop['count'] if prop else 0,
            "profissionais": prof['count'] if prof else 0
        }
    except:
        return {"clientes": 0, "propriedades": 0, "profissionais": 0}

@app.delete("/history/{item_id}")
def delete_history_item(item_id: int):
    repo = HistoricoRinexRepo()
    repo.delete(item_id)
    return {"message": "Registro removido"}

@app.get("/dashboard/alerts")
def get_alerts():
    repo = PendenciaRepo()
    pendencias_alta = repo.get_pendentes_alta(limit=3)
    
    manuais = []
    for p in pendencias_alta:
        manuais.append({
            "id": p['id'],
            "tipo": "MANUAL",
            "icone": "alert-circle",
            "mensagem": f"Urgent: {p['titulo']}",
            "original": p
        })
        
    automaticos = gerar_alertas_integridade()
    
    return {"alerts": manuais + automaticos}

class PendenciaCreate(BaseModel):
    titulo: str
    descricao: str = ""
    prioridade: str = "MEDIA"

class PendenciaUpdate(BaseModel):
    status: str

@app.get("/pendencias")
def get_pendencias():
    repo = PendenciaRepo()
    pendencias = repo.get_all()
    pendencias.sort(key=lambda x: x['data_criacao'], reverse=True)
    return pendencias

@app.post("/pendencias")
def create_pendencia(p: PendenciaCreate):
    repo = PendenciaRepo()
    repo.insert(p.titulo, p.descricao, "PENDENTE", p.prioridade)
    return {"message": "Pendência criada com sucesso"}

@app.put("/pendencias/{item_id}")
def update_pendencia(item_id: int, payload: PendenciaUpdate):
    repo = PendenciaRepo()
    repo.update_status(item_id, payload.status)
    return {"message": "Status atualizado"}

# --- CLIENTES ---
from business.cliente_manager import ClienteManager, validar_cpf_cnpj

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

@app.post("/clientes")
def create_cliente(cli: ClienteCreate):
    res = cadastrar_cliente(cli.dict())
    if "error" in res:
        return {"error": res["error"]}
    return res

@app.get("/clientes")
def get_clientes():
    try:
        clientes = [dict(r) for r in execute_query("SELECT * FROM clientes", fetch_all=True)]
        for c in clientes:
            metas = execute_query("SELECT chave, valor FROM cliente_metadados WHERE id_cliente = ?", params=(c['id'],), fetch_all=True)
            c['metadados'] = {m['chave']: m['valor'] for m in metas}
            # Verifica levantamentos vinculados a propriedades desse cliente
            levs = execute_query("SELECT count(l.id) as qtd FROM propriedade_clientes pc JOIN propriedades p ON pc.propriedade_id = p.id JOIN levantamentos l ON p.id = l.propriedade_id WHERE pc.cliente_id = ?", params=(c['id'],), fetch_one=True)
            c['total_levantamentos'] = levs['qtd'] if levs else 0
            
            # Total de propriedades vinculadas
            props_count = execute_query("SELECT COUNT(*) as qtd FROM propriedade_clientes WHERE cliente_id = ?", params=(c['id'],), fetch_one=True)
            c['total_propriedades'] = props_count['qtd'] if props_count else 0
            
            # Lista de propriedades vinculadas (detalhada)
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
        
@app.delete("/clientes/{cliente_id}")
def delete_cliente(cliente_id: int):
    try:
        # Verifica se há levantamentos vinculados (não deve deletar se houver)
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

@app.put("/clientes/{cliente_id}")
def update_cliente(cliente_id: int, cli: ClienteCreate):
    res = atualizar_cliente(cliente_id, cli.dict())
    if "error" in res:
        return {"error": res["error"]}
    return res

# --- PROPRIEDADES ---

class PropriedadeCreate(BaseModel):
    nome_propriedade: str
    codigo_car: str = None
    codigo_ccir: str = None
    caminho_arquivo_car: str = None
    caminho_arquivo_ccir: str = None
    municipio: str
    uf: str

class PropriedadeClienteCreate(BaseModel):
    cliente_id: int
    percentual_participacao: float = 0.0

class MatriculaCreate(BaseModel):
    numero_matricula: str
    ccir: str = None
    itr: str = None
    area_ha: float = 0.0
    valor_itr: Optional[float] = None
    denominacao: Optional[str] = None
    georreferenciamento: Optional[str] = None

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

@app.get("/profissionais")
def get_profissionais():
    try:
        rows = execute_query("SELECT id, nome, registro, codigo_credenciado, endereco, nacionalidade, formacao, cpf, rg, conselho, endereco_residencial, contador_m, contador_p, contador_v FROM profissionais ORDER BY nome ASC", fetch_all=True)
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/profissionais")
def create_profissional(p: ProfissionalCreate):
    try:
        query = """
            INSERT INTO profissionais (nome, registro, codigo_credenciado, endereco, nacionalidade, formacao, cpf, rg, conselho, endereco_residencial) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        execute_query(query, params=(
            p.nome, p.registro, p.codigo_credenciado, p.endereco, 
            p.nacionalidade, p.formacao, p.cpf, p.rg, p.conselho, p.endereco_residencial
        ), commit=True)
        return {"sucesso": True, "message": "Profissional cadastrado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/profissionais/{prof_id}")
def update_profissional(prof_id: int, p: ProfissionalCreate):
    try:
        query = """
            UPDATE profissionais 
            SET nome = ?, registro = ?, codigo_credenciado = ?, endereco = ?, 
                nacionalidade = ?, formacao = ?, cpf = ?, rg = ?, conselho = ?, endereco_residencial = ? 
            WHERE id = ?
        """
        execute_query(query, params=(
            p.nome, p.registro, p.codigo_credenciado, p.endereco, 
            p.nacionalidade, p.formacao, p.cpf, p.rg, p.conselho, p.endereco_residencial, 
            prof_id
        ), commit=True)
        return {"sucesso": True, "message": "Cadastro do profissional atualizado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/profissionais/{prof_id}")
def delete_profissional(prof_id: int):
    try:
        check = execute_query("SELECT COUNT(*) as count FROM levantamentos WHERE profissional_id = ?", params=(prof_id,), fetch_one=True)
        if check and check["count"] > 0:
            return {"error": "Não é possível excluir um profissional que possui levantamentos técnicos vinculados."}
            
        execute_query("DELETE FROM profissionais WHERE id = ?", params=(prof_id,), commit=True)
        return {"sucesso": True, "message": "Profissional removido com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/propriedades")
def get_propriedades():
    try:
        propriedades = [dict(r) for r in execute_query("SELECT * FROM propriedades", fetch_all=True)]
        for p in propriedades:
            # Busca clientes vinculados
            clients_query = """
                SELECT c.id, c.nome_completo, c.cpf_cnpj, pc.percentual_participacao
                FROM propriedade_clientes pc
                JOIN clientes c ON pc.cliente_id = c.id
                WHERE pc.propriedade_id = ?
            """
            p['clientes'] = [dict(r) for r in execute_query(clients_query, params=(p['id'],), fetch_all=True)]
        return propriedades
    except Exception as e:
        return {"error": str(e)}

@app.post("/propriedades")
def create_propriedade(p: PropriedadeCreate):
    if len(p.uf) != 2:
        return {"error": "UF deve conter exatamente 2 caracteres"}
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, codigo_car, codigo_ccir, caminho_arquivo_car, caminho_arquivo_ccir, municipio, uf)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.caminho_arquivo_car, p.caminho_arquivo_ccir, p.municipio, p.uf.upper()))
            prop_id = cursor.lastrowid
            conn.commit()
        return {"id": prop_id, "message": "Propriedade cadastrada com sucesso"}
    except Exception as e:
        return {"error": str(e)}

@app.put("/propriedades/{prop_id}")
def update_propriedade(prop_id: int, p: PropriedadeCreate):
    if len(p.uf) != 2:
        return {"error": "UF deve conter exatamente 2 caracteres"}
    try:
        execute_query("""
            UPDATE propriedades
            SET nome_propriedade = ?, codigo_car = ?, codigo_ccir = ?, caminho_arquivo_car = ?, caminho_arquivo_ccir = ?, municipio = ?, uf = ?
            WHERE id = ?
        """, params=(p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.caminho_arquivo_car, p.caminho_arquivo_ccir, p.municipio, p.uf.upper(), prop_id), commit=True)
        return {"message": "Propriedade atualizada com sucesso"}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/propriedades/{prop_id}")
def delete_propriedade(prop_id: int):
    try:
        execute_query("DELETE FROM propriedades WHERE id = ?", params=(prop_id,), commit=True)
        return {"message": "Propriedade excluída com sucesso"}
    except Exception as e:
        return {"error": str(e)}

# --- UPLOAD / DOWNLOAD DE ARQUIVOS CAR E CCIR ---
from fastapi.responses import FileResponse
from pathlib import Path
import re

@app.post("/propriedades/{prop_id}/upload-car")
async def upload_propriedade_car(prop_id: int, file: UploadFile = File(...)):
    try:
        prop = execute_query("SELECT id, nome_propriedade FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
        if not prop:
            raise HTTPException(status_code=404, detail="Propriedade não localizada.")
        
        dest_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        # Limpa caracteres especiais
        safe_filename = re.sub(r'[\\/*?:"<>|]', "", file.filename)
        dest_path = dest_dir / f"CAR_{safe_filename}"
        
        with open(dest_path, "wb") as buffer:
            buffer.write(await file.read())
            
        execute_query(
            "UPDATE propriedades SET caminho_arquivo_car = ? WHERE id = ?",
            params=(str(dest_path), prop_id),
            commit=True
        )
        
        return {"message": "Arquivo do CAR enviado com sucesso", "caminho": str(dest_path)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/propriedades/{prop_id}/upload-ccir")
async def upload_propriedade_ccir(prop_id: int, file: UploadFile = File(...)):
    try:
        prop = execute_query("SELECT id, nome_propriedade FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
        if not prop:
            raise HTTPException(status_code=404, detail="Propriedade não localizada.")
        
        dest_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        safe_filename = re.sub(r'[\\/*?:"<>|]', "", file.filename)
        dest_path = dest_dir / f"CCIR_{safe_filename}"
        
        with open(dest_path, "wb") as buffer:
            buffer.write(await file.read())
            
        execute_query(
            "UPDATE propriedades SET caminho_arquivo_ccir = ? WHERE id = ?",
            params=(str(dest_path), prop_id),
            commit=True
        )
        
        return {"message": "Arquivo do CCIR enviado com sucesso", "caminho": str(dest_path)}
    except Exception as e:
        return {"error": str(e)}

@app.get("/propriedades/{prop_id}/matriculas")
def get_matriculas_da_propriedade(prop_id: int):
    try:
        rows = execute_query("SELECT * FROM matriculas WHERE propriedade_id = ? ORDER BY numero_matricula ASC", params=(prop_id,), fetch_all=True)
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/propriedades/{prop_id}/matriculas")
def create_matricula_na_propriedade(prop_id: int, m: MatriculaCreate):
    try:
        exists = execute_query("SELECT id FROM matriculas WHERE propriedade_id = ? AND numero_matricula = ?", params=(prop_id, m.numero_matricula), fetch_one=True)
        if exists:
            raise HTTPException(status_code=400, detail="Matrícula já cadastrada para esta propriedade.")
            
        query = "INSERT INTO matriculas (propriedade_id, numero_matricula, ccir, itr, area_ha, valor_itr, denominacao, georreferenciamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        execute_query(query, params=(prop_id, m.numero_matricula, m.ccir, m.itr, m.area_ha, m.valor_itr, m.denominacao, m.georreferenciamento), commit=True)
        return {"message": "Matrícula cadastrada com sucesso na propriedade."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/propriedades/{prop_id}/arquivo-car")
def download_propriedade_car(prop_id: int):
    row = execute_query("SELECT caminho_arquivo_car FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
    if not row or not row["caminho_arquivo_car"]:
        raise HTTPException(status_code=404, detail="Arquivo do CAR não cadastrado para esta propriedade.")
    path = Path(row["caminho_arquivo_car"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo do CAR físico não foi localizado no disco.")
    return FileResponse(path, filename=path.name)

@app.get("/propriedades/{prop_id}/arquivo-ccir")
def download_propriedade_ccir(prop_id: int):
    row = execute_query("SELECT caminho_arquivo_ccir FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
    if not row or not row["caminho_arquivo_ccir"]:
        raise HTTPException(status_code=404, detail="Arquivo do CCIR não cadastrado para esta propriedade.")
    path = Path(row["caminho_arquivo_ccir"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo do CCIR físico não foi localizado no disco.")
    return FileResponse(path, filename=path.name)

@app.post("/propriedades/{prop_id}/clientes")
def link_cliente_propriedade(prop_id: int, pc: PropriedadeClienteCreate):
    res = vincular_cliente_propriedade(prop_id, pc.cliente_id, pc.percentual_participacao)
    if "error" in res:
        return {"error": res["error"]}
    return res

@app.delete("/propriedades/{prop_id}/clientes/{cliente_id}")
def unlink_cliente_propriedade(prop_id: int, cliente_id: int):
    try:
        execute_query(
            "DELETE FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?",
            params=(prop_id, cliente_id),
            commit=True
        )
        return {"message": "Proprietário desvinculado com sucesso"}
    except Exception as e:
        return {"error": str(e)}

# --- LEVANTAMENTOS E WORKSPACE MANAGER ---

class LevantamentoCreate(BaseModel):
    propriedade_id: int
    profissional_id: int
    data_inicio: str

class PontoCreate(BaseModel):
    matricula_id: int
    nome_vertice: str
    tipo_ponto: str
    lat: float
    lon: float
    alt: float
    sigma_lat: float = 0.0
    sigma_lon: float = 0.0
    sigma_alt: float = 0.0
    ordem_caminhamento: int = None

class ConfrontanteCreate(BaseModel):
    nome: str
    cpf_cnpj: str = None
    tipo_relacao: str = None

class SegmentoCreate(BaseModel):
    matricula_id: int
    ponto_inicio_id: int
    ponto_fim_id: int
    confrontante_id: int = None
    tipo_limite_sigef: str
    metodo_posicionamento_sigef: str

class LevantamentoUpdate(BaseModel):
    propriedade_id: int
    profissional_id: int
    data_inicio: str
    status: str = "EM_ANDAMENTO"

@app.get("/levantamentos")
def get_levantamentos():
    try:
        query = """
            SELECT l.*, 
                   p.nome_propriedade, p.codigo_car, p.codigo_ccir, p.municipio, p.uf,
                   (SELECT COUNT(*) FROM pontos p_pts WHERE p_pts.levantamento_id = l.id) as total_pontos,
                   (SELECT COUNT(*) FROM segmentos s WHERE s.levantamento_id = l.id) as total_segmentos
            FROM levantamentos l
            JOIN propriedades p ON l.propriedade_id = p.id
        """
        levantamentos = [dict(r) for r in execute_query(query, fetch_all=True)]
        
        # Busca proprietários vinculados para cada levantamento
        for l in levantamentos:
            clients_query = """
                SELECT c.id, c.nome_completo, c.cpf_cnpj, pc.percentual_participacao
                FROM propriedade_clientes pc
                JOIN clientes c ON pc.cliente_id = c.id
                WHERE pc.propriedade_id = ?
            """
            l['clientes'] = [dict(r) for r in execute_query(clients_query, params=(l['propriedade_id'],), fetch_all=True)]
            
        return levantamentos
    except Exception as e:
        return {"error": str(e)}

@app.post("/levantamentos")
def create_levantamento(lev: LevantamentoCreate):
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, ?)",
                (lev.propriedade_id, lev.profissional_id, lev.data_inicio)
            )
            lev_id = cursor.lastrowid
            conn.commit()
            
            # Criar Workspace físico e gerar DADOS_GERAIS.json
            wm = WorkspaceManager()
            pasta = wm.create_workspace(lev_id)
            
            # Atualiza o caminho físico no banco
            execute_query("UPDATE levantamentos SET pasta_projeto = ? WHERE id = ?", params=(pasta, lev_id), commit=True)
            
            # Gera DADOS_GERAIS.json unificado
            wm.gerar_documento_cliente_workspace(lev_id)
            
            return {"id": lev_id, "pasta_projeto": pasta, "message": "Levantamento e workspace criados"}
    except Exception as e:
        return {"error": str(e)}

@app.put("/levantamentos/{lev_id}")
def update_levantamento(lev_id: int, lev: LevantamentoUpdate):
    verificar_levantamento_arquivado(lev_id)
    try:
        execute_query("""
            UPDATE levantamentos
            SET propriedade_id = ?, profissional_id = ?, data_inicio = ?, status = ?
            WHERE id = ?
        """, params=(lev.propriedade_id, lev.profissional_id, lev.data_inicio, lev.status, lev_id), commit=True)
        
        # Regenera o Workspace DADOS_GERAIS.json
        wm = WorkspaceManager()
        wm.gerar_documento_cliente_workspace(lev_id)
        
        return {"message": "Levantamento atualizado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.delete("/levantamentos/{lev_id}")
def delete_levantamento(lev_id: int, apagar_arquivos: bool = False):
    verificar_levantamento_arquivado(lev_id)
    try:
        with DatabaseManager() as conn:
            # Apagar DB (CASCADE vai limpar pontos, confrontantes e segmentos)
            conn.execute("DELETE FROM levantamentos WHERE id = ?", (lev_id,))
            conn.commit()
            
            # Apagar Físico
            if apagar_arquivos:
                wm = WorkspaceManager()
                wm.delete_workspace(lev_id)
                
            return {"message": "Levantamento removido com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.post("/levantamentos/{lev_id}/documentos")
async def upload_documento_levantamento(lev_id: int, file: UploadFile = File(...)):
    verificar_levantamento_arquivado(lev_id)
    try:
        wm = WorkspaceManager()
        pasta_docs = os.path.join(wm.get_levantamento_folder(lev_id), "Documentos")
        os.makedirs(pasta_docs, exist_ok=True)
        
        file_path = os.path.join(pasta_docs, file.filename)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
            
        return {"message": "Documento anexado", "path": file_path}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.post("/levantamentos/{lev_id}/upload-arquivo")
async def upload_arquivo_categoria(lev_id: int, background_tasks: BackgroundTasks, categoria: str = Form(...), file: UploadFile = File(...)):
    verificar_levantamento_arquivado(lev_id)
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        categorias = ["Brutos", "Rinex", "Processados", "Documentos", "Exportacoes"]
        if categoria not in categorias:
            raise HTTPException(status_code=400, detail="Categoria de pasta de arquivos inválida.")
            
        pasta_destino = folder / categoria
        pasta_destino.mkdir(parents=True, exist_ok=True)
        
        file_path = pasta_destino / file.filename
        
        # Destrava permissão de escrita se já existir para poder sobrescrever se desejado
        import stat
        if file_path.exists():
            try:
                os.chmod(file_path, stat.S_IWRITE)
            except Exception:
                pass
                
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
            
        # Blindagem física se for Brutos
        if categoria == "Brutos":
            try:
                os.chmod(file_path, os.stat(file_path).st_mode & ~stat.S_IWRITE)
            except Exception:
                pass
        
        # GATILHO AUTOMÁTICO: Se o arquivo é .GNS na pasta Brutos, dispara conversão RINEX em background
        conversao_agendada = False
        if categoria == "Brutos" and file.filename.upper().endswith(".GNS"):
            pasta_rinex = folder / "Rinex"
            pasta_rinex.mkdir(parents=True, exist_ok=True)
            background_tasks.add_task(_converter_gns_background, str(file_path), str(pasta_rinex), lev_id)
            conversao_agendada = True
                
        # Sincroniza
        wm.gerar_documento_cliente_workspace(lev_id)
        
        msg = f"Arquivo '{file.filename}' carregado com sucesso na pasta '{categoria}'."
        if conversao_agendada:
            msg += " Conversão RINEX iniciada automaticamente em segundo plano."
        
        return {"success": True, "message": msg, "conversao_rinex_agendada": conversao_agendada}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/levantamentos/{lev_id}/testar-busca-rinex")
async def testar_busca_rinex(lev_id: int):
    verificar_levantamento_arquivado(lev_id)
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        pasta_brutos = folder / "Brutos"
        pasta_rinex = folder / "Rinex"
        
        if not pasta_brutos.exists():
            return {"success": False, "message": "Pasta 'Brutos' não existe no workspace deste levantamento."}
            
        # Pega todos os arquivos brutos (.GNS ou .ZHD)
        arquivos_brutos = [f for f in os.listdir(pasta_brutos) if f.upper().endswith((".GNS", ".ZHD"))]
        if not arquivos_brutos:
            return {"success": False, "message": "Nenhum arquivo bruto (.GNS ou .ZHD) localizado na pasta 'Brutos'."}
            
        area_trabalho = r"D:\OneDrive_Thiago\OneDrive\Arquivos de Microsoft Copilot Chat\Área de Trabalho"
        diretorios_busca = [
            area_trabalho,
            str(pasta_rinex),
            str(folder)
        ]
        
        # Adiciona subpastas do HGO na Área de Trabalho
        if os.path.exists(area_trabalho):
            for item in os.listdir(area_trabalho):
                caminho_item = os.path.join(area_trabalho, item)
                if os.path.isdir(caminho_item):
                    diretorios_busca.append(caminho_item)
                    diretorios_busca.append(os.path.join(caminho_item, "Rinex"))
                    
        # Filtra pastas que existem
        diretorios_busca = list(set([os.path.normpath(d) for d in diretorios_busca if os.path.exists(d)]))
        
        import re
        import shutil
        import stat
        
        encontrados = []
        copiados = []
        erros = []
        registrados = []
        
        repo = HistoricoRinexRepo()
        
        for arq_bruto in arquivos_brutos:
            prefixo = os.path.splitext(arq_bruto)[0].lower()
            tamanho_bruto = os.path.getsize(pasta_brutos / arq_bruto)
            
            for dir_busca in diretorios_busca:
                try:
                    for f in os.listdir(dir_busca):
                        caminho_completo = os.path.join(dir_busca, f)
                        if not os.path.isfile(caminho_completo):
                            continue
                            
                        nome_f, ext_f = os.path.splitext(f)
                        nome_f_lower = nome_f.lower()
                        ext_f_lower = ext_f.lower()
                        
                        # Verifica se pertence ao arquivo bruto
                        if nome_f_lower == prefixo or nome_f_lower.startswith(prefixo):
                            eh_rinex = False
                            if ext_f_lower in ['.obs', '.nav', '.o', '.n', '.g']:
                                eh_rinex = True
                            elif re.match(r'^\.\d{2}[ong]$', ext_f_lower):
                                eh_rinex = True
                                
                            if eh_rinex:
                                encontrados.append({
                                    "bruto": arq_bruto,
                                    "rinex": f,
                                    "origem": dir_busca,
                                    "caminho": caminho_completo
                                })
                                
                                # Move para a pasta Rinex
                                dest_caminho = pasta_rinex / f
                                if os.path.normpath(caminho_completo) != os.path.normpath(dest_caminho):
                                    try:
                                        if dest_caminho.exists():
                                            os.chmod(dest_caminho, stat.S_IWRITE)
                                        shutil.copy2(caminho_completo, dest_caminho)
                                        copiados.append(f)
                                    except Exception as e_copy:
                                        erros.append(f"Erro ao copiar {f}: {e_copy}")
                                        continue
                                else:
                                    dest_caminho = dest_caminho
                                
                                # Se for arquivo de observação, faz o parse dos metadados e registra no BD
                                if ext_f_lower in ['.obs', '.o'] or re.match(r'^\.\d{2}o$', ext_f_lower):
                                    try:
                                        # Registra no histórico de rinex para a triagem inteligente reconhecer
                                        meta = ler_metadados_rinex(str(dest_caminho))
                                        if meta:
                                            # Insere no BD
                                            repo.insert(
                                                arquivo_nome=arq_bruto,
                                                arquivo_tamanho=tamanho_bruto,
                                                arquivo_path=str(pasta_brutos / arq_bruto),
                                                ponto_nome=meta['marcador'],
                                                data_inicio=meta['inicio'],
                                                data_fim=meta['fim'],
                                                latitude=meta['lat'],
                                                longitude=meta['lon'],
                                                sucesso=True
                                            )
                                            registrados.append(f"{f} -> Marcador: {meta['marcador']}")
                                        else:
                                            repo.insert(
                                                arquivo_nome=arq_bruto,
                                                arquivo_tamanho=tamanho_bruto,
                                                arquivo_path=str(pasta_brutos / arq_bruto),
                                                sucesso=True
                                            )
                                            registrados.append(f"{f} (sem metadados)")
                                    except Exception as e_db:
                                        erros.append(f"Erro ao registrar BD para {f}: {e_db}")
                                        
                except Exception as e_dir:
                    erros.append(f"Erro ao ler pasta {dir_busca}: {e_dir}")
                    
        # Regenera documentos
        wm.gerar_documento_cliente_workspace(lev_id)
        
        return {
            "success": True,
            "message": f"Busca finalizada. Encontrados {len(encontrados)} arquivos Rinex, copiados {len(copiados)}, registrados {len(registrados)}.",
            "arquivos_rinex_encontrados": encontrados,
            "arquivos_copiados": copiados,
            "arquivos_registrados": registrados,
            "erros": erros
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))

@app.get("/levantamentos/{lev_id}/arquivos")
def get_arquivos_levantamento(lev_id: int):
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        categorias = ["Brutos", "Rinex", "Processados", "Documentos", "Exportacoes"]
        resultado = {cat: [] for cat in categorias}
        
        if not folder.exists():
            return resultado
            
        import datetime
        for cat in categorias:
            cat_folder = folder / cat
            if cat_folder.exists() and cat_folder.is_dir():
                for f in cat_folder.iterdir():
                    if f.is_file():
                        stat = f.stat()
                        size_kb = stat.st_size / 1024
                        size_str = f"{size_kb:.1f} KB" if size_kb < 1024 else f"{size_kb/1024:.2f} MB"
                        mod_time = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%d/%m/%Y %H:%M")
                        resultado[cat].append({
                            "nome": f.name,
                            "tamanho": size_str,
                            "modificado": mod_time
                        })
                        
        return resultado
    except Exception as e:
        return {"error": str(e)}

@app.get("/levantamentos/{lev_id}/arquivos/download")
def download_arquivo_levantamento(lev_id: int, categoria: str, nome: str):
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        categorias = ["Brutos", "Rinex", "Processados", "Documentos", "Exportacoes"]
        if categoria not in categorias:
            raise HTTPException(status_code=400, detail="Categoria de pasta de arquivos inválida.")
            
        file_path = folder / categoria / nome
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="Arquivo não localizado no disco.")
            
        return FileResponse(file_path, filename=file_path.name)
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

# --- BANCO DE PONTOS E HOMOLOGAÇÃO INCRA ---

@app.post("/levantamentos/{id}/importar-pontos-aprovados")
async def importar_pontos_aprovados(id: int, file: UploadFile = File(...)):
    verificar_levantamento_arquivado(id)
    try:
        # 1. Obter o profissional_id associado ao levantamento
        lev = execute_query(
            "SELECT profissional_id, propriedade_id FROM levantamentos WHERE id = ?",
            params=(id,),
            fetch_one=True
        )
        if not lev:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
        
        profissional_id = lev["profissional_id"]
        
        # 2. Obter o codigo_credenciado do profissional
        prof = execute_query(
            "SELECT codigo_credenciado FROM profissionais WHERE id = ?",
            params=(profissional_id,),
            fetch_one=True
        )
        if not prof:
            raise HTTPException(status_code=404, detail="Responsável Técnico não encontrado para este levantamento.")
        
        codigo_credenciado = prof["codigo_credenciado"]
        if not codigo_credenciado:
            raise HTTPException(
                status_code=400,
                detail="O Responsável Técnico deste levantamento não possui um Código Credenciado cadastrado no INCRA."
            )
        
        # 3. Ler o conteúdo do arquivo
        content = await file.read()
        text = content.decode("utf-8", errors="ignore")
        
        # 4. Encontrar pontos usando expressão regular
        # O INCRA exige hifens no formato: CRED-TIPO-NUMERO, ex: ABC-M-0120 ou ABC-M-12
        import re
        pattern = re.compile(rf"\b({re.escape(codigo_credenciado)})-(M|P|V)-(\d+)\b", re.IGNORECASE)
        matches = pattern.findall(text)
        
        if not matches:
            return {
                "sucesso": False,
                "pontos_importados": 0,
                "mensagem": f"Nenhum ponto válido com o padrão '{codigo_credenciado}-M/P/V-XXXX' foi localizado no arquivo."
            }
        
        # 5. Organizar e desduplicar os pontos
        pontos_unicos = {}
        for match in matches:
            # match = (codigo_cred, tipo, numero)
            tipo = match[1].upper()
            num = int(match[2])
            pontos_unicos[(tipo, num)] = f"{codigo_credenciado}-{tipo}-{num:04d}"
        
        # 6. Salvar no banco (transacional)
        pontos_adicionados = 0
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # Limpa os pontos homologados anteriores para o levantamento
            cursor.execute("DELETE FROM banco_pontos WHERE levantamento_id = ?", (id,))
            
            for (tipo, num), cod_completo in pontos_unicos.items():
                try:
                    cursor.execute(
                        """
                        INSERT OR IGNORE INTO banco_pontos 
                        (profissional_id, levantamento_id, tipo_ponto, numero, codigo_completo) 
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (profissional_id, id, tipo, num, cod_completo)
                    )
                    if cursor.rowcount > 0:
                        pontos_adicionados += 1
                except Exception as e_db:
                    logging.getLogger(__name__).warning(f"Erro ao inserir ponto {cod_completo}: {e_db}")
            
            conn.commit()
            
        # 7. Recalcular os contadores de profissionais
        for t in ['M', 'P', 'V']:
            row_max = execute_query(
                "SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ?",
                params=(profissional_id, t),
                fetch_one=True
            )
            max_num = row_max["max_num"] if row_max and row_max["max_num"] is not None else 0
            col_name = f"contador_{t.lower()}"
            execute_query(
                f"UPDATE profissionais SET {col_name} = ? WHERE id = ?",
                params=(max_num, profissional_id),
                commit=True
            )
            
        return {
            "sucesso": True,
            "pontos_importados": len(pontos_unicos),
            "pontos_adicionados": pontos_adicionados,
            "mensagem": f"Processamento concluído. {len(pontos_unicos)} vértices homologados do credenciamento '{codigo_credenciado}' foram vinculados ao banco de pontos."
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro interno ao importar pontos homologados: {str(e)}")

@app.get("/profissionais/{prof_id}/banco-pontos")
def get_banco_pontos_profissional(prof_id: int):
    try:
        # Verificar se profissional existe
        prof = execute_query(
            "SELECT id, nome, codigo_credenciado FROM profissionais WHERE id = ?",
            params=(prof_id,),
            fetch_one=True
        )
        if not prof:
            raise HTTPException(status_code=404, detail="Profissional não encontrado.")
            
        # Obter todos os pontos usados por esse profissional
        rows = execute_query(
            """
            SELECT bp.id, bp.tipo_ponto, bp.numero, bp.codigo_completo, bp.created_at, bp.levantamento_id,
                   p.nome_propriedade
            FROM banco_pontos bp
            LEFT JOIN levantamentos l ON bp.levantamento_id = l.id
            LEFT JOIN propriedades p ON l.propriedade_id = p.id
            WHERE bp.profissional_id = ?
            ORDER BY bp.tipo_ponto ASC, bp.numero ASC
            """,
            params=(prof_id,),
            fetch_all=True
        )
        
        pontos_usados = [dict(r) for r in rows]
        
        # Agrupar por tipo de ponto e calcular estatísticas e lacunas
        estatisticas = {}
        for t in ['M', 'P', 'V']:
            nums_tipo = [p['numero'] for p in pontos_usados if p['tipo_ponto'] == t]
            if nums_tipo:
                max_num = max(nums_tipo)
                proximo = max_num + 1
                # Encontrar lacunas (números pulados entre 1 e max_num)
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
                "lacunas": lacunas[:100]  # Limita a exibição de lacunas para não estourar a resposta
            }
            
        return {
            "profissional": dict(prof),
            "estatisticas": estatisticas,
            "pontos": pontos_usados
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/levantamentos/{id}/pontos-sugeridos")
def get_pontos_sugeridos_levantamento(id: int):
    try:
        # Obter o profissional do levantamento
        row = execute_query(
            "SELECT profissional_id FROM levantamentos WHERE id = ?",
            params=(id,),
            fetch_one=True
        )
        if not row:
            raise HTTPException(status_code=404, detail="Levantamento não encontrado.")
            
        prof_id = row["profissional_id"]
        
        # Obter código credenciado
        prof = execute_query(
            "SELECT codigo_credenciado FROM profissionais WHERE id = ?",
            params=(prof_id,),
            fetch_one=True
        )
        codigo_cred = prof["codigo_credenciado"] if prof else ""
        
        # Para cada tipo (M, P, V), calcular o próximo número livre
        sugestoes = {}
        for t in ['M', 'P', 'V']:
            row_max = execute_query(
                "SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ?",
                params=(prof_id, t),
                fetch_one=True
            )
            max_num = row_max["max_num"] if row_max and row_max["max_num"] is not None else 0
            proximo = max_num + 1
            sugestoes[t] = {
                "proximo_numero": proximo,
                "codigo_sugerido": f"{codigo_cred}-{t}-{proximo:04d}" if codigo_cred else f"{t}-{proximo}"
            }
            
        return {
            "profissional_id": prof_id,
            "codigo_credenciado": codigo_cred,
            "sugestoes": sugestoes
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

# --- ROTAS DE MATRÍCULAS ---
@app.get("/levantamentos/{id}/matriculas")
def get_matriculas_do_levantamento(id: int):
    try:
        query = """
            SELECT m.* 
            FROM matriculas m
            JOIN propriedades p ON m.propriedade_id = p.id
            JOIN levantamentos l ON l.propriedade_id = p.id
            WHERE l.id = ?
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        return {"error": str(e)}

@app.post("/levantamentos/{id}/matriculas")
def create_matricula(id: int, m: MatriculaCreate):
    verificar_levantamento_arquivado(id)
    try:
        # Pega a propriedade associada ao levantamento
        row = execute_query("SELECT propriedade_id FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
        if not row:
            return {"error": "Levantamento não encontrado"}
        propriedade_id = row['propriedade_id']
        
        query = "INSERT INTO matriculas (propriedade_id, numero_matricula, ccir, itr, area_ha, valor_itr, denominacao, georreferenciamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        execute_query(query, params=(propriedade_id, m.numero_matricula, m.ccir, m.itr, m.area_ha, m.valor_itr, m.denominacao, m.georreferenciamento), commit=True)
        
        # Sincroniza metadados para levantamentos ativos
        query_ativos = "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'"
        ativos = execute_query(query_ativos, params=(propriedade_id,), fetch_all=True)
        wm = WorkspaceManager()
        for at in ativos:
            wm.gerar_documento_cliente_workspace(at['id'])
            
        return {"message": "Matrícula adicionada com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.put("/matriculas/{mid}")
def update_matricula(mid: int, m: MatriculaCreate):
    try:
        row = execute_query("SELECT propriedade_id FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
        if not row:
            return {"error": "Matrícula não encontrada"}
        propriedade_id = row["propriedade_id"]
        
        # Tranca de segurança
        rows_lev = execute_query("SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'", params=(propriedade_id,), fetch_all=True)
        if rows_lev:
            raise HTTPException(status_code=403, detail="Operação bloqueada: A matrícula pertence a um levantamento arquivado (Tranca Read-Only ativa).")
            
        query = """
            UPDATE matriculas 
            SET numero_matricula = ?, ccir = ?, itr = ?, area_ha = ?, valor_itr = ?, denominacao = ?, georreferenciamento = ?
            WHERE id = ?
        """
        execute_query(query, params=(m.numero_matricula, m.ccir, m.itr, m.area_ha, m.valor_itr, m.denominacao, m.georreferenciamento, mid), commit=True)
        
        # Sincroniza metadados para levantamentos ativos
        query_ativos = "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'"
        ativos = execute_query(query_ativos, params=(propriedade_id,), fetch_all=True)
        wm = WorkspaceManager()
        for at in ativos:
            wm.gerar_documento_cliente_workspace(at['id'])
            
        return {"message": "Matrícula atualizada e sincronizada com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.delete("/matriculas/{mid}")
def delete_matricula(mid: int):
    try:
        row = execute_query("SELECT propriedade_id FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
        if row:
            propriedade_id = row['propriedade_id']
            
            # Tranca de segurança
            rows_lev = execute_query("SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO'", params=(propriedade_id,), fetch_all=True)
            if rows_lev:
                raise HTTPException(status_code=403, detail="Operação bloqueada: A matrícula pertence a um levantamento arquivado (Tranca Read-Only ativa).")
                
            execute_query("DELETE FROM matriculas WHERE id = ?", params=(mid,), commit=True)
            
            # Sincroniza metadados para levantamentos ativos
            query_ativos = "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'"
            ativos = execute_query(query_ativos, params=(propriedade_id,), fetch_all=True)
            wm = WorkspaceManager()
            for at in ativos:
                wm.gerar_documento_cliente_workspace(at['id'])
                
        return {"message": "Matrícula removida"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

def sanitizar_ordens_duplicadas(levantamento_id: int):
    """
    Garante de forma robusta e determinística que não existam ordens de caminhamento duplicadas
    dentro do mesmo levantamento (divididas por matrícula) ou em pontos sem matrícula associada.
    Bases do tipo 'B' são mantidas com ordem NULL de forma rigorosa.
    """
    from database.connection import execute_query, DatabaseManager
    import logging
    logger = logging.getLogger(__name__)

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # 1. Sanitizar pontos de cada matrícula do levantamento
            cursor.execute(
                "SELECT DISTINCT matricula_id FROM pontos WHERE levantamento_id = ? AND matricula_id IS NOT NULL",
                (levantamento_id,)
            )
            matriculas = [r["matricula_id"] for r in cursor.fetchall()]

            for mid in matriculas:
                # Seleciona todos os pontos dessa matrícula, ignorando o tipo 'B'
                # Ordena pela ordem_caminhamento atual e id para preservar o ordenamento anterior
                cursor.execute(
                    """
                    SELECT id, ordem_caminhamento, tipo_ponto
                    FROM pontos
                    WHERE levantamento_id = ? AND matricula_id = ? AND tipo_ponto != 'B'
                    ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
                    """,
                    (levantamento_id, mid)
                )
                rows = cursor.fetchall()
                
                ordens = [r["ordem_caminhamento"] for r in rows if r["ordem_caminhamento"] is not None]
                tem_duplicidade = len(ordens) != len(set(ordens))
                tem_nulo = any(r["ordem_caminhamento"] is None for r in rows)

                if tem_duplicidade or tem_nulo:
                    logger.info(f"[SANITIZACAO_ORDEM] Corrigindo ordens para levantamento={levantamento_id}, matricula={mid}")
                    nova_ordem = 1
                    for r in rows:
                        cursor.execute(
                            "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?",
                            (nova_ordem, r["id"])
                        )
                        nova_ordem += 1

            # 2. Sanitizar pontos sem matrícula (avulsos)
            cursor.execute(
                """
                SELECT id, ordem_caminhamento, tipo_ponto
                FROM pontos
                WHERE levantamento_id = ? AND matricula_id IS NULL AND tipo_ponto != 'B'
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
                """,
                (levantamento_id,)
            )
            rows_avulsos = cursor.fetchall()
            
            ordens_avulsas = [r["ordem_caminhamento"] for r in rows_avulsos if r["ordem_caminhamento"] is not None]
            tem_duplicidade_avulsa = len(ordens_avulsas) != len(set(ordens_avulsas))
            tem_nulo_avulso = any(r["ordem_caminhamento"] is None for r in rows_avulsos)

            if tem_duplicidade_avulsa or tem_nulo_avulso:
                logger.info(f"[SANITIZACAO_ORDEM] Corrigindo ordens avulsas para levantamento={levantamento_id}")
                nova_ordem = 1
                for r in rows_avulsos:
                    cursor.execute(
                        "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ?",
                        (nova_ordem, r["id"])
                    )
                    nova_ordem += 1

            conn.commit()
    except Exception as e:
        logger.error(f"[SANITIZACAO_ORDEM] Falha ao sanitizar ordens: {e}")

# --- ROTAS DE PONTOS ---
@app.get("/levantamentos/{id}/pontos")
def get_pontos(id: int):
    try:
        # Sanitiza reativamente antes de carregar
        sanitizar_ordens_duplicadas(id)

        query = """
            SELECT p.*, m.numero_matricula 
            FROM pontos p
            LEFT JOIN matriculas m ON p.matricula_id = m.id
            WHERE p.levantamento_id = ?
            ORDER BY p.ordem_caminhamento ASC, p.id ASC
        """
        rows = [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
        
        # Computa rigorosamente as UTMs corrigidas no backend via pyproj
        from pyproj import Transformer
        for p in rows:
            p["e_corrigido"] = None
            p["n_corrigido"] = None
            lat_c = p.get("lat_corrigido") or p.get("lat")
            lon_c = p.get("lon_corrigido") or p.get("lon")
            if lat_c and lon_c:
                try:
                    zona_utm = int((lon_c + 180) / 6) + 1
                    epsg_code = f"319{60 + zona_utm}"
                    transformer = Transformer.from_crs("epsg:4674", f"epsg:{epsg_code}", always_xy=True)
                    e_corr, n_corr = transformer.transform(lon_c, lat_c)
                    p["e_corrigido"] = round(e_corr, 3)
                    p["n_corrigido"] = round(n_corr, 3)
                except Exception:
                    pass
        return rows
    except Exception as e:
        return {"error": str(e)}

@app.post("/levantamentos/{id}/pontos")
def create_ponto(id: int, p: PontoCreate):
    verificar_levantamento_arquivado(id)
    try:
        ordem = p.ordem_caminhamento
        if not ordem and p.tipo_ponto != 'B':
            if p.matricula_id:
                row_max = execute_query("SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ? AND matricula_id = ?", params=(id, p.matricula_id), fetch_one=True)
            else:
                row_max = execute_query("SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ?", params=(id,), fetch_one=True)
            max_ord = row_max["max_ord"] if row_max else None
            ordem = (max_ord + 1) if max_ord is not None else 1

        query = """
            INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        execute_query(query, params=(
            id, p.matricula_id, p.nome_vertice, p.tipo_ponto, p.lat, p.lon, p.alt, 
            p.sigma_lat, p.sigma_lon, p.sigma_alt, ordem
        ), commit=True)
        
        # Sanitiza reativamente após inserção
        sanitizar_ordens_duplicadas(id)
        
        return {"message": "Ponto cadastrado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.delete("/pontos/{pid}")
def delete_ponto(pid: int):
    try:
        row = execute_query("SELECT levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if row:
            p_data = dict(row)
            verificar_levantamento_arquivado(p_data["levantamento_id"])
            
            # Verifica se este ponto é do tipo 'B' ou se serve de base de apoio para translação de rovers
            check_base_uso = execute_query("SELECT COUNT(*) as count FROM pontos WHERE ponto_base_id = ?", params=(pid,), fetch_one=True)
            eh_base_apoio = check_base_uso and check_base_uso["count"] > 0
            
            if p_data["tipo_ponto"] == "B" or eh_base_apoio:
                from business.geoprocessamento import reverter_rovers_para_bruto
                reverter_rovers_para_bruto(p_data["levantamento_id"], pid)
            
            execute_query("DELETE FROM pontos WHERE id = ?", params=(pid,), commit=True)
            
            # Registrar exclusão de ponto no Histórico de Campo
            from business.historico_campo import HistoricoCampoLogger
            desc = f"Vértice {p_data['nome_vertice']} do Tipo '{p_data['tipo_ponto']}' foi excluído definitivamente pelo usuário."
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=p_data["levantamento_id"],
                tipo_evento="EXCLUSAO_PONTO",
                descricao=desc,
                dados_detalhados={
                    "ponto_id": pid,
                    "nome_vertice": p_data["nome_vertice"],
                    "tipo_ponto": p_data["tipo_ponto"],
                    "coordenadas_ultimo_estado": {"lat": p_data["lat"], "lon": p_data["lon"], "alt": p_data["alt"]}
                }
            )
            
            return {"message": "Ponto removido com sucesso"}
        else:
            return {"error": "Ponto não encontrado"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

# --- IMPORTAÇÃO DE CADERNETAS .TXT (MÓDULO 4 - MANIFESTO) ---
@app.post("/levantamentos/{id}/importar-txt")
async def importar_caderneta_txt(
    id: int, 
    matricula_id: int = Form(None), 
    base_escolhida_id: int = Form(None), 
    file: UploadFile = File(...)
):
    verificar_levantamento_arquivado(id)
    try:
        # 1. Utiliza o WorkspaceManager para localizar/criar a pasta /Processados no Windows
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(id)
        pasta_processados = folder / "Processados"
        pasta_processados.mkdir(parents=True, exist_ok=True)
        
        caminho_salvo = pasta_processados / file.filename
        
        # Salva fisicamente o arquivo TXT importado para auditoria futura
        with open(caminho_salvo, "wb") as buffer:
            buffer.write(await file.read())
            
        # 2. Instancia o parser geodésico e processa as coordenadas UTM + translação do RTK
        parser = TxtGeodesicParser(id, matricula_id, base_escolhida_id)
        pontos_processados = parser.processar_arquivo(str(caminho_salvo))
        
        if not pontos_processados:
            return {"error": "Nenhum vértice válido encontrado ou processado no arquivo."}
            
        ids_pontos = parser.persistir_no_banco(pontos_processados)
        
        # 3. AUTOMAÇÃO PERIMETRAL: Geração automática de segmentos sequenciais delegada ao método de domínio
        total_segmentos = parser.gerar_topologia_perimetral(ids_pontos, pontos_processados)
        
        # Sincroniza metadados no DADOS_GERAIS.json de forma reativa
        wm.gerar_documento_cliente_workspace(id)
        
        primeiro_pt = pontos_processados[0]
        layout = "RTK" if primeiro_pt["sigma_lat"] > 0.0 else "Topcon Estático"
        
        # Registrar evento de importação de arquivo no Histórico de Campo
        from business.historico_campo import HistoricoCampoLogger
        pontos_nomes = [pt["nome_vertice"] for pt in pontos_processados]
        desc = f"Importação de caderneta no layout '{layout}' do arquivo '{file.filename}' com {len(ids_pontos)} ponto(s)."
        if base_escolhida_id:
            row_base_nome = execute_query("SELECT nome_vertice FROM pontos WHERE id = ?", params=(base_escolhida_id,), fetch_one=True)
            if row_base_nome:
                desc += f" Vinculado à Base de Campo: {row_base_nome['nome_vertice']}."
                
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=id,
            tipo_evento="IMPORTACAO_TXT",
            descricao=desc,
            dados_detalhados={
                "arquivo_nome": file.filename,
                "layout_detectado": layout,
                "total_pontos_importados": len(ids_pontos),
                "pontos": pontos_nomes,
                "base_escolhida_id": base_escolhida_id,
                "matricula_id": matricula_id
            }
        )
        
        return {
            "message": f"Sucesso: {len(ids_pontos)} pontos importados e {total_segmentos} segmentos perimetrais gerados automaticamente.",
            "pontos_importados": len(ids_pontos),
            "layout_detectado": layout
        }
        
    except ValueError as val_err:
        # Retorna erro amigável de duplicidade ou violação de regra de negócio com HTTP 400
        logging.getLogger(__name__).warning(f"Tentativa de importação inválida: {val_err}")
        raise HTTPException(
            status_code=400,
            detail={
                "erro": "VIOLACAO_REGRA_NEGOCIO",
                "mensagem": str(val_err)
            }
        )
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro na importação de caderneta TXT: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "erro": "ERRO_INTERNO_PROCESSAMENTO",
                "mensagem": f"Falha no processamento: {str(e)}"
            }
        )

# --- NOVAS ROTAS DO MÓDULO DE LEVANTAMENTOS V2 (ORDENAÇÃO MANUAL) ---
class PayloadAssociarBase(BaseModel):
    ponto_id_selecionado: int
    base_ppp_id: int

class PayloadOverrideManual(BaseModel):
    arquivo_origem: str
    dados_brutos: dict
    dados_corrigidos: dict

@app.post("/levantamentos/{id}/pontos/associar-base")
def post_associar_base_lote(id: int, payload: PayloadAssociarBase):
    verificar_levantamento_arquivado(id)
    try:
        from business.geoprocessamento import associar_base_ao_lote
        qtd = associar_base_ao_lote(payload.ponto_id_selecionado, payload.base_ppp_id)
        # Sincroniza metadados
        wm = WorkspaceManager()
        wm.gerar_documento_cliente_workspace(id)
        return {"sucesso": True, "pontos_corrigidos": qtd, "mensagem": "Vínculo tardio e translação em bloco aplicados com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/levantamentos/{id}/pontos/corrigir-manual")
def post_corrigir_manual_lote(id: int, payload: PayloadOverrideManual):
    verificar_levantamento_arquivado(id)
    try:
        from business.geoprocessamento import aplicar_correcao_manual_lote
        qtd = aplicar_correcao_manual_lote(
            id, 
            None, 
            payload.arquivo_origem, 
            payload.dados_brutos, 
            payload.dados_corrigidos
        )
        # Sincroniza metadados
        wm = WorkspaceManager()
        wm.gerar_documento_cliente_workspace(id)
        return {"sucesso": True, "pontos_corrigidos": qtd, "mensagem": "Override manual e translação ECEF 3D aplicados com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class ItemOrdemPonto(BaseModel):
    id: int
    ordem: int

class PayloadSalvarOrdem(BaseModel):
    pontos_ordem: List[ItemOrdemPonto]

@app.post("/levantamentos/{id}/matriculas/{matricula_id}/salvar-ordem")
def post_salvar_ordem_perimetro(id: int, matricula_id: int, payload: PayloadSalvarOrdem):
    verificar_levantamento_arquivado(id)
    pontos_ordem = [item.dict() for item in payload.pontos_ordem]
    res = salvar_ordem_caminhamento(id, matricula_id, pontos_ordem)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Erro ao salvar ordem"))
    return res

@app.post("/levantamentos/{id}/matriculas/{matricula_id}/reordenar")
def post_reordenar_perimetro(id: int, matricula_id: int):
    verificar_levantamento_arquivado(id)
    from business.geoprocessamento import reordenar_perimetro_matricula
    
    resultado = reordenar_perimetro_matricula(id, matricula_id)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=400, detail=resultado["erro"])
        
    # Sincroniza o DADOS_GERAIS.json no workspace físico
    wm = WorkspaceManager()
    wm.gerar_documento_cliente_workspace(id)
    
    return resultado

@app.post("/levantamentos/{id}/salvar-ordem")
def post_salvar_ordem_global(id: int, payload: PayloadSalvarOrdem):
    verificar_levantamento_arquivado(id)
    pontos_ordem = [item.dict() for item in payload.pontos_ordem]
    res = salvar_ordem_caminhamento(id, None, pontos_ordem)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Erro ao salvar ordem"))
    return res

@app.post("/levantamentos/{id}/reordenar")
def post_reordenar_global(id: int):
    verificar_levantamento_arquivado(id)
    from business.geoprocessamento import reordenar_perimetro_matricula
    
    resultado = reordenar_perimetro_matricula(id, None)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=400, detail=resultado["erro"])
        
    # Sincroniza o DADOS_GERAIS.json no workspace físico
    wm = WorkspaceManager()
    wm.gerar_documento_cliente_workspace(id)
    
    return resultado

class PayloadLaudoFronteira(BaseModel):
    matricula_id: int
    profissional_id: int
    numero_trt: str
    data_quitacao_trt: str = ""

class PayloadLaudoFronteiraLote(BaseModel):
    matriculas_ids: List[int]
    profissional_id: int
    numero_trt: str
    data_quitacao_trt: str = ""

class MatriculaFronteiraUpdate(BaseModel):
    id: int
    numero_matricula: str
    ccir: Optional[str] = ""
    itr: Optional[str] = ""
    area_ha: float = 0.0
    cri_comarca: Optional[str] = ""
    cri_circunscricao: Optional[str] = ""
    livro_registro: Optional[str] = ""
    folha_registro: Optional[str] = ""

class ProprietarioFronteiraUpdate(BaseModel):
    id: int
    nome_completo: str
    cpf_cnpj: str
    rg_ie: Optional[str] = ""
    estado_civil: Optional[str] = ""
    regime_bens: Optional[str] = ""
    nome_conjuge: Optional[str] = ""
    cpf_conjuge: Optional[str] = ""
    rg_conjuge: Optional[str] = ""

class PropriedadeFronteiraUpdate(BaseModel):
    id: int
    nome_propriedade: str
    municipio: str
    uf: str
    codigo_car: Optional[str] = ""
    codigo_ccir: Optional[str] = ""

class PayloadAtualizarDadosFronteira(BaseModel):
    propriedade: PropriedadeFronteiraUpdate
    proprietario: Optional[ProprietarioFronteiraUpdate] = None
    matriculas: List[MatriculaFronteiraUpdate]
    profissional_id: Optional[int] = None

def verificar_propriedade_arquivada(prop_id: int):
    arquivado = execute_query(
        "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'ARQUIVADO' LIMIT 1",
        params=(prop_id,),
        fetch_one=True
    )
    if arquivado:
        raise HTTPException(
            status_code=403,
            detail="Operação bloqueada. Esta propriedade possui um levantamento arquivado no sistema (Tranca Read-Only)."
        )

@app.post("/propriedades/{prop_id}/upload-shapefile-fronteira")
async def upload_shapefile_fronteira(prop_id: int, matricula_id: Optional[int] = Query(None), file: UploadFile = File(...)):
    verificar_propriedade_arquivada(prop_id)
    try:
        from pathlib import Path
        import re
        if matricula_id:
            dest_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Shapefile_Fronteira" / f"Matricula_{matricula_id}"
        else:
            dest_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Shapefile_Fronteira"
            
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        # Purgar arquivos antigos da pasta de Shapefile
        for f in dest_dir.glob("*"):
            if f.is_file():
                try:
                    f.unlink()
                except Exception as ue:
                    logging.getLogger(__name__).warning(f"Não foi possível excluir {f.name}: {ue}")
                
        safe_filename = re.sub(r'[\\/*?:"<>|]', "", file.filename)
        dest_path = dest_dir / safe_filename
        
        with open(dest_path, "wb") as buffer:
            buffer.write(await file.read())
            
        from business.report_generator import calcular_menor_distancia_fronteira
        dist_km, lat, lon = calcular_menor_distancia_fronteira(prop_id, matricula_id)
        
        return {
            "sucesso": True,
            "distancia_fronteira_km": round(dist_km, 3),
            "lat": lat,
            "lon": lon,
            "mensagem": f"Shapefile processado com sucesso! Distância de isolamento: {dist_km:.3f} km."
        }
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao processar shapefile de fronteira: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/levantamentos/{id}/matriculas/{matricula_id}/laudo-fronteira-html", response_class=HTMLResponse)
def get_laudo_fronteira_html(id: int, matricula_id: int, numero_trt: str, data_trt: Optional[str] = ""):
    """Gera o laudo de fronteira em HTML estruturado de forma independente"""
    try:
        from business.report_generator import BorderAreaReportGenerator
        html = BorderAreaReportGenerator.gerar_laudo_fronteira_html(
            lev_id=id,
            matricula_id=matricula_id,
            numero_trt=numero_trt,
            data_trt=data_trt
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/levantamentos/{id}/matriculas/{matricula_id}/requerimento-ratificacao-html", response_class=HTMLResponse)
def get_requerimento_ratificacao_html(id: int, matricula_id: int):
    """Gera o requerimento de ratificação de fronteira em HTML estruturado de forma independente"""
    try:
        from business.report_generator import BorderAreaReportGenerator
        html = BorderAreaReportGenerator.gerar_requerimento_ratificacao_html(
            lev_id=id,
            matricula_id=matricula_id
        )
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/propriedades/{prop_id}/dados-fronteira")
def get_dados_fronteira(prop_id: int):
    """Consolida os dados da propriedade, de suas matrículas e do proprietário principal para o modal de fronteira"""
    from pathlib import Path
    try:
        prop = execute_query("SELECT id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir FROM propriedades WHERE id = ?", params=(prop_id,), fetch_one=True)
        if not prop:
            raise HTTPException(status_code=404, detail="Propriedade não encontrada")
        
        owner = execute_query("""
            SELECT c.id, c.nome_completo, c.cpf_cnpj, c.rg_ie, c.estado_civil, c.regime_bens, 
                   c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            WHERE pc.propriedade_id = ?
            ORDER BY pc.percentual_participacao DESC, c.id ASC
            LIMIT 1
        """, params=(prop_id,), fetch_one=True)
        
        matriculas = execute_query("""
            SELECT id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro
            FROM matriculas
            WHERE propriedade_id = ?
        """, params=(prop_id,), fetch_all=True)
        
        matriculas_list = []
        for m in matriculas:
            m_dict = dict(m)
            folder_shp = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Shapefile_Fronteira" / f"Matricula_{m_dict['id']}"
            has_shp = folder_shp.exists() and (list(folder_shp.glob("*.shp")) or list(folder_shp.glob("*.zip")))
            m_dict["has_shapefile"] = bool(has_shp)
            
            try:
                from business.report_generator import calcular_menor_distancia_fronteira
                dist_km, _, _ = calcular_menor_distancia_fronteira(prop_id, m_dict['id'])
                m_dict["distancia_fronteira_km"] = round(dist_km, 3)
            except Exception:
                m_dict["distancia_fronteira_km"] = None
                
            matriculas_list.append(m_dict)
            
        return {
            "propriedade": dict(prop),
            "proprietario": dict(owner) if owner else None,
            "matriculas": matriculas_list
        }
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao obter dados de fronteira: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/propriedades/{prop_id}/atualizar-dados-fronteira")
def post_atualizar_dados_fronteira(prop_id: int, payload: PayloadAtualizarDadosFronteira):
    """Atualiza dados de propriedade, do proprietário principal e das matrículas em lote"""
    verificar_propriedade_arquivada(prop_id)
    try:
        # Verifica se já existe um levantamento cadastrado para a propriedade
        row_lev = execute_query(
            "SELECT id FROM levantamentos WHERE propriedade_id = ? ORDER BY status = 'EM_ANDAMENTO' DESC, id DESC LIMIT 1",
            params=(prop_id,),
            fetch_one=True
        )
        
        lev_id = row_lev["id"] if row_lev else None
        
        # Se não houver nenhum levantamento e profissional_id estiver disponível, criamos um automático!
        if not lev_id and payload.profissional_id:
            from datetime import date
            data_atual = date.today().strftime("%Y-%m-%d")
            
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio) VALUES (?, ?, ?)",
                    (prop_id, payload.profissional_id, data_atual)
                )
                lev_id = cursor.lastrowid
                conn.commit()
                
            # Criar Workspace físico e gerar DADOS_GERAIS.json
            from business.workspace_manager import WorkspaceManager
            wm = WorkspaceManager()
            pasta = wm.create_workspace(lev_id)
            
            # Sincroniza o caminho físico da pasta no banco
            execute_query("UPDATE levantamentos SET pasta_projeto = ? WHERE id = ?", params=(pasta, lev_id), commit=True)
            wm.gerar_documento_cliente_workspace(lev_id)
            logging.getLogger(__name__).info(f"[FRONTEIRA] Criado levantamento automático ID {lev_id} para a propriedade ID {prop_id}.")

        p = payload.propriedade
        execute_query("""
            UPDATE propriedades 
            SET nome_propriedade = ?, municipio = ?, uf = ?, codigo_car = ?, codigo_ccir = ?
            WHERE id = ?
        """, params=(p.nome_propriedade, p.municipio, p.uf, p.codigo_car, p.codigo_ccir, prop_id), commit=True)
        
        if payload.proprietario:
            o = payload.proprietario
            execute_query("""
                UPDATE clientes 
                SET nome_completo = ?, cpf_cnpj = ?, rg_ie = ?, estado_civil = ?, regime_bens = ?,
                    nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?
                WHERE id = ?
            """, params=(o.nome_completo, o.cpf_cnpj, o.rg_ie, o.estado_civil, o.regime_bens,
                         o.nome_conjuge, o.cpf_conjuge, o.rg_conjuge, o.id), commit=True)
            
        for m in payload.matriculas:
            execute_query("""
                UPDATE matriculas 
                SET numero_matricula = ?, ccir = ?, itr = ?, area_ha = ?, cri_comarca = ?, 
                    cri_circunscricao = ?, livro_registro = ?, folha_registro = ?
                WHERE id = ? AND propriedade_id = ?
            """, params=(m.numero_matricula, m.ccir, m.itr, m.area_ha, m.cri_comarca,
                         m.cri_circunscricao, m.livro_registro, m.folha_registro, m.id, prop_id), commit=True)
            
        # Sincroniza metadados para levantamentos ativos se houver
        query_ativos = "SELECT id FROM levantamentos WHERE propriedade_id = ? AND status = 'EM_ANDAMENTO'"
        ativos = execute_query(query_ativos, params=(prop_id,), fetch_all=True)
        from business.workspace_manager import WorkspaceManager
        wm = WorkspaceManager()
        for at in ativos:
            wm.gerar_documento_cliente_workspace(at['id'])
            
        return {
            "sucesso": True, 
            "mensagem": "Dados de fronteira atualizados e sincronizados com sucesso!",
            "levantamento_id": lev_id
        }
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao atualizar dados de fronteira em lote: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/propriedades/{prop_id}/arquivos")
def get_arquivos_propriedade(prop_id: int):
    """Lista todos os arquivos contidos na pasta de Documentos da propriedade"""
    try:
        docs_dir = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Documentos"
        if not docs_dir.exists():
            return {"Documentos": []}
            
        arquivos = []
        import datetime
        for f in docs_dir.glob("*.docx"):
            if f.is_file():
                stat = f.stat()
                modificado = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%d/%m/%Y %H:%M")
                tamanho_kb = max(1, round(stat.st_size / 1024))
                arquivos.append({
                    "nome": f.name,
                    "tamanho": f"{tamanho_kb} KB",
                    "modificado": modificado
                })
        return {"Documentos": arquivos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/propriedades/{prop_id}/arquivos/download")
def download_arquivo_propriedade(prop_id: int, nome: str):
    """Efetua o download seguro de um arquivo na pasta de Documentos da propriedade"""
    try:
        safe_name = re.sub(r'[\\/*?:"<>|]', "", nome)
        file_path = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{prop_id}" / "Documentos" / safe_name
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Arquivo não localizado no workspace da propriedade.")
            
        return FileResponse(
            path=str(file_path),
            filename=safe_name,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/levantamentos/{id}/consolidar-pontos")
def endpoint_consolidar_pontos(id: int):

    """
    Executa a consolidação espacial de todos os pontos do levantamento,
    gravando o arquivo TXT na pasta física de exportações.
    """
    verificar_levantamento_arquivado(id)
    try:
        wm = WorkspaceManager()
        caminho_arquivo = wm.consolidar_pontos_levantamento(id)
        
        return {
            "success": True,
            "message": "Pontos consolidados com coordenadas UTM corrigidas e confrontantes mapeados com sucesso!",
            "arquivo": "PONTOS_CONSOLIDADOS_UTM.txt",
            "caminho_completo": caminho_arquivo
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/levantamentos/{lev_id}/arquivos/deletar")
def deletar_arquivo_levantamento(lev_id: int, categoria: str, nome: str):
    verificar_levantamento_arquivado(lev_id)
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        
        categorias = ["Brutos", "Rinex", "Processados", "Documentos", "Exportacoes"]
        if categoria not in categorias:
            raise HTTPException(status_code=400, detail="Categoria de pasta de arquivos inválida.")
            
        file_path = folder / categoria / nome
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="Arquivo não localizado no disco.")
            
        # Destrava a permissão de escrita temporariamente para deletar
        import stat
        try:
            os.chmod(file_path, stat.S_IWRITE)
        except Exception:
            pass
            
        os.remove(file_path)

        # Purga reativa de pontos no banco de dados se for uma caderneta processada .txt
        pontos_removidos = 0
        if categoria == "Processados" and nome.lower().endswith(".txt"):
            from database.connection import execute_query
            # Descobre quantos pontos serão deletados para auditoria/log
            count_row = execute_query(
                "SELECT COUNT(*) as qtd FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ?",
                params=(lev_id, nome),
                fetch_one=True
            )
            pontos_removidos = count_row["qtd"] if count_row else 0
            
            execute_query(
                "DELETE FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ?",
                params=(lev_id, nome),
                commit=True
            )
            logging.getLogger(__name__).info(f"[WORKSPACE] Purgados {pontos_removidos} pontos pertencentes ao lote/arquivo deletado: {nome}")
            
        return {
            "success": True, 
            "message": f"Arquivo '{nome}' excluído com sucesso do repositório físico.",
            "pontos_removidos": pontos_removidos
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

class ConversaoRinexPayload(BaseModel):
    levantamento_id: int
    arquivo: str

@app.post("/process/converter-gns-rinex")
def converter_gns_rinex(payload: ConversaoRinexPayload):
    verificar_levantamento_arquivado(payload.levantamento_id)
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(payload.levantamento_id)
        
        caminho_bruto = folder / "Brutos" / payload.arquivo
        if not caminho_bruto.exists():
            raise HTTPException(status_code=404, detail="Arquivo bruto original não encontrado no disco.")
            
        pasta_dest_rinex = folder / "Rinex"
        pasta_dest_rinex.mkdir(parents=True, exist_ok=True)
        
        from business.gnss_worker import GNSSPipelineWorker
        worker = GNSSPipelineWorker([str(caminho_bruto)], str(pasta_dest_rinex), LogQueue())
        worker.run()
        
        return {"success": True, "message": "Conversão do arquivo bruto .GNS para RINEX universal concluída com sucesso!"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

# --- ROTAS DE CONFRONTANTES ---
@app.get("/levantamentos/{id}/confrontantes")
def get_confrontantes(id: int):
    try:
        return [dict(r) for r in execute_query("SELECT * FROM confrontantes WHERE levantamento_id = ?", params=(id,), fetch_all=True)]
    except Exception as e:
        return {"error": str(e)}

@app.post("/levantamentos/{id}/confrontantes")
def create_confrontante(id: int, c: ConfrontanteCreate):
    verificar_levantamento_arquivado(id)
    try:
        query = "INSERT INTO confrontantes (levantamento_id, nome, cpf_cnpj, tipo_relacao) VALUES (?, ?, ?, ?)"
        execute_query(query, params=(id, c.nome, c.cpf_cnpj, c.tipo_relacao), commit=True)
        return {"message": "Confrontante adicionado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.put("/confrontantes/{cid}")
def update_confrontante(cid: int, c: ConfrontanteCreate):
    try:
        row = execute_query("SELECT levantamento_id FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        query = "UPDATE confrontantes SET nome = ?, cpf_cnpj = ?, tipo_relacao = ? WHERE id = ?"
        execute_query(query, params=(c.nome, c.cpf_cnpj, c.tipo_relacao, cid), commit=True)
        return {"message": "Confrontante atualizado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.delete("/confrontantes/{cid}")
def delete_confrontante(cid: int):
    try:
        row = execute_query("SELECT levantamento_id FROM confrontantes WHERE id = ?", params=(cid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        execute_query("DELETE FROM confrontantes WHERE id = ?", params=(cid,), commit=True)
        return {"message": "Confrontante removido com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

# --- ROTAS DE SEGMENTOS ---
@app.get("/levantamentos/{id}/segmentos")
def get_segmentos(id: int):
    try:
        query = """
            SELECT s.*, 
                   p_ini.nome_vertice as nome_ponto_inicio, 
                   p_fim.nome_vertice as nome_ponto_fim, 
                   c.nome as nome_confrontante,
                   m.numero_matricula
            FROM segmentos s
            JOIN pontos p_ini ON s.ponto_inicio_id = p_ini.id
            JOIN pontos p_fim ON s.ponto_fim_id = p_fim.id
            JOIN matriculas m ON s.matricula_id = m.id
            LEFT JOIN confrontantes c ON s.confrontante_id = c.id
            WHERE s.levantamento_id = ?
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        return {"error": str(e)}

@app.post("/levantamentos/{id}/segmentos")
def create_segmento(id: int, s: SegmentoCreate):
    verificar_levantamento_arquivado(id)
    try:
        query = """
            INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        execute_query(query, params=(id, s.matricula_id, s.ponto_inicio_id, s.ponto_fim_id, s.confrontante_id, s.tipo_limite_sigef, s.metodo_posicionamento_sigef), commit=True)
        return {"message": "Segmento criado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.put("/segmentos/{sid}")
def update_segmento(sid: int, s: SegmentoCreate):
    try:
        row = execute_query("SELECT levantamento_id FROM segmentos WHERE id = ?", params=(sid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        query = """
            UPDATE segmentos 
            SET matricula_id = ?, ponto_inicio_id = ?, ponto_fim_id = ?, confrontante_id = ?, tipo_limite_sigef = ?, metodo_posicionamento_sigef = ?
            WHERE id = ?
        """
        execute_query(query, params=(s.matricula_id, s.ponto_inicio_id, s.ponto_fim_id, s.confrontante_id, s.tipo_limite_sigef, s.metodo_posicionamento_sigef, sid), commit=True)
        return {"message": "Segmento atualizado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.delete("/segmentos/{sid}")
def delete_segmento(sid: int):
    try:
        row = execute_query("SELECT levantamento_id FROM segmentos WHERE id = ?", params=(sid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        execute_query("DELETE FROM segmentos WHERE id = ?", params=(sid,), commit=True)
        return {"message": "Segmento removido com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

# -----------------------------------------
@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    uploaded_paths = []
    upload_dir = os.path.join(EXPORT_BASE_FOLDER, "Uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    for file in files:
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        uploaded_paths.append(file_path)
        add_log(f"Arquivo recebido: {file.filename}")
        
    return {"files": uploaded_paths}

class LogQueue:
    def put(self, msg):
        if isinstance(msg, dict) and "mensagem" in msg:
            add_log(msg["mensagem"])

import threading

# Controle global de conversão com debounce para evitar múltiplas instâncias do HGO
hgo_global_execution_lock = threading.Lock()

class DebouncedHGOConverter:
    def __init__(self):
        self.arquivos_pendentes = {}  # lev_id -> set of file paths
        self.timers = {}              # lev_id -> threading.Timer
        self.lock = threading.Lock()  # Trava para concorrência de controle

    def agendar_conversao(self, lev_id: int, caminho_arquivo: str, pasta_rinex: str):
        with self.lock:
            # Inicializa a lista de arquivos pendentes para o levantamento se não existir
            if lev_id not in self.arquivos_pendentes:
                self.arquivos_pendentes[lev_id] = set()
            
            self.arquivos_pendentes[lev_id].add(caminho_arquivo)
            
            # Se já existir um timer agendado para este levantamento, cancela ele
            if lev_id in self.timers:
                self.timers[lev_id].cancel()
                
            # Cria um novo timer de 4.0 segundos para disparar a conversão
            timer = threading.Timer(
                4.0, 
                self._disparar_conversao, 
                args=[lev_id, pasta_rinex]
            )
            self.timers[lev_id] = timer
            timer.start()
            add_log(f"[AUTO-RINEX] Arquivo {os.path.basename(caminho_arquivo)} enfileirado para conversao (Lev {lev_id})")

    def _disparar_conversao(self, lev_id: int, pasta_rinex: str):
        with self.lock:
            arquivos = list(self.arquivos_pendentes.get(lev_id, set()))
            # Limpa a fila para este levantamento
            if lev_id in self.arquivos_pendentes:
                del self.arquivos_pendentes[lev_id]
            if lev_id in self.timers:
                del self.timers[lev_id]
                
        if not arquivos:
            return
            
        # Executa a conversão sob uma trava global de exclusão mútua do HGO
        with hgo_global_execution_lock:
            try:
                add_log(f"[AUTO-RINEX] Iniciando conversao em lote de {len(arquivos)} arquivos GNSS...")
                
                # Desbloqueia permissões de leitura
                import stat
                for arq in arquivos:
                    try:
                        os.chmod(arq, os.stat(arq).st_mode | stat.S_IREAD)
                    except: pass
                
                from business.gnss_worker import GNSSPipelineWorker
                # Executa o pipeline para a lista completa de arquivos agrupados
                worker = GNSSPipelineWorker(
                    arquivos, 
                    pasta_rinex, 
                    LogQueue(), 
                    levantamento_id=lev_id
                )
                worker.run()
                add_log(f"[AUTO-RINEX] Lote de {len(arquivos)} arquivos finalizado com sucesso!")
            except Exception as e:
                add_log(f"[AUTO-RINEX] ERRO na conversao em lote para Lev {lev_id}: {e}")

hgo_converter_debounced = DebouncedHGOConverter()

def _converter_gns_background(caminho_bruto: str, pasta_rinex: str, lev_id: int):
    """Encaminha o arquivo para a esteira de conversão em lote com debounce e enfileiramento seguro."""
    hgo_converter_debounced.agendar_conversao(lev_id, caminho_bruto, pasta_rinex)

# Example background task for PPP
def run_ppp_task(files: List[str]):
    import os
    from business.gnss_worker import GNSSPipelineWorker
    from business.ppp_processor import LotePPPManager
    
    add_log(f"Iniciando processamento de {len(files)} arquivos...")
    pasta_destino = os.path.join(EXPORT_BASE_FOLDER, "Bases_RINEX")
    os.makedirs(pasta_destino, exist_ok=True)
    
    worker = GNSSPipelineWorker(files, pasta_destino, LogQueue())
    worker.run()
    
    add_log("Conversão RPA Terminada. Iniciando Envio PPP...")
    import re
    # ENVIO AO IBGE-PPP DESATIVADO TEMPORARIAMENTE A PEDIDO DO USUÁRIO
    # arquivos_rinex = [os.path.join(pasta_destino, f) for f in os.listdir(pasta_destino) if f.lower().endswith((".o", ".obs")) or re.match(r'^\.\d{2}o$', os.path.splitext(f.lower())[1])]
    # if arquivos_rinex:
    #     log_q = LogQueue()
    #     manager = LotePPPManager(use_api=True, log_callback=lambda m: log_q.put({"mensagem": m}))
    #     out_pasta_ppp = os.path.join(EXPORT_BASE_FOLDER, "Processados_PPP")
    #     os.makedirs(out_pasta_ppp, exist_ok=True)
    #     manager.processar_lote(arquivos_rinex, out_pasta_ppp)
    
    add_log("Processo PPP Finalizado (Envio IBGE ignorado)!")

@app.post("/process/ppp")
async def start_ppp(files: List[str], background_tasks: BackgroundTasks):
    background_tasks.add_task(run_ppp_task, files)
    return {"message": "Processamento iniciado em segundo plano"}

@app.get("/pick-folder")
def pick_folder():
    import tkinter as tk
    from tkinter import filedialog
    # Start a hidden root window
    root = tk.Tk()
    root.withdraw()
    # Make it appear on top
    root.attributes('-topmost', True)
    folder_path = filedialog.askdirectory(title="Selecione a pasta com arquivos .GNS")
    root.destroy()
    return {"path": folder_path or ""}

def run_hgo_task(pasta: str):
    import os
    from business.gnss_worker import GNSSPipelineWorker
    from business.triagem_inteligente import organizar_rastreios
    
    add_log(f"Iniciando triagem HGO na pasta: {pasta}")
    arquivos = [os.path.join(pasta, a) for a in os.listdir(pasta) if a.upper().endswith(".GNS")]
    
    if not arquivos:
        add_log("Nenhum arquivo .GNS encontrado na pasta.")
        return
        
    pasta_dest_rinex = os.path.join(pasta, "Rinex_Temporario")
    os.makedirs(pasta_dest_rinex, exist_ok=True)
    
    worker = GNSSPipelineWorker(arquivos, pasta_dest_rinex, LogQueue())
    worker.run()
    
    add_log("Conversão HGO Terminada. Iniciando Triagem de Metadados...")
    pasta_destino_hgo = os.path.join(pasta, "Bases_e_Rovers_HGO_Prontos")
    os.makedirs(pasta_destino_hgo, exist_ok=True)
    
    organizar_rastreios(pasta_dest_rinex, pasta_destino_hgo)

    # 4. Limpeza Automática de Temporários do Workspace (Item 14)
    try:
        import shutil
        if os.path.exists(pasta_dest_rinex):
            shutil.rmtree(pasta_dest_rinex)
            add_log("[LIMPEZA] Pasta de arquivos temporários 'Rinex_Temporario' purgada do Workspace com sucesso para liberar espaço físico.")
    except Exception as e_clean:
        add_log(f"[LIMPEZA] AVISO: Falha ao remover pasta de temporários 'Rinex_Temporario': {e_clean}")

    add_log("Triagem de Rastreios Finalizada! Verifique a pasta raiz.")

@app.post("/process/hgo")
async def start_hgo(payload: dict, background_tasks: BackgroundTasks):
    pasta = payload.get("pasta")
    if pasta:
        background_tasks.add_task(run_hgo_task, pasta)
        return {"message": "Triagem iniciada em segundo plano"}
    return {"error": "Pasta não fornecida"}

@app.get("/proxy/sigef")
async def proxy_sigef(url: str):
    import requests
    import re
    try:
        # Forçamos o formato para text/plain pois o i3Geo do INCRA falha com application/json
        # Substituímos application/json por text/plain na URL se necessário
        if "INFO_FORMAT=application%2Fjson" in url:
            url = url.replace("INFO_FORMAT=application%2Fjson", "INFO_FORMAT=text/plain")
        elif "INFO_FORMAT=application/json" in url:
            url = url.replace("INFO_FORMAT=application/json", "INFO_FORMAT=text/plain")

        response = requests.get(url, timeout=15)
        response.encoding = 'latin-1' # INCRA usa latin-1
        text = response.text
        
        # Se a resposta parece ser o formato text/plain do MapServer
        if "GetFeatureInfo results:" in text:
            features = []
            # Regex para capturar os campos chave=valor
            # Exemplo: parcela_codigo = '...'
            lines = text.splitlines()
            current_feature = {}
            
            for line in lines:
                # Suporta chaves e valores acentuados, cedilhas, com aspas simples, aspas duplas ou sem aspas (Item 9)
                match = re.search(r"([\w_]+)\s*=\s*['\"]?([^'\"]*)['\"]?", line.strip())
                if match:
                    key, value = match.groups()
                    current_feature[key] = value.strip()
                elif "Feature" in line and current_feature:
                    features.append({"properties": current_feature, "id": current_feature.get("parcela_codigo")})
                    current_feature = {}
            
            if current_feature:
                features.append({
                    "properties": current_feature, 
                    "id": current_feature.get("parcela_codigo") or current_feature.get("id")
                })
                
            return {"features": features}
            
        try:
            return response.json()
        except Exception:
            return {"error": "Resposta não é JSON nem Texto formatado", "raw": text[:500]}
            
    except Exception as e:
        print(f"Erro na requisição proxy: {e}")
        return {"error": str(e)}
            
@app.post("/levantamentos/{lev_id}/importar-confrontante-sigef")
def importar_confrontante_sigef(lev_id: int, codigo_parcela: str):
    """
    Baixa os arquivos CSV de limites e vértices do SIGEF/INCRA de uma parcela confrontante
    e os salva na pasta de Documentos do levantamento atual.
    """
    verificar_levantamento_arquivado(lev_id)
    
    import re
    if not codigo_parcela or not re.match(r"^[a-zA-Z0-9\-]+$", codigo_parcela):
        raise HTTPException(status_code=400, detail="Código de parcela inválido.")
        
    url_vertices = f"https://sigef.incra.gov.br/geo/exportar/vertice/csv/{codigo_parcela}"
    url_limites = f"https://sigef.incra.gov.br/geo/exportar/limite/csv/{codigo_parcela}"
    
    try:
        import requests
        import time
        
        # Cria uma sessão para manter os cookies de navegação e simular navegador humano
        session = requests.Session()
        
        headers_home = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1"
        }
        
        # 1. Faz uma requisição inicial para a home do SIGEF para coletar cookies de sessão padrão
        try:
            session.get("https://sigef.incra.gov.br/", headers=headers_home, timeout=10)
        except Exception:
            pass
            
        # Delay de 2.5 segundos: tempo simulado do usuário ver a tela e clicar em buscar/detalhes
        time.sleep(2.5)
            
        # 2. Visita a página de detalhes do lote/parcela na mesma sessão para autenticar a consulta da parcela
        headers_detalhe = headers_home.copy()
        headers_detalhe["Referer"] = "https://sigef.incra.gov.br/"
        headers_detalhe["Sec-Fetch-Site"] = "same-origin"
        
        try:
            url_detalhe = f"https://sigef.incra.gov.br/geo/parcela/detalhe/{codigo_parcela}/"
            session.get(url_detalhe, headers=headers_detalhe, timeout=12)
        except Exception:
            pass
            
        # Delay de 3.5 segundos: tempo simulado do usuário ler os dados e decidir clicar para exportar CSV
        time.sleep(3.5)
            
        # 3. Configura cabeçalhos para os downloads a partir da página de detalhes
        headers_download = headers_home.copy()
        headers_download["Referer"] = f"https://sigef.incra.gov.br/geo/parcela/detalhe/{codigo_parcela}/"
        headers_download["Sec-Fetch-Site"] = "same-origin"
        headers_download["Sec-Fetch-Mode"] = "navigate"
        headers_download["Sec-Fetch-Dest"] = "document"
        
        # Faz download de vértices
        res_vertices = session.get(url_vertices, headers=headers_download, timeout=15)
        if res_vertices.status_code != 200:
            raise HTTPException(
                status_code=400, 
                detail=f"Falha ao baixar vértices do SIGEF (HTTP {res_vertices.status_code})"
            )
            
        # Verifica se o retorno é HTML de erro do tipo [Go Back] ou similar
        if b"[Go Back]" in res_vertices.content or b"<html" in res_vertices.content[:150].lower():
            raise HTTPException(
                status_code=400,
                detail="O SIGEF bloqueou a requisição automatizada de vértices (HTML Go Back recebido). Tente novamente em alguns instantes."
            )
            
        # Delay de 1.8 segundos entre os downloads para parecer cliques individuais
        time.sleep(1.8)
            
        # Faz download de limites
        res_limites = session.get(url_limites, headers=headers_download, timeout=15)
        if res_limites.status_code != 200:
            raise HTTPException(
                status_code=400, 
                detail=f"Falha ao baixar limites do SIGEF (HTTP {res_limites.status_code})"
            )
            
        # Verifica se o retorno de limites é HTML de erro
        if b"[Go Back]" in res_limites.content or b"<html" in res_limites.content[:150].lower():
            raise HTTPException(
                status_code=400,
                detail="O SIGEF bloqueou a requisição automatizada de limites (HTML Go Back recebido). Tente novamente em alguns instantes."
            )
            
    except requests.RequestException as e:
        raise HTTPException(
            status_code=502, 
            detail=f"Erro de comunicação com o SIGEF: {str(e)}"
        )
        
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        wm.create_workspace(lev_id)
        
        pasta_docs = folder / "Documentos"
        pasta_docs.mkdir(parents=True, exist_ok=True)
        
        file_vertices = pasta_docs / f"vizinho_{codigo_parcela}_vertices.csv"
        file_limites = pasta_docs / f"vizinho_{codigo_parcela}_limites.csv"
        
        with open(file_vertices, "wb") as f:
            f.write(res_vertices.content)
            
        with open(file_limites, "wb") as f:
            f.write(res_limites.content)
            
        return {
            "success": True,
            "message": "Dados de limites e vértices do vizinho importados com sucesso!",
            "arquivos": [file_vertices.name, file_limites.name]
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao salvar arquivos no Workspace: {str(e)}"
        )

def processar_arquivos_sigef(vertices_content: str, limites_content: str) -> str:
    import csv
    import io
    import re
    from pyproj import Transformer

    wkt_point_re = re.compile(r"POINT\s*\(\s*([\-\d\.]+)\s+([\-\d\.]+)\s*\)", re.IGNORECASE)
    transformer_utm = Transformer.from_crs("epsg:4674", "epsg:31982", always_xy=True)

    # 1. Parse do arquivo de limites para mapear confrontantes
    limites_reader = csv.reader(io.StringIO(limites_content), delimiter=';')
    headers_limites = next(limites_reader, None)
    
    idx_do_vertice = -1
    idx_confrontante = -1
    
    if headers_limites:
        headers_limites = [h.upper().strip() for h in headers_limites]
        if "DO_VERTICE" in headers_limites:
            idx_do_vertice = headers_limites.index("DO_VERTICE")
        if "CONFRONTANTE_DESC" in headers_limites:
            idx_confrontante = headers_limites.index("CONFRONTANTE_DESC")
            
    confrontantes_map = {}
    if idx_do_vertice != -1 and idx_confrontante != -1:
        for row in limites_reader:
            if len(row) > max(idx_do_vertice, idx_confrontante):
                do_v = row[idx_do_vertice].strip().upper()
                conf = row[idx_confrontante].strip()
                if do_v and conf:
                    confrontantes_map[do_v] = conf

    # 2. Parse do arquivo de vértices e montagem do consolidado
    vertices_reader = csv.reader(io.StringIO(vertices_content), delimiter=';')
    headers_vertices = next(vertices_reader, None)
    
    idx_codigo = -1
    idx_sz = -1
    idx_sx = -1
    idx_sy = -1
    idx_z = -1
    idx_wkt = -1
    
    if headers_vertices:
        headers_vertices = [h.upper().strip() for h in headers_vertices]
        if "CODIGO" in headers_vertices:
            idx_codigo = headers_vertices.index("CODIGO")
        if "SIGMA_X" in headers_vertices:
            idx_sx = headers_vertices.index("SIGMA_X")
        if "SIGMA_Y" in headers_vertices:
            idx_sy = headers_vertices.index("SIGMA_Y")
        if "SIGMA_Z" in headers_vertices:
            idx_sz = headers_vertices.index("SIGMA_Z")
        if "Z" in headers_vertices:
            idx_z = headers_vertices.index("Z")
        if "GEOMETRIA_WKT" in headers_vertices:
            idx_wkt = headers_vertices.index("GEOMETRIA_WKT")
            
    output = io.StringIO()
    output.write("PT;X(Este);Y(Norte);Z(Cota);SX;SY;SZ;Confrontante\n")
    
    if idx_codigo != -1:
        for row in vertices_reader:
            if len(row) > idx_codigo:
                pt = row[idx_codigo].strip()
                if not pt:
                    continue
                
                # Z Cota
                z = row[idx_z].strip() if idx_z != -1 and len(row) > idx_z else "0.0"
                z = z.replace('"', '').replace("'", "").strip()
                
                # Sigmas
                sx_str = row[idx_sx].strip() if idx_sx != -1 and len(row) > idx_sx else "0,0"
                sy_str = row[idx_sy].strip() if idx_sy != -1 and len(row) > idx_sy else "0,0"
                sz_str = row[idx_sz].strip() if idx_sz != -1 and len(row) > idx_sz else "0,0"
                
                sx = sx_str.replace('"', '').replace("'", "").replace(",", ".").strip()
                sy = sy_str.replace('"', '').replace("'", "").replace(",", ".").strip()
                sz = sz_str.replace('"', '').replace("'", "").replace(",", ".").strip()
                
                # UTM X e Y a partir de WKT
                wkt = row[idx_wkt].strip() if idx_wkt != -1 and len(row) > idx_wkt else ""
                x_utm = "0.000"
                y_utm = "0.000"
                
                if wkt:
                    m = wkt_point_re.search(wkt)
                    if m:
                        lon = float(m.group(1))
                        lat = float(m.group(2))
                        e_val, n_val = transformer_utm.transform(lon, lat)
                        x_utm = f"{e_val:.3f}"
                        y_utm = f"{n_val:.3f}"
                
                # Confrontante
                conf = confrontantes_map.get(pt.upper(), "[Sem Confrontante]")
                conf = conf.replace('"', '').replace("'", "").strip()
                
                output.write(f"{pt};{x_utm};{y_utm};{z};{sx};{sy};{sz};{conf}\n")
                
    return output.getvalue()

@app.post("/levantamentos/{lev_id}/unificar-sigef-confrontantes")
def unificar_sigef_confrontantes(
    lev_id: int, 
    file_vertices: UploadFile = File(...), 
    file_limites: UploadFile = File(...)
):
    """
    Recebe dois arquivos do SIGEF (um de vértices e outro de limites), cruza os dados
    pela chave do ponto, converte as coordenadas para UTM (EPSG:31982) e gera um arquivo
    consolidado no formato 1A.
    """
    verificar_levantamento_arquivado(lev_id)
    
    try:
        vertices_bytes = file_vertices.file.read()
        limites_bytes = file_limites.file.read()
        
        try:
            vertices_content = vertices_bytes.decode("utf-8")
        except UnicodeDecodeError:
            vertices_content = vertices_bytes.decode("latin-1")
            
        try:
            limites_content = limites_bytes.decode("utf-8")
        except UnicodeDecodeError:
            limites_content = limites_bytes.decode("latin-1")
            
        resultado_txt = processar_arquivos_sigef(vertices_content, limites_content)
        
        # Salva no workspace do levantamento
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(lev_id)
        wm.create_workspace(lev_id)
        
        pasta_proc = folder / "Processados"
        pasta_proc.mkdir(parents=True, exist_ok=True)
        
        nome_arquivo = "confrontante_consolidado_1A.txt"
        caminho_arquivo = pasta_proc / nome_arquivo
        
        with open(caminho_arquivo, "w", encoding="utf-8") as f:
            f.write(resultado_txt)
            
        return {
            "success": True,
            "message": "Arquivos unificados com sucesso no formato 1A!",
            "arquivo": nome_arquivo
        }
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao unificar arquivos SIGEF: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao unificar arquivos: {str(e)}"
        )

# --- NOVAS ROTAS DO MÓDULO 6: REGISTRO EM CARTÓRIO ---
from fastapi.responses import HTMLResponse
import math

@app.get("/levantamentos/{id}/documentos/gerar-requerimento", response_class=HTMLResponse)
def gerar_requerimento(id: int, matricula_id: int):
    """Gera um requerimento em HTML formatado para retificação de registro"""
    try:
        html = gerar_requerimento_html(id, matricula_id)
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/levantamentos/{id}/documentos/anuencias/{confrontante_id}/pdf", response_class=HTMLResponse)
def gerar_termo_anuencia(id: int, confrontante_id: int):
    """Gera Carta de Anuência preenchida com a ordenação perimetral dos segmentos lindeiros daquele confrontante"""
    try:
        html = gerar_termo_anuencia_html(id, confrontante_id)
        return HTMLResponse(content=html)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/levantamentos/{id}/documentos/anuencias/{confrontante_id}/upload")
async def upload_anuencia_assinada(id: int, confrontante_id: int, file: UploadFile = File(...)):
    """Recebe o termo assinado digitalizado e atualiza o status de anuência da confrontação"""
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(id)
        pasta_anuencias = folder / "Documentos" / "Anuancias"
        pasta_anuencias.mkdir(parents=True, exist_ok=True)
        
        caminho_salvo = pasta_anuencias / f"anuencia_{confrontante_id}_assinado.pdf"
        with open(caminho_salvo, "wb") as buffer:
            buffer.write(await file.read())
            
        # Atualiza o status
        exists = execute_query("SELECT id FROM anuencias_confrontantes WHERE levantamento_id = ? AND confrontante_id = ?", params=(id, confrontante_id), fetch_one=True)
        if exists:
            execute_query(
                "UPDATE anuencias_confrontantes SET status_anuencia = 'ASSINADO', caminho_documento_assinado = ? WHERE levantamento_id = ? AND confrontante_id = ?",
                params=(str(caminho_salvo), id, confrontante_id), commit=True
            )
        else:
            execute_query(
                "INSERT INTO anuencias_confrontantes (levantamento_id, confrontante_id, status_anuencia, caminho_documento_assinado) VALUES (?, ?, 'ASSINADO', ?)",
                params=(id, confrontante_id, str(caminho_salvo)), commit=True
            )
            
        return {"message": "Anuência assinada arquivada e registrada com sucesso.", "caminho_fisico": str(caminho_salvo)}
    except Exception as e:
        return {"error": str(e)}

@app.get("/levantamentos/{id}/documentos/status-cartorio")
def status_cartorio(id: int):
    """Consolida um relatório completo de pendências civis, de CRI e de confrontantes para dar entrada no cartório"""
    lev_row = execute_query(
        "SELECT l.*, p.nome_propriedade FROM levantamentos l JOIN propriedades p ON l.propriedade_id = p.id WHERE l.id = ?",
        params=(id,), fetch_one=True
    )
    if not lev_row: 
        raise HTTPException(status_code=404, detail="Levantamento não localizado.")
    lev = dict(lev_row)
    prop_id = lev["propriedade_id"]
    
    # Valida qualificação dos proprietários
    clientes_prop = execute_query(
        "SELECT c.* FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
        params=(prop_id,), fetch_all=True
    )
    clientes_qualificados = True
    proprietarios_pendencias = []
    for c in clientes_prop:
        civil = dict(c)
        if not civil.get("cpf_cnpj") or not civil.get("endereco_completo") or not civil.get("rg_ie"):
            clientes_qualificados = False
            proprietarios_pendencias.append(f"Proprietário {civil.get('nome_completo')} com qualificação civil incompleta.")
            
    # Valida metadados de matrículas
    matriculas_prop = execute_query("SELECT * FROM matriculas WHERE propriedade_id = ?", params=(prop_id,), fetch_all=True)
    matriculas_qualificadas = True
    matriculas_pendencias = []
    for m in matriculas_prop:
        mat = dict(m)
        if not mat.get("cri_comarca") or not mat.get("cri_circunscricao") or not mat.get("livro_registro") or not mat.get("folha_registro"):
            matriculas_qualificadas = False
            matriculas_pendencias.append(f"Matrícula {mat.get('numero_matricula')} sem metadados do CRI definidos.")
            
    # Valida anuências
    confrontantes = execute_query("SELECT * FROM confrontantes WHERE levantamento_id = ?", params=(id,), fetch_all=True)
    conf_total = len(confrontantes)
    
    anuencias_rows = execute_query("SELECT * FROM anuencias_confrontantes WHERE levantamento_id = ?", params=(id,), fetch_all=True)
    anuencias = {a["confrontante_id"]: dict(a) for a in anuencias_rows}
    
    conf_assinados = 0
    conf_pendentes_nomes = []
    
    for c in confrontantes:
        conf_id = c["id"]
        status_anu = anuencias.get(conf_id, {}).get("status_anuencia", "PENDENTE")
        if status_anu in ["ASSINADO", "DISPENSADO"]:
            conf_assinados += 1
        else:
            conf_pendentes_nomes.append(c["nome"])
            
    pronto = clientes_qualificados and matriculas_qualificadas and (conf_assinados == conf_total)
    
    pendencias = proprietarios_pendencias + matriculas_pendencias
    for nome in conf_pendentes_nomes:
        pendencias.append(f"Falta assinatura do Termo de Anuência de {nome}.")
        
    return {
        "levantamento_id": id,
        "propriedade": lev["nome_propriedade"],
        "proprietarios_qualificados": clientes_qualificados,
        "matriculas_qualificadas": matriculas_qualificadas,
        "confrontantes_totais": conf_total,
        "confrontantes_assinados": conf_assinados,
        "confrontantes_pendentes": conf_pendentes_nomes,
        "pronto_para_registro": pronto,
        "pendencias_cartorio": pendencias
    }


# --- NOVAS ROTAS DO MÓDULO 7: ARQUIVAMENTO SEGURO E TRANCA ---

@app.post("/levantamentos/{id}/arquivar")
def arquivar_levantamento(id: int):
    """Arquiva logicamente o levantamento (Tranca Read-Only), gera snapshot JSON e tranca a pasta no Windows"""
    lev_row = execute_query("SELECT id, status FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
    if not lev_row: 
        raise HTTPException(status_code=404, detail="Levantamento não localizado.")
    
    wm = WorkspaceManager()
    snap_path = wm.gerar_snapshot_arquivamento(id)
    
    # Atualiza banco de dados
    execute_query("UPDATE levantamentos SET status = 'ARQUIVADO' WHERE id = ?", params=(id,), commit=True)
    
    # Trava todos os arquivos físicos no Windows
    wm.travar_workspace_inteiro_readonly(id)
    
    return {
        "message": "Levantamento arquivado com sucesso. Tranca de Segurança Read-Only ativada em banco e em disco.",
        "snapshot_fechamento": snap_path
    }

class DesarquivarPayload(BaseModel):
    justificativa: str

@app.post("/levantamentos/{id}/desarquivar")
def desarquivar_levantamento(id: int, payload: DesarquivarPayload):
    """Desarquiva sob justificativa formal de auditoria, restabelecendo a escrita lindeira"""
    lev_row = execute_query("SELECT id, status FROM levantamentos WHERE id = ?", params=(id,), fetch_one=True)
    if not lev_row: 
        raise HTTPException(status_code=404, detail="Levantamento não localizado.")
    
    # Registra no log de auditoria
    execute_query(
        "INSERT INTO logs_auditoria_seguranca (levantamento_id, rota, metodo, usuario) VALUES (?, ?, ?, ?)",
        params=(id, f"/desarquivar - Justificativa: {payload.justificativa}", "POST", "Operador_Administrador"),
        commit=True
    )
    
    # Atualiza banco de dados
    execute_query("UPDATE levantamentos SET status = 'EM_ANDAMENTO' WHERE id = ?", params=(id,), commit=True)
    
    # Destrava os arquivos físicos no Windows
    wm = WorkspaceManager()
    wm.destravar_workspace_inteiro(id)
    
    return {"message": "Levantamento desarquivado com sucesso. Permissão de escrita restabelecida."}


# --- ROTA DE AUDITORIA TOPOLÓGICA DE MATRÍCULAS ---

@app.get("/matriculas/{mid}/auditoria")
def auditar_perimetro_matricula(mid: int):
    """Efetua a auditoria topológica completa de caminhamento e área real da matrícula rústica"""
    mat_row = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
    if not mat_row: 
        raise HTTPException(status_code=404, detail="Matrícula não cadastrada.")
    mat = dict(mat_row)
    
    pontos_rows = execute_query(
        "SELECT id, nome_vertice, lat, lon, alt, ordem_caminhamento FROM pontos WHERE matricula_id = ? ORDER BY ordem_caminhamento ASC, id ASC",
        params=(mid,), fetch_all=True
    )
    if not pontos_rows:
        return {"sucesso": False, "erro": "Nenhum ponto geodésico cadastrado para esta matrícula."}
        
    pontos = [dict(p) for p in pontos_rows]
    
    res_auditoria = SigefValidator.auditar_poligonal_matricula(pontos, area_declarada_ha=mat.get("area_ha") or 0.0)
    return res_auditoria


class PontoUpdate(BaseModel):
    nome_vertice: str = None
    tipo_ponto: str = None
    metodo_posicionamento: str = None
    matricula_id: int = None
    ponto_base_id: int = None
    lat: float = None
    lon: float = None
    alt: float = None
    sigma_lat: float = None
    sigma_lon: float = None
    sigma_alt: float = None
    status_ponto: str = None
    ignorar_poligono: int = None
    n_corrigido: float = None
    e_corrigido: float = None
    alt_corrigido: float = None
    fuso: str = None

@app.put("/pontos/{pid}")
def update_ponto(pid: int, payload: PontoUpdate):
    try:
        row = execute_query("SELECT levantamento_id FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Ponto não encontrado.")
            
        verificar_levantamento_arquivado(row["levantamento_id"])
        
        res = atualizar_ponto_geodesico(pid, payload.dict())
        if "error" in res:
            status = res.get("status_code", 400)
            raise HTTPException(status_code=status, detail=res["error"])
            
        # Sanitiza reativamente após a atualização manual de tipo de ponto ou matrícula
        sanitizar_ordens_duplicadas(row["levantamento_id"])
        
        return res
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao atualizar ponto: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/levantamentos/{id}/historico-campo")
def obter_historico_campo(id: int):
    """Retorna o histórico cronológico de logs de auditoria e alterações de campo do levantamento"""
    try:
        rows = execute_query(
            "SELECT id, levantamento_id, timestamp, tipo_evento, descricao, dados_detalhados FROM historico_alteracoes_campo WHERE levantamento_id = ? ORDER BY timestamp DESC, id DESC",
            params=(id,),
            fetch_all=True
        )
        logs = []
        for r in rows:
            import json
            log_item = dict(r)
            try:
                log_item["dados_detalhados"] = json.loads(log_item["dados_detalhados"]) if log_item["dados_detalhados"] else {}
            except Exception:
                pass
            logs.append(log_item)
        return logs
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- ENDPOINTS DE EXPORTAÇÃO E GEOMETRIAS DE SHAPEFILE (MÓDULO 5 - V.L.A.E.G.) ---

@app.get("/levantamentos/{id}/matriculas/{matricula_id}/exportar-shapefile")
def exportar_shapefile_endpoint(id: int, matricula_id: int):
    """Gera e retorna o Shapefile regulamentar (.ZIP) com as duas camadas perimetrais em UTM Zona 22S"""
    try:
        from business.shape_exporter import ShapefileExporter
        from fastapi import Response
        
        zip_bytes = ShapefileExporter.exportar_matricula_zip(id, matricula_id)
        
        headers = {
            "Content-Disposition": f'attachment; filename="matricula_{matricula_id}_shapefile.zip"'
        }
        return Response(content=zip_bytes, media_type="application/zip", headers=headers)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao exportar Shapefile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao gerar o Shapefile: {str(e)}")

@app.get("/dashboard/matriculas-geometrias")
def get_dashboard_matriculas_geometrias():
    """Retorna os polígonos perimetrais ordenados das matrículas para renderização dinâmica no mapa Leaflet"""
    try:
        # Busca todas as matrículas ativas
        query_mats = """
            SELECT m.id, m.numero_matricula, m.area_ha, m.propriedade_id,
                   p.nome_propriedade, p.municipio, p.uf,
                   l.id as levantamento_id
            FROM matriculas m
            JOIN propriedades p ON m.propriedade_id = p.id
            JOIN levantamentos l ON l.propriedade_id = p.id
            WHERE l.status != 'ARQUIVADO'
        """
        rows_mats = execute_query(query_mats, fetch_all=True)
        
        result = []
        for row in rows_mats:
            mat = dict(row)
            # Busca os pontos perimetrais ordenados da matrícula
            query_pts = """
                SELECT lat, lon, lat_corrigido, lon_corrigido, nome_vertice
                FROM pontos
                WHERE levantamento_id = ? AND matricula_id = ? AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
                ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
            """
            rows_pts = execute_query(query_pts, params=(mat["levantamento_id"], mat["id"]), fetch_all=True)
            
            coords = []
            for r in rows_pts:
                pt = dict(r)
                lat = pt["lat_corrigido"] if pt["lat_corrigido"] is not None else pt["lat"]
                lon = pt["lon_corrigido"] if pt["lon_corrigido"] is not None else pt["lon"]
                if lat and lon:
                    coords.append({"lat": lat, "lon": lon, "nome": pt["nome_vertice"]})
            
            # Uma matrícula só é elegível se possuir uma poligonal fechável (pelo menos 3 pontos com coordenadas válidas)
            if len(coords) >= 3:
                mat["coordenadas"] = coords
                result.append(mat)
                
        return result
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar geometrias para o dashboard: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

def sou_administrador():

    import ctypes
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

if __name__ == "__main__":
    import sys
    import ctypes
    
    if sou_administrador():
        try:
            print("Iniciando Uvicorn (Modo Administrador)...")
            uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)
        except Exception as e:
            print(f"Erro ao iniciar o servidor: {e}")
    else:
        print("Solicitando privilégios de Administrador para a API...")
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)
