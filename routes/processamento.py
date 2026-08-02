"""
routes/processamento.py — Processamento GNSS, conversão Rinex e integração SIGEF
"""
import os
import csv
import io
import re
import stat
import shutil
import logging
import threading
import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, Depends
from utils.transformer_cache import get_transformer
import requests

from config import EXPORT_BASE_FOLDER
from database.connection import execute_query
from database.repository import HistoricoRinexRepo
from services.gestores.workspace_manager import WorkspaceManager
from services.processamento.triagem_inteligente import organizar_rastreios, ler_metadados_rinex
from routes.deps import verificar_levantamento_arquivado, verificar_ambiente_local
from routes.dashboard import add_log

router = APIRouter(tags=["Processamento GNSS & SIGEF"])

# Lock global para execução do HGO
hgo_global_execution_lock = threading.Lock()

class LogQueue:
    def put(self, msg):
        if isinstance(msg, dict) and "mensagem" in msg:
            add_log(msg["mensagem"])

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
                
                from services.processamento.gnss_worker import GNSSPipelineWorker
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

# ── Rotas ──────────────────────────────────────────────────────────────────────

@router.post("/upload", dependencies=[Depends(verificar_ambiente_local)])
async def upload_files(files: List[UploadFile] = File(...)):
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pick-folder")
def pick_folder():
    try:
        import webview
        if hasattr(webview, 'windows') and webview.windows:
            window = webview.windows[0]
            result = window.create_file_dialog(webview.FOLDER_DIALOG)
            if result:
                folder_path = result[0] if isinstance(result, (tuple, list)) else result
                return {"path": folder_path}
            return {"path": ""}
    except Exception as e:
        pass

    try:
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
    except Exception:
        pass
    return {"path": ""}

def run_hgo_task(pasta: str):
    from services.processamento.gnss_worker import GNSSPipelineWorker
    from services.processamento.triagem_inteligente import organizar_rastreios
    
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

    # Limpeza Automática de Temporários do Workspace (Item 14)
    try:
        if os.path.exists(pasta_dest_rinex):
            shutil.rmtree(pasta_dest_rinex)
            add_log("[LIMPEZA] Pasta de arquivos temporários 'Rinex_Temporario' purgada do Workspace com sucesso para liberar espaço físico.")
    except Exception as e_clean:
        add_log(f"[LIMPEZA] AVISO: Falha ao remover pasta de temporários 'Rinex_Temporario': {e_clean}")

    add_log("Triagem de Rastreios Finalizada! Verifique a pasta raiz.")

@router.post("/process/hgo", dependencies=[Depends(verificar_ambiente_local)])
async def start_hgo(payload: dict, background_tasks: BackgroundTasks):
    try:
        pasta = payload.get("pasta")
        if pasta:
            background_tasks.add_task(run_hgo_task, pasta)
            return {"message": "Triagem iniciada em segundo plano"}
        raise HTTPException(status_code=400, detail="Pasta não fornecida")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/proxy/sigef")
async def proxy_sigef(url: str):
    try:
        # Forçamos o formato para text/plain pois o i3Geo do INCRA falha com application/json
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
        logging.getLogger(__name__).error(f"Erro na requisição proxy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/levantamentos/{lev_id}/importar-confrontante-sigef", dependencies=[Depends(verificar_ambiente_local)])
def importar_confrontante_sigef(lev_id: int, codigo_parcela: str):
    """
    Baixa os arquivos CSV de limites e vértices do SIGEF/INCRA de uma parcela confrontante
    e os salva na pasta de Documentos do levantamento atual.
    """
    verificar_levantamento_arquivado(lev_id)
    
    if not codigo_parcela or not re.match(r"^[a-zA-Z0-9\-]+$", codigo_parcela):
        raise HTTPException(status_code=400, detail="Código de parcela inválido.")
        
    url_vertices = f"https://sigef.incra.gov.br/geo/exportar/vertice/csv/{codigo_parcela}"
    url_limites = f"https://sigef.incra.gov.br/geo/exportar/limite/csv/{codigo_parcela}"
    
    try:
        import time
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
        
        # 1. Faz uma requisição inicial para a home do SIGEF para coletar cookies
        try:
            session.get("https://sigef.incra.gov.br/", headers=headers_home, timeout=10)
        except Exception:
            pass
            
        time.sleep(2.5)
            
        # 2. Visita a página de detalhes
        headers_detalhe = headers_home.copy()
        headers_detalhe["Referer"] = "https://sigef.incra.gov.br/"
        headers_detalhe["Sec-Fetch-Site"] = "same-origin"
        
        try:
            url_detalhe = f"https://sigef.incra.gov.br/geo/parcela/detalhe/{codigo_parcela}/"
            session.get(url_detalhe, headers=headers_detalhe, timeout=12)
        except Exception:
            pass
            
        time.sleep(3.5)
            
        # 3. Downloads
        headers_download = headers_home.copy()
        headers_download["Referer"] = f"https://sigef.incra.gov.br/geo/parcela/detalhe/{codigo_parcela}/"
        headers_download["Sec-Fetch-Site"] = "same-origin"
        headers_download["Sec-Fetch-Mode"] = "navigate"
        headers_download["Sec-Fetch-Dest"] = "document"
        
        res_vertices = session.get(url_vertices, headers=headers_download, timeout=15)
        if res_vertices.status_code != 200:
            raise HTTPException(
                status_code=400, 
                detail=f"Falha ao baixar vértices do SIGEF (HTTP {res_vertices.status_code})"
            )
            
        if b"[Go Back]" in res_vertices.content or b"<html" in res_vertices.content[:150].lower():
            raise HTTPException(
                status_code=400,
                detail="O SIGEF bloqueou a requisição automatizada de vértices (HTML Go Back recebido). Tente novamente em alguns instantes."
            )
            
        time.sleep(1.8)
            
        res_limites = session.get(url_limites, headers=headers_download, timeout=15)
        if res_limites.status_code != 200:
            raise HTTPException(
                status_code=400, 
                detail=f"Falha ao baixar limites do SIGEF (HTTP {res_limites.status_code})"
            )
            
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
    wkt_point_re = re.compile(r"POINT\s*\(\s*([\-\d\.]+)\s+([\-\d\.]+)\s*\)", re.IGNORECASE)
    transformer_utm = get_transformer("epsg:4674", "epsg:31982", always_xy=True)

    # 1. Parse do arquivo de limites
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

    # 2. Parse do arquivo de vértices
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
                
                z = row[idx_z].strip() if idx_z != -1 and len(row) > idx_z else "0.0"
                z = z.replace('"', '').replace("'", "").strip()
                
                sx_str = row[idx_sx].strip() if idx_sx != -1 and len(row) > idx_sx else "0,0"
                sy_str = row[idx_sy].strip() if idx_sy != -1 and len(row) > idx_sy else "0,0"
                sz_str = row[idx_sz].strip() if idx_sz != -1 and len(row) > idx_sz else "0,0"
                
                sx = sx_str.replace('"', '').replace("'", "").replace(",", ".").strip()
                sy = sy_str.replace('"', '').replace("'", "").replace(",", ".").strip()
                sz = sz_str.replace('"', '').replace("'", "").replace(",", ".").strip()
                
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
                
                conf = confrontantes_map.get(pt.upper(), "[Sem Confrontante]")
                conf = conf.replace('"', '').replace("'", "").strip()
                
                output.write(f"{pt};{x_utm};{y_utm};{z};{sx};{sy};{sz};{conf}\n")
                
    return output.getvalue()

@router.post("/levantamentos/{lev_id}/unificar-sigef-confrontantes", dependencies=[Depends(verificar_ambiente_local)])
def unificar_sigef_confrontantes(
    lev_id: int, 
    file_vertices: UploadFile = File(...), 
    file_limites: UploadFile = File(...)
):
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
        raise HTTPException(status_code=500, detail=str(e))
