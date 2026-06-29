import os
import re
import shutil
import stat

# Pastas conhecidas onde o HGO salva os arquivos convertidos
DESKTOP_PATHS = [
    r"D:\OneDrive_Thiago\OneDrive\Arquivos de Microsoft Copilot Chat\Área de Trabalho",
    os.path.join(os.path.expanduser("~"), "Desktop"),
    os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop"),
    os.path.join(os.path.expanduser("~"), "OneDrive", "Área de Trabalho"),
    os.path.join(os.path.expanduser("~"), "Arquivos de Microsoft Copilot Chat", "Área de Trabalho"),
]


def encontrar_rinex(nomes_base_origem: list, pasta_destino: str = None, pastas_extras: list = None) -> list:
    """
    Busca os arquivos RINEX gerados pelo HGO com base nos nomes base dos arquivos de origem.

    Args:
        nomes_base_origem: lista de nomes de arquivo sem extensao (ex: ['2sarad8'])
        pasta_destino: pasta destino final do projeto (adicionada a busca)
        pastas_extras: pastas adicionais para incluir na varredura

    Returns:
        Lista de caminhos absolutos dos arquivos RINEX encontrados
    """
    nomes_base = [n.lower() for n in nomes_base_origem]

    diretorios_busca = []

    # Area de Trabalho (onde o HGO costuma gravar os convertidos)
    for dp in DESKTOP_PATHS:
        if os.path.exists(dp):
            diretorios_busca.append(dp)
            # Varre subpastas de primeiro nivel (projetos temporarios do HGO)
            try:
                for item in os.listdir(dp):
                    caminho_item = os.path.join(dp, item)
                    if os.path.isdir(caminho_item):
                        diretorios_busca.append(caminho_item)
                        rinex_sub = os.path.join(caminho_item, "Rinex")
                        if os.path.exists(rinex_sub):
                            diretorios_busca.append(rinex_sub)
            except:
                pass

    # Pasta destino final
    if pasta_destino and os.path.exists(pasta_destino):
        diretorios_busca.append(pasta_destino)

    # Pastas extras passadas pelo chamador
    if pastas_extras:
        for p in pastas_extras:
            if p and os.path.exists(p):
                diretorios_busca.append(p)

    # Filtra duplicatas mantendo a ordem
    vistos = set()
    diretorios_filtrados = []
    for d in diretorios_busca:
        d_norm = os.path.normpath(d)
        if d_norm not in vistos:
            vistos.add(d_norm)
            diretorios_filtrados.append(d_norm)

    encontrados = {}
    for pasta in diretorios_filtrados:
        try:
            arquivos_pasta = os.listdir(pasta)
        except Exception:
            continue

        for f in arquivos_pasta:
            caminho_completo = os.path.join(pasta, f)
            try:
                if not os.path.isfile(caminho_completo):
                    continue
            except:
                continue

            nome_f, ext_f = os.path.splitext(f)
            nome_f_lower = nome_f.lower()
            ext_f_lower = ext_f.lower()

            pertence = any(
                nome_f_lower == nb or nome_f_lower.startswith(nb)
                for nb in nomes_base
            )
            if not pertence:
                continue

            eh_rinex = (
                ext_f_lower in [".obs", ".nav", ".o", ".n", ".g"]
                or bool(re.match(r"^\.\d{2}[ong]$", ext_f_lower))
            )
            if eh_rinex:
                encontrados[f.lower()] = caminho_completo

    return list(encontrados.values())


def copiar_rinex(nomes_base_origem: list, pasta_destino: str, pastas_extras: list = None) -> list:
    """
    Encontra os arquivos RINEX e os copia para pasta_destino.

    Returns:
        Lista de caminhos dos arquivos copiados com sucesso para pasta_destino.
    """
    os.makedirs(pasta_destino, exist_ok=True)
    arquivos = encontrar_rinex(nomes_base_origem, pasta_destino=pasta_destino, pastas_extras=pastas_extras)
    copiados = []

    for arq in arquivos:
        dest_file = os.path.join(pasta_destino, os.path.basename(arq))
        # Ignora se o arquivo ja esta na pasta destino
        if os.path.normpath(arq) == os.path.normpath(dest_file):
            copiados.append(dest_file)
            continue
        try:
            if os.path.exists(dest_file):
                try:
                    os.chmod(dest_file, stat.S_IWRITE)
                except:
                    pass
                os.remove(dest_file)
            shutil.copy2(arq, dest_file)
            print(f" -> Copiado: {os.path.basename(arq)} -> {pasta_destino}")
            copiados.append(dest_file)
        except Exception as e:
            print(f"[ERRO] Falha ao copiar {os.path.basename(arq)}: {e}")

    return copiados


if __name__ == "__main__":
    # Teste manual: substitua pelo nome base do arquivo bruto e pasta destino
    NOMES_BASE = ["2sarad8"]
    PASTA_DESTINO = r"D:\OneDrive_Thiago\OneDrive\Desenvolvimento\GerenciGeo\scratch\debug_out"

    print(f"Buscando RINEX para: {NOMES_BASE}")
    encontrados = encontrar_rinex(NOMES_BASE, pasta_destino=PASTA_DESTINO)

    if encontrados:
        print(f"\n[OK] {len(encontrados)} arquivo(s) localizado(s):")
        for f in encontrados:
            print(f"  {f}")

        print(f"\nCopiando para: {PASTA_DESTINO}")
        copiados = copiar_rinex(NOMES_BASE, PASTA_DESTINO)
        print(f"[OK] {len(copiados)} arquivo(s) copiado(s).")
    else:
        print("\n[AVISO] Nenhum arquivo RINEX encontrado.")
