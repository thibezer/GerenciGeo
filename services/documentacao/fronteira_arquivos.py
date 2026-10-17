"""Arquivos de Shapefile da faixa de fronteira: validação de upload e extração segura de .zip.

Protege contra: nome de arquivo malicioso, zip slip (`../` dentro do .zip), zip bomb (tamanho/quantidade
descompactados) e conteúdo que não é shapefile.
"""
import re
import shutil
import zipfile
from pathlib import Path

from services.documentacao.erros import ErroDocumento

EXTENSOES_UPLOAD = {".zip", ".shp"}
EXTENSOES_SHAPEFILE = {".shp", ".shx", ".dbf", ".prj", ".cpg", ".qpj"}
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_DESCOMPACTADO_BYTES = 300 * 1024 * 1024
MAX_ARQUIVOS_ZIP = 200


def nome_arquivo_seguro(filename) -> str:
    """Só o nome-base (sem diretórios), sem caracteres de controle/inválidos. Vazio -> ErroDocumento."""
    bruto = str(filename or "").replace("\\", "/").split("/")[-1]
    limpo = re.sub(r'[\x00-\x1f<>:"|?*]', "", bruto).strip().strip(".")
    if not limpo:
        raise ErroDocumento("Nome do arquivo ausente ou inválido.")
    return limpo[:150]


def validar_extensao_upload(nome: str) -> str:
    ext = Path(nome).suffix.lower()
    if ext not in EXTENSOES_UPLOAD:
        raise ErroDocumento("Formato não aceito. Envie o Shapefile da área em .zip (com .shp/.shx/.dbf) ou o arquivo .shp.")
    return ext


def extrair_zip_seguro(zip_path: Path, destino: Path) -> list[Path]:
    """Extrai SOMENTE arquivos de shapefile, achatados em `destino` (sem subpastas), com limites de tamanho/quantidade."""
    destino = Path(destino).resolve()
    destino.mkdir(parents=True, exist_ok=True)
    extraidos: list[Path] = []
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            membros = [m for m in zf.infolist() if not m.is_dir()]
            if len(membros) > MAX_ARQUIVOS_ZIP:
                raise ErroDocumento("O .zip contém arquivos demais.")
            if sum(m.file_size for m in membros) > MAX_DESCOMPACTADO_BYTES:
                raise ErroDocumento("O .zip é grande demais depois de descompactado.")
            total = 0
            for membro in membros:
                nome = membro.filename.replace("\\", "/").split("/")[-1]
                if not nome or Path(nome).suffix.lower() not in EXTENSOES_SHAPEFILE:
                    continue  # ignora lixo (mapas, imagens, executáveis) e pastas
                alvo = (destino / nome).resolve()
                if destino not in alvo.parents:  # zip slip / nome estranho
                    raise ErroDocumento("O .zip contém caminhos inválidos.")
                with zf.open(membro) as origem, open(alvo, "wb") as saida:
                    while True:
                        bloco = origem.read(1024 * 1024)
                        if not bloco:
                            break
                        total += len(bloco)
                        if total > MAX_DESCOMPACTADO_BYTES:  # cabeçalho do zip mentiu sobre o tamanho
                            raise ErroDocumento("O .zip é grande demais depois de descompactado.")
                        saida.write(bloco)
                extraidos.append(alvo)
    except zipfile.BadZipFile:
        raise ErroDocumento("O arquivo enviado não é um .zip válido.")
    return extraidos


def trocar_arquivos_atomicamente(pasta_destino: Path, pasta_nova: Path) -> None:
    """Substitui os ARQUIVOS de `pasta_destino` (subpastas, como Matricula_N, ficam intactas) pelos de `pasta_nova`.
    Os antigos vão para um backup e só são apagados depois que os novos entraram; se algo falhar, restaura."""
    pasta_destino.mkdir(parents=True, exist_ok=True)
    backup = pasta_destino / f".bak_{pasta_nova.name}"
    backup.mkdir(parents=True, exist_ok=True)
    antigos = [f for f in pasta_destino.iterdir() if f.is_file()]
    movidos_antigos: list[tuple[Path, Path]] = []
    movidos_novos: list[Path] = []
    try:
        for f in antigos:
            alvo = backup / f.name
            shutil.move(str(f), str(alvo))
            movidos_antigos.append((alvo, f))
        for f in pasta_nova.iterdir():
            if f.is_file():
                destino = pasta_destino / f.name
                shutil.move(str(f), str(destino))
                movidos_novos.append(destino)
    except Exception:
        for novo in movidos_novos:
            try:
                novo.unlink()
            except OSError:
                pass
        for origem, volta in movidos_antigos:
            try:
                shutil.move(str(origem), str(volta))
            except OSError:
                pass
        shutil.rmtree(backup, ignore_errors=True)
        raise
    shutil.rmtree(backup, ignore_errors=True)
