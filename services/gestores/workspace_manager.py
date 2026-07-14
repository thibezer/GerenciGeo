import os
import shutil
import re
import json
from pathlib import Path
from config import EXPORT_BASE_FOLDER
from database.connection import execute_query

def sanitizar_nome_pasta(nome: str) -> str:
    """Remove caracteres invÃ¡lidos para nomes de pastas no Windows"""
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
            # Fallback seguro caso o registro ainda nÃ£o esteja persistido por completo ou sem propriedade
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
        """Cria fisicamente a Ã¡rvore de diretÃ³rios exigida no Windows"""
        folder = self.get_levantamento_folder(levantamento_id)
        
        # CriaÃ§Ã£o das pastas estruturadas (Brutos, Rinex, Processados, Documentos, Exportacoes)
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
            raise FileNotFoundError(f"Arquivo nÃ£o encontrado: {file_path}")
            
        dest_folder = self.get_levantamento_folder(levantamento_id) / category
        if not dest_folder.exists():
            self.create_workspace(levantamento_id)
            
        dest_path = dest_folder / source_path.name
        
        # Evitar sobrescrita: adiciona sufixo numÃ©rico em caso de duplicidade
        if dest_path.exists():
            counter = 1
            while True:
                new_name = f"{source_path.stem}_{counter}{source_path.suffix}"
                dest_path = dest_folder / new_name
                if not dest_path.exists():
                    break
                counter += 1
                
        shutil.move(str(source_path), str(dest_path))

        # Blindagem fÃ­sica: se for Brutos, define como Somente Leitura (Read-Only)
        if category == "Brutos":
            try:
                permissao_atual = os.stat(dest_path).st_mode
                os.chmod(dest_path, permissao_atual & ~stat.S_IWRITE)
                import logging
                logging.getLogger(__name__).info(f"[WORKSPACE] Arquivo bruto blindado como Read-Only: {dest_path.name}")
            except Exception as e_ch:
                import logging
                logging.getLogger(__name__).warning(f"[WORKSPACE] NÃ£o foi possÃ­vel definir Read-Only para {dest_path.name}: {e_ch}")

        return str(dest_path)
        
    def delete_workspace(self, levantamento_id: int):
        folder = self.get_levantamento_folder(levantamento_id)
        if folder.exists():
            shutil.rmtree(folder)

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

