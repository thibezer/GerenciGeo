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

app = FastAPI(title="GerenciGeo API")

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

@app.get("/levantamentos")
def get_levantamentos():
    try:
        query = """
            SELECT l.*, 
                   (SELECT COUNT(*) FROM pontos p WHERE p.levantamento_id = l.id) as total_pontos,
                   (SELECT COUNT(*) FROM segmentos s WHERE s.levantamento_id = l.id) as total_segmentos
            FROM levantamentos l
        """
        return [dict(r) for r in execute_query(query, fetch_all=True)]
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
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro na importação de caderneta TXT: {e}")
        return {"error": f"Falha no processamento: {str(e)}"}

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
