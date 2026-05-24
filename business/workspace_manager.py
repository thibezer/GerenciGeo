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
