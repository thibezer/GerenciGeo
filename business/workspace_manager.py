import os
import shutil
import re
import json
from pathlib import Path
from config import EXPORT_BASE_FOLDER
from database.connection import execute_query

def sanitizar_nome_pasta(nome: str) -> str:
    """Remove caracteres inválidos para nomes de pastas no Windows"""
    nome_limpo = re.sub(r'[\\/*?:"<>|]', "", nome)
    return nome_limpo.strip()

class WorkspaceManager:
    def __init__(self, base_folder=None):
        self.base_folder = Path(base_folder) if base_folder else Path(EXPORT_BASE_FOLDER)
        self.base_folder.mkdir(parents=True, exist_ok=True)

    def get_levantamento_folder(self, levantamento_id: int) -> Path:
        """Retorna o caminho estruturado: EXPORT_BASE_FOLDER/Projetos/[Nome_da_Propriedade]/Lev_[ID]_[Ano]"""
        query = """
            SELECT l.id, l.data_inicio, p.nome_propriedade 
            FROM levantamentos l 
            JOIN propriedades p ON l.propriedade_id = p.id 
            WHERE l.id = ?
        """
        try:
            res = execute_query(query, params=(levantamento_id,), fetch_one=True)
        except Exception:
            res = None

        if not res:
            # Fallback seguro caso o registro ainda não esteja persistido por completo ou sem propriedade
            nome_prop_limpo = "Propriedade_Desconhecida"
            ano = "Sem_Ano"
        else:
            res = dict(res)
            nome_prop_limpo = sanitizar_nome_pasta(res.get("nome_propriedade", "Sem_Nome"))
            data_inicio = res.get("data_inicio")
            ano = "Sem_Ano"
            if data_inicio:
                try:
                    if isinstance(data_inicio, str):
                        if "-" in data_inicio:
                            ano = data_inicio.split("-")[0]
                        elif "/" in data_inicio:
                            parts = data_inicio.split("/")
                            if len(parts[0]) == 4:
                                ano = parts[0]
                            else:
                                ano = parts[2]
                    else:
                        ano = str(data_inicio.year)
                except Exception:
                    pass

        return self.base_folder / "Projetos" / nome_prop_limpo / f"Lev_{levantamento_id}_{ano}"

    def create_workspace(self, levantamento_id: int) -> str:
        """Cria fisicamente a árvore de diretórios exigida no Windows"""
        folder = self.get_levantamento_folder(levantamento_id)
        
        # Criação das pastas estruturadas (Brutos, Rinex, Processados, Documentos, Exportacoes)
        (folder / "Brutos").mkdir(parents=True, exist_ok=True)
        (folder / "Rinex").mkdir(parents=True, exist_ok=True)
        (folder / "Processados").mkdir(parents=True, exist_ok=True)
        (folder / "Documentos").mkdir(parents=True, exist_ok=True)
        (folder / "Exportacoes").mkdir(parents=True, exist_ok=True)
        
        return str(folder)

    def move_file_to_workspace(self, levantamento_id: int, file_path: str, category: str) -> str:
        """
        Move um arquivo processado para a subpasta correta.
        Categorias: 'Brutos', 'Rinex', 'Processados', 'Documentos', 'Exportacoes'
        """
        import stat
        source_path = Path(file_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")
            
        dest_folder = self.get_levantamento_folder(levantamento_id) / category
        if not dest_folder.exists():
            self.create_workspace(levantamento_id)
            
        dest_path = dest_folder / source_path.name
        
        # Evitar sobrescrita: adiciona sufixo numérico em caso de duplicidade
        if dest_path.exists():
            counter = 1
            while True:
                new_name = f"{source_path.stem}_{counter}{source_path.suffix}"
                dest_path = dest_folder / new_name
                if not dest_path.exists():
                    break
                counter += 1
                
        shutil.move(str(source_path), str(dest_path))

        # Blindagem física: se for Brutos, define como Somente Leitura (Read-Only)
        if category == "Brutos":
            try:
                permissao_atual = os.stat(dest_path).st_mode
                os.chmod(dest_path, permissao_atual & ~stat.S_IWRITE)
                import logging
                logging.getLogger(__name__).info(f"[WORKSPACE] Arquivo bruto blindado como Read-Only: {dest_path.name}")
            except Exception as e_ch:
                import logging
                logging.getLogger(__name__).warning(f"[WORKSPACE] Não foi possível definir Read-Only para {dest_path.name}: {e_ch}")

        return str(dest_path)
        
    def delete_workspace(self, levantamento_id: int):
        folder = self.get_levantamento_folder(levantamento_id)
        if folder.exists():
            shutil.rmtree(folder)

    def gerar_documento_cliente_workspace(self, levantamento_id: int):
        """Varre clientes e matrículas vinculados à propriedade do levantamento e grava DADOS_GERAIS.json"""
        query_prop = """
            SELECT p.id, p.nome_propriedade, p.codigo_car, p.municipio, p.uf
            FROM levantamentos l
            JOIN propriedades p ON l.propriedade_id = p.id
            WHERE l.id = ?
        """
        try:
            prop_row = execute_query(query_prop, params=(levantamento_id,), fetch_one=True)
            if not prop_row:
                return
            propriedade_data = dict(prop_row)
            propriedade_id = propriedade_data['id']

            # 1. Busca todas as matrículas cadastradas da propriedade
            query_mat = """
                SELECT id, numero_matricula, ccir, itr, area_ha
                FROM matriculas
                WHERE propriedade_id = ?
            """
            mat_rows = execute_query(query_mat, params=(propriedade_id,), fetch_all=True)
            matriculas_list = [dict(m) for m in mat_rows]

            # 2. Busca todos os clientes associados à propriedade
            query_cli = """
                SELECT c.*
                FROM propriedade_clientes pc
                JOIN clientes c ON pc.cliente_id = c.id
                WHERE pc.propriedade_id = ?
            """
            cli_rows = execute_query(query_cli, params=(propriedade_id,), fetch_all=True)
            clientes_list = []
            
            for r in cli_rows:
                c_dict = dict(r)
                c_id = c_dict['id']
                c_dict.pop('created_at', None)
                
                # Coleta os metadados do cliente
                meta_rows = execute_query("SELECT chave, valor FROM cliente_metadados WHERE id_cliente = ?", params=(c_id,), fetch_all=True)
                c_dict['metadados'] = {m['chave']: m['valor'] for m in meta_rows}
                clientes_list.append(c_dict)

            # 3. Compila dados estruturados do Levantamento
            dados_gerais = {
                "propriedade": propriedade_data,
                "clientes": clientes_list,
                "matriculas": matriculas_list
            }

            # 4. Garante a criação física da pasta e grava o JSON estruturado
            folder = self.get_levantamento_folder(levantamento_id)
            self.create_workspace(levantamento_id)
            
            caminho_json = folder / "Documentos" / "DADOS_GERAIS.json"
            with open(caminho_json, "w", encoding="utf-8") as f:
                json.dump(dados_gerais, f, indent=4, ensure_ascii=False)
                
        except Exception as e:
            # Silencia erros de IO com logs adequados
            import logging
            logging.getLogger(__name__).error(f"Erro ao gerar metadados DADOS_GERAIS.json: {e}")

    def gerar_snapshot_arquivamento(self, levantamento_id: int) -> str:
        """Gera um snapshot JSON físico completo de segurança de todos os dados do levantamento para resguardo e o salva no workspace"""
        try:
            # profissional e levantamento
            lev_row = execute_query(
                "SELECT l.*, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
                params=(levantamento_id,), fetch_one=True
            )
            if not lev_row:
                return ""
            lev_data = dict(lev_row)
            propriedade_id = lev_data["propriedade_id"]

            # propriedade e clientes
            prop_row = execute_query("SELECT * FROM propriedades WHERE id = ?", params=(propriedade_id,), fetch_one=True)
            prop_data = dict(prop_row) if prop_row else {}

            cli_rows = execute_query(
                "SELECT c.*, pc.percentual_participacao FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
                params=(propriedade_id,), fetch_all=True
            )
            clientes = [dict(c) for c in cli_rows]

            # matriculas
            mat_rows = execute_query("SELECT * FROM matriculas WHERE propriedade_id = ?", params=(propriedade_id,), fetch_all=True)
            matriculas = [dict(m) for m in mat_rows]

            # confrontantes
            conf_rows = execute_query("SELECT * FROM confrontantes WHERE levantamento_id = ?", params=(levantamento_id,), fetch_all=True)
            confrontantes = [dict(c) for c in conf_rows]

            # pontos
            pontos_rows = execute_query("SELECT * FROM pontos WHERE levantamento_id = ?", params=(levantamento_id,), fetch_all=True)
            pontos = [dict(p) for p in pontos_rows]

            # segmentos
            seg_rows = execute_query("SELECT * FROM segmentos WHERE levantamento_id = ?", params=(levantamento_id,), fetch_all=True)
            segmentos = [dict(s) for s in seg_rows]

            snapshot = {
                "levantamento": lev_data,
                "propriedade": prop_data,
                "clientes": clientes,
                "matriculas": matriculas,
                "confrontantes": confrontantes,
                "pontos": pontos,
                "segmentos": segmentos
            }

            folder = self.get_levantamento_folder(levantamento_id)
            caminho_snap = folder / "Documentos" / "SNAPSHOT_FECHAMENTO.json"
            
            with open(caminho_snap, "w", encoding="utf-8") as f:
                json.dump(snapshot, f, indent=4, ensure_ascii=False)
                
            return str(caminho_snap)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"[WORKSPACE] Erro ao gerar SNAPSHOT_FECHAMENTO.json: {e}")
            return ""

    def travar_workspace_inteiro_readonly(self, levantamento_id: int):
        """Trava todos os arquivos da pasta do levantamento como Read-Only no Windows"""
        folder = self.get_levantamento_folder(levantamento_id)
        if folder.exists():
            import stat
            for root, dirs, files in os.walk(folder):
                for f in files:
                    path_f = Path(root) / f
                    try:
                        permissao = os.stat(path_f).st_mode
                        os.chmod(path_f, permissao & ~stat.S_IWRITE)
                    except Exception:
                        pass

    def destravar_workspace_inteiro(self, levantamento_id: int):
        """Restabelece permissão de escrita em todos os arquivos da pasta do levantamento no Windows"""
        folder = self.get_levantamento_folder(levantamento_id)
        if folder.exists():
            import stat
            for root, dirs, files in os.walk(folder):
                for f in files:
                    path_f = Path(root) / f
                    try:
                        permissao = os.stat(path_f).st_mode
                        os.chmod(path_f, permissao | stat.S_IWRITE)
                    except Exception:
                        pass

    def consolidar_pontos_levantamento(self, levantamento_id: int) -> str:
        """
        Lê os pontos e segmentos do banco de dados, resolve o fuso UTM,
        computa os sigmas e confrontantes, e grava o arquivo PONTOS_CONSOLIDADOS_UTM.txt
        na pasta /Exportacoes do levantamento.
        """
        import math
        from pyproj import Transformer

        # 1. Recupera todos os pontos cadastrados do levantamento ordenados
        query_pontos = """
            SELECT p.id, p.nome_vertice, p.tipo_ponto, p.lat, p.lon, p.alt, 
                   p.sigma_lat, p.sigma_lon, p.sigma_alt, p.ordem_caminhamento, p.matricula_id
            FROM pontos p
            WHERE p.levantamento_id = ?
            ORDER BY p.ordem_caminhamento ASC, p.id ASC
        """
        pontos = [dict(r) for r in execute_query(query_pontos, params=(levantamento_id,), fetch_all=True)]
        if not pontos:
            raise ValueError("Nenhum ponto geodésico localizado no banco de dados para este levantamento.")

        # 2. Recupera todos os segmentos de divisa
        query_segmentos = """
            SELECT s.ponto_inicio_id, s.tipo_limite_sigef, s.metodo_posicionamento_sigef, c.nome as nome_confrontante
            FROM segmentos s
            LEFT JOIN confrontantes c ON s.confrontante_id = c.id
            WHERE s.levantamento_id = ?
        """
        segmentos = {s["ponto_inicio_id"]: dict(s) for s in execute_query(query_segmentos, params=(levantamento_id,), fetch_all=True)}

        # 3. Determina o fuso UTM baseado no primeiro ponto válido
        ponto_base = next((p for p in pontos if p["lon"] and p["lon"] != 0.0), pontos[0])
        lon0 = ponto_base["lon"]
        zona_utm = int((lon0 + 180) / 6) + 1
        epsg_utm = f"319{60 + zona_utm}"  # Família SIRGAS 2000 UTM Sul

        # Instancia o conversor geodésico -> plano UTM
        transformer = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)

        folder = self.get_levantamento_folder(levantamento_id)
        self.create_workspace(levantamento_id)
        caminho_exportacao = folder / "Exportacoes" / "PONTOS_CONSOLIDADOS_UTM.txt"

        linhas_arquivo = []
        # Cabeçalho padronizado
        linhas_arquivo.append("VERTICE;ESTE_UTM;NORTE_UTM;ALTITUDE;SIGMA_E;SIGMA_N;SIGMA_Z;TIPO;CONFRONTANTE;TIPO_LIMITE;METODO")

        for p in pontos:
            # Conversão de latitude/longitude corrigidas para coordenadas planas UTM
            e_utm, n_utm = transformer.transform(p["lon"], p["lat"])
            
            # Mapeia informações do segmento correspondente (onde o ponto é vértice de partida)
            seg = segmentos.get(p["id"])
            confrontante = "SEM CONFRONTANTE"
            tipo_limite = "N/A"
            metodo = "N/A"

            if seg:
                if seg["nome_confrontante"]:
                    confrontante = f"CONFR: {seg['nome_confrontante']}"
                else:
                    confrontante = "LIMITE NATURAL"
                tipo_limite = seg["tipo_limite_sigef"] or "LN1"
                metodo = seg["metodo_posicionamento_sigef"] or "PG1"
            elif p["tipo_ponto"] == "M":
                confrontante = "APOIO BASE PPP"
                tipo_limite = "N/A"
                metodo = "MC1"

            # Linha formatada com 3 casas decimais para coordenadas e sigmas
            linhas_arquivo.append(
                f"{p['nome_vertice']};{e_utm:.3f};{n_utm:.3f};{p['alt']:.3f};"
                f"{p['sigma_lon']:.3f};{p['sigma_lat']:.3f};{p['sigma_alt']:.3f};"
                f"{p['tipo_ponto']};{confrontante.upper()};{tipo_limite};{metodo}"
            )

        # Gravação física do arquivo unificado
        with open(caminho_exportacao, "w", encoding="utf-8") as f:
            f.write("\n".join(linhas_arquivo))

        return str(caminho_exportacao)
