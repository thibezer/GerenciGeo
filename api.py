import os
import logging
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Request, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List
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
    metadados: dict = {}

@app.post("/clientes")
def create_cliente(cli: ClienteCreate):
    import re
    # Sanitização de CPF/CNPJ
    cli.cpf_cnpj = re.sub(r'\D', '', cli.cpf_cnpj) if cli.cpf_cnpj else ""
    if cli.cpf_conjuge:
        cli.cpf_conjuge = re.sub(r'\D', '', cli.cpf_conjuge)

    if not validar_cpf_cnpj(cli.cpf_cnpj):
        return {"error": "CPF/CNPJ inválido"}
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM clientes WHERE cpf_cnpj = ?", (cli.cpf_cnpj,))
            if cursor.fetchone():
                return {"error": "CPF/CNPJ já cadastrado"}
            
            cursor.execute("""
                INSERT INTO clientes (nome_completo, cpf_cnpj, rg_ie, data_nascimento_fundacao, estado_civil, profissao, nacionalidade, nome_conjuge, cpf_conjuge, rg_conjuge, regime_bens, email, telefone, endereco_completo, cidade, estado, cep)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (cli.nome_completo, cli.cpf_cnpj, cli.rg_ie, cli.data_nascimento_fundacao, cli.estado_civil, cli.profissao, cli.nacionalidade, cli.nome_conjuge, cli.cpf_conjuge, cli.rg_conjuge, cli.regime_bens, cli.email, cli.telefone, cli.endereco_completo, cli.cidade, cli.estado, cli.cep))
            cliente_id = cursor.lastrowid
            
            if cli.metadados:
                for k, v in cli.metadados.items():
                    cursor.execute("INSERT INTO cliente_metadados (id_cliente, chave, valor) VALUES (?, ?, ?)", (cliente_id, k, v))
            conn.commit()
            
        mgr = ClienteManager()
        mgr.verificar_dados_conjuge(cliente_id)
        
        return {"id": cliente_id, "message": "Cliente cadastrado"}
    except Exception as e:
        return {"error": str(e)}

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
    import re
    # Sanitização de CPF/CNPJ
    cli.cpf_cnpj = re.sub(r'\D', '', cli.cpf_cnpj) if cli.cpf_cnpj else ""
    if cli.cpf_conjuge:
        cli.cpf_conjuge = re.sub(r'\D', '', cli.cpf_conjuge)

    if not validar_cpf_cnpj(cli.cpf_cnpj):
        return {"error": "CPF/CNPJ inválido"}
        
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            # Pega dados antigos para histórico
            cursor.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,))
            row = cursor.fetchone()
            if not row:
                return {"error": "Cliente não encontrado."}
            old_data = dict(row)
            
            # Valida se o CPF já pertence a outro cliente
            cursor.execute("SELECT id FROM clientes WHERE cpf_cnpj = ? AND id != ?", (cli.cpf_cnpj, cliente_id))
            if cursor.fetchone():
                return {"error": "CPF/CNPJ já cadastrado para outro cliente"}
            
            cursor.execute("""
                UPDATE clientes 
                SET nome_completo=?, cpf_cnpj=?, rg_ie=?, data_nascimento_fundacao=?, estado_civil=?, profissao=?, nacionalidade=?, 
                    nome_conjuge=?, cpf_conjuge=?, rg_conjuge=?, regime_bens=?, email=?, telefone=?, endereco_completo=?, 
                    cidade=?, estado=?, cep=?
                WHERE id=?
            """, (cli.nome_completo, cli.cpf_cnpj, cli.rg_ie, cli.data_nascimento_fundacao, cli.estado_civil, cli.profissao, cli.nacionalidade, 
                  cli.nome_conjuge, cli.cpf_conjuge, cli.rg_conjuge, cli.regime_bens, cli.email, cli.telefone, cli.endereco_completo, 
                  cli.cidade, cli.estado, cli.cep, cliente_id))
            
            # Atualiza metadados (limpa e insere novos)
            cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cliente_id,))
            if cli.metadados:
                for k, v in cli.metadados.items():
                    cursor.execute("INSERT INTO cliente_metadados (id_cliente, chave, valor) VALUES (?, ?, ?)", (cliente_id, k, v))
            
            conn.commit()
            
        # AUDITORIA COMPLETA: Itera sobre todos os campos para registrar mudanças
        mgr = ClienteManager()
        new_data = cli.dict()
        for campo, valor_novo in new_data.items():
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
            wm.gerar_documento_cliente_workspace(lev['id'])
        
        mgr.verificar_dados_conjuge(cliente_id)
            
        return {"message": "Cliente atualizado e sincronizado com sucesso"}
    except Exception as e:
        return {"error": str(e)}

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
    try:
        # Validação estrita de 100% de participação
        # 1. Pega a soma das participações dos OUTROS clientes vinculados
        soma_outros_row = execute_query(
            "SELECT SUM(percentual_participacao) as soma FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id != ?",
            params=(prop_id, pc.cliente_id),
            fetch_one=True
        )
        soma_outros = float(soma_outros_row['soma']) if (soma_outros_row and soma_outros_row['soma'] is not None) else 0.0
        
        if soma_outros + pc.percentual_participacao > 100.0:
            restante = max(0.0, 100.0 - soma_outros)
            return {"error": f"Participação inválida. A soma das participações não pode exceder 100%. Restante disponível: {restante:.2f}%"}

        # 2. Verifica se o vínculo já existe para atualizar ou se deve criar
        exists = execute_query(
            "SELECT id FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?",
            params=(prop_id, pc.cliente_id),
            fetch_one=True
        )
        if exists:
            execute_query(
                "UPDATE propriedade_clientes SET percentual_participacao = ? WHERE propriedade_id = ? AND cliente_id = ?",
                params=(pc.percentual_participacao, prop_id, pc.cliente_id),
                commit=True
            )
            return {"message": "Participação do proprietário atualizada com sucesso"}
        else:
            execute_query(
                "INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, ?)",
                params=(prop_id, pc.cliente_id, pc.percentual_participacao),
                commit=True
            )
            return {"message": "Proprietário vinculado com sucesso"}
    except Exception as e:
        return {"error": str(e)}

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

class MatriculaCreate(BaseModel):
    numero_matricula: str
    ccir: str = None
    itr: str = None
    area_ha: float = 0.0

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
async def upload_arquivo_categoria(lev_id: int, categoria: str = Form(...), file: UploadFile = File(...)):
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
                
        # Sincroniza
        wm.gerar_documento_cliente_workspace(lev_id)
        
        return {"success": True, "message": f"Arquivo '{file.filename}' carregado com sucesso na pasta '{categoria}'."}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

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
        
        query = "INSERT INTO matriculas (propriedade_id, numero_matricula, ccir, itr, area_ha) VALUES (?, ?, ?, ?, ?)"
        execute_query(query, params=(propriedade_id, m.numero_matricula, m.ccir, m.itr, m.area_ha), commit=True)
        
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
            SET numero_matricula = ?, ccir = ?, itr = ?, area_ha = ?
            WHERE id = ?
        """
        execute_query(query, params=(m.numero_matricula, m.ccir, m.itr, m.area_ha, mid), commit=True)
        
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

# --- ROTAS DE PONTOS ---
@app.get("/levantamentos/{id}/pontos")
def get_pontos(id: int):
    try:
        query = """
            SELECT p.*, m.numero_matricula 
            FROM pontos p
            JOIN matriculas m ON p.matricula_id = m.id
            WHERE p.levantamento_id = ?
            ORDER BY p.ordem_caminhamento ASC, p.id ASC
        """
        return [dict(r) for r in execute_query(query, params=(id,), fetch_all=True)]
    except Exception as e:
        return {"error": str(e)}

@app.post("/levantamentos/{id}/pontos")
def create_ponto(id: int, p: PontoCreate):
    verificar_levantamento_arquivado(id)
    try:
        query = """
            INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        execute_query(query, params=(
            id, p.matricula_id, p.nome_vertice, p.tipo_ponto, p.lat, p.lon, p.alt, 
            p.sigma_lat, p.sigma_lon, p.sigma_alt, p.ordem_caminhamento
        ), commit=True)
        return {"message": "Ponto cadastrado com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

@app.delete("/pontos/{pid}")
def delete_ponto(pid: int):
    try:
        row = execute_query("SELECT levantamento_id FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if row:
            verificar_levantamento_arquivado(row["levantamento_id"])
            
        execute_query("DELETE FROM pontos WHERE id = ?", params=(pid,), commit=True)
        return {"message": "Ponto removido com sucesso"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        return {"error": str(e)}

# --- IMPORTAÇÃO DE CADERNETAS .TXT (MÓDULO 4 - MANIFESTO) ---
@app.post("/levantamentos/{id}/importar-txt")
async def importar_caderneta_txt(id: int, matricula_id: int = Form(...), file: UploadFile = File(...)):
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
        parser = TxtGeodesicParser(id, matricula_id)
        pontos_processados = parser.processar_arquivo(str(caminho_salvo))
        
        if not pontos_processados:
            return {"error": "Nenhum vértice válido encontrado ou processado no arquivo."}
            
        ids_pontos = parser.persistir_no_banco(pontos_processados)
        
        # 3. AUTOMAÇÃO PERIMETRAL: Geração automática de segmentos sequenciais delegada ao método de domínio
        total_segmentos = parser.gerar_topologia_perimetral(ids_pontos, pontos_processados)
        
        # Sincroniza metadados no DADOS_GERAIS.json de forma reativa
        wm.gerar_documento_cliente_workspace(id)
        
        primeiro_pt = pontos_processados[0]
        return {
            "message": f"Sucesso: {len(ids_pontos)} pontos importados e {total_segmentos} segmentos perimetrais gerados automaticamente.",
            "pontos_importados": len(ids_pontos),
            "layout_detectado": "RTK" if primeiro_pt["sigma_lat"] > 0.0 else "Topcon Estático"
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
        return {"success": True, "message": f"Arquivo '{nome}' excluído com sucesso do repositório físico."}
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
    arquivos_rinex = [os.path.join(pasta_destino, f) for f in os.listdir(pasta_destino) if f.lower().endswith((".o", ".21o", ".22o", ".23o", ".24o"))]
    if arquivos_rinex:
        log_q = LogQueue()
        manager = LotePPPManager(use_api=True, log_callback=lambda m: log_q.put({"mensagem": m}))
        out_pasta_ppp = os.path.join(EXPORT_BASE_FOLDER, "Processados_PPP")
        os.makedirs(out_pasta_ppp, exist_ok=True)
        manager.processar_lote(arquivos_rinex, out_pasta_ppp)
    
    add_log("Processo PPP Finalizado!")

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
                match = re.search(r"(\w+)\s*=\s*'(.*)'", line)
                if match:
                    key, value = match.groups()
                    current_feature[key] = value
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
            
# --- NOVAS ROTAS DO MÓDULO 6: REGISTRO EM CARTÓRIO ---
from fastapi.responses import HTMLResponse
import math

@app.get("/levantamentos/{id}/documentos/gerar-requerimento", response_class=HTMLResponse)
def gerar_requerimento(id: int, matricula_id: int):
    """Gera um requerimento em HTML formatado para impressão (CSS Print) endereçado ao CRI local"""
    lev_row = execute_query(
        "SELECT l.*, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
        params=(id,), fetch_one=True
    )
    if not lev_row: 
        raise HTTPException(status_code=404, detail="Levantamento não localizado.")
    lev_data = dict(lev_row)
    
    prop_row = execute_query("SELECT * FROM propriedades WHERE id = ?", params=(lev_data["propriedade_id"],), fetch_one=True)
    prop_data = dict(prop_row) if prop_row else {}
    
    mat_row = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(matricula_id,), fetch_one=True)
    if not mat_row: 
        raise HTTPException(status_code=404, detail="Matrícula não localizada.")
    mat_data = dict(mat_row)
    
    cli_rows = execute_query(
        "SELECT c.*, pc.percentual_participacao FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
        params=(lev_data["propriedade_id"],), fetch_all=True
    )
    clientes = [dict(c) for c in cli_rows]
    
    cli_html = ""
    for c in clientes:
        civil_info = f", {c['estado_civil']}" if c['estado_civil'] else ""
        prof_info = f", {c['profissao']}" if c['profissao'] else ""
        conj_info = ""
        if c['estado_civil'] and c['estado_civil'].upper() == "CASADO":
            conj_info = f" casado sob o regime de {c['regime_bens']} com {c['nome_conjuge']}, portador(a) do CPF nº {c['cpf_conjuge']} e RG nº {c['rg_conjuge']}"
        
        cli_html += f"<p><b>{c['nome_completo']}</b>, nacionalidade {c['nacionalidade']}{civil_info}{prof_info}{conj_info}, portador(a) do CPF/CNPJ nº {c['cpf_cnpj']} e RG nº {c['rg_ie']}, residente e domiciliado(a) em {c['endereco_completo']}, {c['cidade']}-{c['estado']}.</p>"

    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Requerimento de Retificação de Área - {prop_data.get('nome_propriedade', 'Imóvel')}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap');
            body {{ font-family: 'Manrope', Arial, sans-serif; color: #2d3748; line-height: 1.6; padding: 40px; background-color: #fff; }}
            .page {{ max-width: 800px; margin: 0 auto; }}
            .header {{ text-align: center; margin-bottom: 40px; border-bottom: 2px solid #00f5a0; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 700; color: #0c1510; text-transform: uppercase; letter-spacing: 2px; }}
            .logo span {{ color: #00f5a0; }}
            .document-title {{ font-size: 18px; font-weight: 700; text-transform: uppercase; margin-top: 15px; color: #1a202c; }}
            .address {{ font-weight: 700; margin-top: 30px; margin-bottom: 30px; }}
            .content {{ text-align: justify; font-size: 15px; }}
            .footer-signature {{ margin-top: 60px; page-break-inside: avoid; }}
            .sig-line {{ width: 320px; border-top: 1px solid #4a5568; margin: 50px auto 10px auto; text-align: center; }}
            .sig-title {{ text-align: center; font-size: 13px; color: #718096; font-weight: 600; }}
            .btn-print {{ background-color: #00f5a0; color: #0c1510; padding: 10px 20px; font-weight: 700; border-radius: 4px; border: none; cursor: pointer; font-family: inherit; transition: opacity 0.2s; }}
            .btn-print:hover {{ opacity: 0.8; }}
            @media print {{ body {{ padding: 0; }} .no-print {{ display: none; }} }}
        </style>
    </head>
    <body>
        <div class="page">
            <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
            </div>
            <div class="header">
                <div class="logo">Gerenci<span>Geo</span></div>
                <div class="document-title">Requerimento de Retificação de Registro de Imóvel Rural</div>
            </div>
            <div class="address">
                AO ILUSTRÍSSIMO OFICIAL DO CARTÓRIO DE REGISTRO DE IMÓVEIS DE {str(mat_data.get('cri_comarca') or prop_data.get('municipio', '')).upper()} - UF: {prop_data.get('uf', '').upper()}
            </div>
            <div class="content">
                <p>Senhor Oficial,</p>
                {cli_html}
                <p>Proprietários do imóvel rural denominado <b>{prop_data.get('nome_propriedade')}</b>, localizado no município de {prop_data.get('municipio')}-{prop_data.get('uf')}, com área registrada de <b>{mat_data.get('area_ha')} ha</b>, sob a Matrícula nº <b>{mat_data.get('numero_matricula')}</b> do {mat_data.get('cri_circunscricao') or 'CRI local'}, registrada no {mat_data.get('livro_registro') or 'Livro 2-RG'}, {mat_data.get('folha_registro') or 'Folha correspondente'}, vêm respeitosamente requerer a Vossa Senhoria, com fundamento no Artigo 213, Inciso II da Lei Federal nº 6.015 de 31 de dezembro de 1973 (Lei dos Registros Públicos), com as alterações introduzidas pela Lei nº 10.267 de 28 de agosto de 2001, a <b>RETIFICAÇÃO DE REGISTRO</b> de seu imóvel rural.</p>
                
                <p>O presente pedido justifica-se por haver divergência nas dimensões perimetrais e na área do imóvel, estando a realidade de divisa consolidada de campo descrita nos trabalhos técnicos de georreferenciamento elaborados pelo Engenheiro/Responsável Técnico <b>{lev_data.get('nome_profissional')}</b>, credenciado perante o INCRA sob o código <b>{lev_data.get('codigo_credenciado')}</b>, conforme planta, memorial descritivo e anexo de confrontações anexados à presente.</p>
                
                <p>Os confrontantes anuíram expressamente aos limites e divisas retificados, tendo assinado individualmente as respectivas cartas de anuência anexadas, com firmas reconhecidas em cartório.</p>
                
                <p>Nestes termos, pede e espera deferimento.</p>
                
                <p style="margin-top: 40px; text-align: right;">{prop_data.get('municipio')}-{prop_data.get('uf')}, _____ de ____________________ de 20___.</p>
            </div>
            
            <div class="footer-signature">
                <div class="sig-line"></div>
                <div class="sig-title">Requerente Proprietário</div>
            </div>
        </div>
    </body>
    </html>
    """
    return html_content

@app.get("/levantamentos/{id}/documentos/anuencias/{confrontante_id}/pdf", response_class=HTMLResponse)
def gerar_termo_anuencia(id: int, confrontante_id: int):
    """Gera Carta de Anuência preenchida com a ordenação perimetral dos segmentos lindeiros daquele confrontante"""
    conf_row = execute_query("SELECT * FROM confrontantes WHERE id = ?", params=(confrontante_id,), fetch_one=True)
    if not conf_row: 
        raise HTTPException(status_code=404, detail="Confrontante não localizado.")
    conf = dict(conf_row)
    
    lev_row = execute_query(
        "SELECT l.*, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
        params=(id,), fetch_one=True
    )
    if not lev_row: 
        raise HTTPException(status_code=404, detail="Levantamento não localizado.")
    lev_data = dict(lev_row)
    
    prop_row = execute_query("SELECT * FROM propriedades WHERE id = ?", params=(lev_data["propriedade_id"],), fetch_one=True)
    prop_data = dict(prop_row) if prop_row else {}
    
    cli_rows = execute_query(
        "SELECT c.* FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
        params=(lev_data["propriedade_id"],), fetch_all=True
    )
    clientes = [dict(c) for c in cli_rows]
    
    # Busca segmentos lindeiros
    seg_rows = execute_query(
        """
        SELECT s.*, p_ini.nome_vertice as nome_p_ini, p_ini.lat as lat_ini, p_ini.lon as lon_ini,
                    p_fim.nome_vertice as nome_p_fim, p_fim.lat as lat_fim, p_fim.lon as lon_fim
        FROM segmentos s
        JOIN pontos p_ini ON s.ponto_inicio_id = p_ini.id
        JOIN pontos p_fim ON s.ponto_fim_id = p_fim.id
        WHERE s.levantamento_id = ? AND s.confrontante_id = ?
        """,
        params=(id, confrontante_id), fetch_all=True
    )
    
    if not seg_rows:
        raise HTTPException(status_code=404, detail="Nenhum segmento de divisa associado a este confrontante para este levantamento.")
        
    segmentos = [dict(s) for s in seg_rows]
    
    divisas_html = ""
    total_dist = 0.0
    
    lon0 = segmentos[0]["lon_ini"]
    zona_utm = int((lon0 + 180) / 6) + 1
    
    from pyproj import Transformer
    transformer = Transformer.from_crs("epsg:4674", f"epsg:319{zona_utm}", always_xy=True)
    
    for s in segmentos:
        e_ini, n_ini = transformer.transform(s["lon_ini"], s["lat_ini"])
        e_fim, n_fim = transformer.transform(s["lon_fim"], s["lat_fim"])
        
        de = e_fim - e_ini
        dn = n_fim - n_ini
        dist = math.sqrt(de**2 + dn**2)
        total_dist += dist
        
        az = math.degrees(math.atan2(de, dn)) % 360.0
        
        graus = int(az)
        minutos_dec = (az - graus) * 60.0
        minutos = int(minutos_dec)
        segundos = (minutos_dec - minutos) * 60.0
        az_format = f"{graus}° {minutos:02d}' {segundos:04.1f}\""
        
        divisas_html += f"<tr><td>{s['nome_p_ini']}</td><td>{s['nome_p_fim']}</td><td>{az_format}</td><td>{dist:.2f} m</td><td>{s['tipo_limite_sigef']}</td><td>{s['metodo_posicionamento_sigef']}</td></tr>"
    
    proprietarios_nomes = ", ".join([c["nome_completo"] for c in clientes])
    
    conj_info = ""
    if conf.get("estado_civil") and conf.get("estado_civil").upper() == "CASADO":
        conj_info = f" e seu cônjuge <b>{conf.get('nome_conjuge')}</b>, nacionalidade {conf.get('nacionalidade') or 'brasileiro(a)'}, portador(a) do CPF nº {conf.get('cpf_conjuge')} e RG nº {conf.get('rg_conjuge')},"
        
    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Termo de Anuência de Confrontante - {conf['nome']}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap');
            body {{ font-family: 'Manrope', Arial, sans-serif; color: #2d3748; line-height: 1.6; padding: 40px; }}
            .page {{ max-width: 800px; margin: 0 auto; }}
            .header {{ text-align: center; margin-bottom: 40px; border-bottom: 2px solid #00f5a0; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 700; color: #0c1510; text-transform: uppercase; }}
            .logo span {{ color: #00f5a0; }}
            .document-title {{ font-size: 18px; font-weight: 700; text-transform: uppercase; margin-top: 15px; color: #1a202c; }}
            .content {{ text-align: justify; font-size: 14px; margin-bottom: 30px; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; font-size: 13px; }}
            th, td {{ border: 1px solid #cbd5e0; padding: 10px; text-align: center; }}
            th {{ background-color: #f7fafc; font-weight: 700; }}
            .signatures {{ display: flex; justify-content: space-between; margin-top: 60px; page-break-inside: avoid; }}
            .sig-block {{ width: 45%; text-align: center; }}
            .sig-line {{ border-top: 1px solid #4a5568; margin-top: 40px; margin-bottom: 10px; }}
            .sig-title {{ font-size: 12px; color: #718096; font-weight: 600; }}
            .btn-print {{ background-color: #00f5a0; color: #0c1510; padding: 10px 20px; font-weight: 700; border-radius: 4px; border: none; cursor: pointer; font-family: inherit; }}
            @media print {{ body {{ padding: 0; }} .no-print {{ display: none; }} }}
        </style>
    </head>
    <body>
        <div class="page">
            <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
            </div>
            <div class="header">
                <div class="logo">Gerenci<span>Geo</span></div>
                <div class="document-title">Carta de Anuência de Limites de Confrontação</div>
            </div>
            <div class="content">
                <p>Pelo presente instrumento particular de anuência e reconhecimento de divisas, eu <b>{conf['nome']}</b>, nacionalidade {conf.get('nacionalidade') or 'brasileiro(a)'}, {conf.get('estado_civil') or 'estado civil não informado'}, {conf.get('profissao') or 'profissão não informada'}, portador(a) do CPF nº {conf.get('cpf_cnpj')} e RG nº {conf.get('rg') or 'não informado'}, residente e domiciliado(a) em {conf.get('endereco_completo') or 'endereço não informado'}{conj_info} na qualidade de confrontante e proprietário legal de área lindeira à propriedade denominada <b>{prop_data.get('nome_propriedade')}</b>, declaro expressamente e sob responsabilidade jurídica:</p>
                
                <p>1. Que **ANUO E CONCORDOS** de forma irrestrita com as novas divisas, marcos e coordenadas levantadas e descritas no perímetro da propriedade de <b>{proprietarios_nomes}</b>, referente ao perímetro delimitado pelos segmentos de divisa listados na tabela abaixo, cujo trabalho de demarcação de campo foi executado em conformidade com as normas do INCRA/SIGEF.</p>
                
                <table>
                    <thead>
                        <tr>
                            <th>De Vértice</th>
                            <th>Para Vértice</th>
                            <th>Azimute</th>
                            <th>Distância</th>
                            <th>Tipo Limite</th>
                            <th>Método Pos.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {divisas_html}
                    </tbody>
                </table>
                
                <p>2. A soma linear de confrontação corresponde a uma extensão perimetral total de <b>{total_dist:.2f} metros</b> de divisa retificada.</p>
                <p>3. Reconheço e atesto que as cercas ou marcos instalados neste trecho representam fielmente os limites históricos consolidados da posse e propriedade, não havendo invasões, sobreposições ou litígios de divisa de qualquer natureza.</p>
                
                <p style="margin-top: 40px; text-align: right;">{prop_data.get('municipio')}-{prop_data.get('uf')}, _____ de ____________________ de 20___.</p>
            </div>
            
            <div class="signatures">
                <div class="sig-block">
                    <div class="sig-line"></div>
                    <div class="sig-title">Confrontante Proprietário</div>
                    <div class="sig-title">{conf['nome']}</div>
                </div>
                {"<div class='sig-block'><div class='sig-line'></div><div class='sig-title'>Cônjuge do Confrontante</div><div class='sig-title'>" + conf.get('nome_conjuge', '') + "</div></div>" if conj_info else ""}
            </div>
        </div>
    </body>
    </html>
    """
    return html_content

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
