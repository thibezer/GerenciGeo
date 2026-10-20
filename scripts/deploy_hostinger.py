#!/usr/bin/env python3
"""
scripts/deploy_hostinger.py — Deploy automatizado via SFTP/FTP para a Hostinger.
Localiza a pasta correta do domínio (public_html ou domains/<dominio>/public_html)
e sincroniza os artefatos compilados de frontend/dist.
"""

import os
import sys
import posixpath

try:
    import paramiko
except ImportError:
    print("[deploy] Instalando paramiko...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"])
    import paramiko


def conectar_sftp(server, port, username, password):
    print(f"[deploy] Conectando via SFTP em {server}:{port} como '{username}'...")
    transport = paramiko.Transport((server, int(port)))
    transport.connect(username=username, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    print("[deploy] Conexão SFTP estabelecida com sucesso!")
    return transport, sftp


def encontrar_diretorio_alvo(sftp):
    """
    Procura onde reside o site ativo inspecionando pastas conhecidas da Hostinger.
    """
    candidatos = [
        "domains/darkgray-duck-674813.hostingersite.com/public_html",
        "public_html",
    ]

    # Verifica se há pasta domains
    try:
        items = sftp.listdir(".")
        print(f"[deploy] Itens na raiz do FTP: {items}")
        if "domains" in items:
            doms = sftp.listdir("domains")
            print(f"[deploy] Domínios encontrados: {doms}")
            for d in doms:
                cand = f"domains/{d}/public_html"
                if cand not in candidatos:
                    candidatos.append(cand)
    except Exception as e:
        print(f"[deploy] Aviso ao listar raiz: {e}")

    pastas_validas = []
    for cand in candidatos:
        try:
            sftp.stat(cand)
            conteudo = sftp.listdir(cand)
            print(f"[deploy] Pasta encontrada: '{cand}' contendo {len(conteudo)} itens")
            # Se contém principal.html ou api.php, é um alvo válido
            if "principal.html" in conteudo or "api.php" in conteudo:
                pastas_validas.append(cand)
        except Exception:
            pass

    if not pastas_validas:
        # Fallback padrão
        print("[deploy] Nenhuma pasta com principal.html identificada. Usando 'public_html'")
        return ["public_html"]

    # Se darkgray-duck-674813.hostingersite.com estiver entre as válidas, prioriza ela
    for p in pastas_validas:
        if "darkgray-duck" in p:
            print(f"[deploy] Pasta prioritária identificada: '{p}'")
            return [p]

    return pastas_validas


def upload_arquivo(sftp, local_file, remote_file):
    remote_dir = posixpath.dirname(remote_file)
    criar_dirs_remotos(sftp, remote_dir)
    sftp.put(local_file, remote_file)


def criar_dirs_remotos(sftp, remote_dir):
    partes = remote_dir.strip("/").split("/")
    caminho_acumulado = ""
    for parte in partes:
        if not parte:
            continue
        caminho_acumulado = f"{caminho_acumulado}/{parte}" if caminho_acumulado else parte
        try:
            sftp.stat(caminho_acumulado)
        except Exception:
            try:
                sftp.mkdir(caminho_acumulado)
                print(f"[deploy] Criado diretório remoto: '{caminho_acumulado}'")
            except Exception:
                pass


def sincronizar_dist(sftp, local_dist, remote_base):
    print(f"\n[deploy] Sincronizando '{local_dist}' -> '{remote_base}'...")
    total_arquivos = 0

    for root, dirs, files in os.walk(local_dist):
        rel_dir = os.path.relpath(root, local_dist)
        if rel_dir == ".":
            rel_dir = ""

        for file in files:
            local_path = os.path.join(root, file)
            if rel_dir:
                remote_path = f"{remote_base}/{rel_dir.replace(os.sep, '/')}/{file}"
            else:
                remote_path = f"{remote_base}/{file}"

            upload_arquivo(sftp, local_path, remote_path)
            total_arquivos += 1
            print(f"  ✓ {remote_path}")

    print(f"[deploy] Sincronização concluída com sucesso! ({total_arquivos} arquivos enviados)")


def main():
    server = os.environ.get("FTP_SERVER")
    port = os.environ.get("FTP_PORT", "65002")
    username = os.environ.get("FTP_USERNAME")
    password = os.environ.get("FTP_PASSWORD")

    if not server or not username or not password:
        print("[deploy] ERRO: Variáveis FTP_SERVER, FTP_USERNAME ou FTP_PASSWORD ausentes.")
        sys.exit(1)

    local_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
    local_dist = os.path.abspath(local_dist)

    if not os.path.isdir(local_dist):
        print(f"[deploy] ERRO: Diretório build local não encontrado em '{local_dist}'")
        sys.exit(1)

    transport, sftp = conectar_sftp(server, port, username, password)

    try:
        diretorios_alvo = encontrar_diretorio_alvo(sftp)
        print(f"[deploy] Diretórios alvos para publicação: {diretorios_alvo}")

        for dir_alvo in diretorios_alvo:
            sincronizar_dist(sftp, local_dist, dir_alvo)

        print("\n[deploy] 🚀 DEPLOY CONCLUÍDO COM SUCESSO!")
    finally:
        try:
            sftp.close()
            transport.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
