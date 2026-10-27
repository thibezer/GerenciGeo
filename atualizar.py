"""
atualizar.py — Atualizador Rápido e Autônomo do GerenciGeo
Executa em segundos:
1. git pull origin main
2. Build do frontend (apenas se necessário ou se a pasta dist não existir)
3. Sincronização bidirecional do banco SQLite com a Nuvem Hub (Hostinger)
"""

import sys
import os
import subprocess
import asyncio

# Garante suporte a UTF-8 no terminal Windows sem estourar UnicodeEncodeError
if sys.platform.startswith("win"):
    try:
        if sys.stdout.encoding.lower() != "utf-8":
            sys.stdout.reconfigure(encoding="utf-8")
        if sys.stderr.encoding.lower() != "utf-8":
            sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

def log_passo(num, titulo):
    print(f"\n==================================================")
    print(f"[{num}/3] [>>] {titulo}")
    print(f"==================================================")

def executar_git_pull():
    log_passo(1, "Puxando codigo mais recente do Git (git pull)...")
    try:
        res = subprocess.run(["git", "pull", "origin", "main"], capture_output=True, text=True, check=True)
        print(res.stdout.strip())
        return res.stdout
    except subprocess.CalledProcessError as e:
        print(f"[ERRO] Falha ao executar git pull:\n{e.stderr or e.stdout}")
        return None

def recompilar_frontend(git_output, forcar_build=False):
    log_passo(2, "Verificando compilacao do Frontend...")
    frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
    dist_dir = os.path.join(frontend_dir, "dist")
    src_dir = os.path.join(frontend_dir, "src")
    node_modules_dir = os.path.join(frontend_dir, "node_modules")
    
    precisa_build = False
    
    # 1. Se foi passado argumento para forçar build (--build ou --force)
    if forcar_build or "--build" in sys.argv or "--force" in sys.argv:
        print("[!] Solicitado build forcado do frontend.")
        precisa_build = True
    # 2. Se a pasta dist não existir ou estiver vazia
    elif not os.path.exists(dist_dir) or not os.listdir(dist_dir):
        print("[!] Pasta 'frontend/dist' ausente ou vazia. Compilando...")
        precisa_build = True
    # 3. Se o git pull trouxe alterações no frontend
    elif git_output and ("frontend/" in git_output or "package.json" in git_output):
        print("[!] Alteracoes detectadas no frontend via Git. Recompilando...")
        precisa_build = True
    # 4. Verificação de timestamp: se algum arquivo em src/ for mais recente que dist/
    else:
        try:
            dist_mtime = 0
            for root, _, files in os.walk(dist_dir):
                for f in files:
                    p = os.path.join(root, f)
                    dist_mtime = max(dist_mtime, os.path.getmtime(p))
            
            src_mtime = 0
            for root, _, files in os.walk(src_dir):
                for f in files:
                    p = os.path.join(root, f)
                    src_mtime = max(src_mtime, os.path.getmtime(p))
            
            if src_mtime > dist_mtime:
                print("[!] Codigo fonte do frontend e mais recente que o dist atual. Recompilando...")
                precisa_build = True
            else:
                print("[OK] Frontend ja esta atualizado e compilado.")
        except Exception:
            precisa_build = True

    if precisa_build:
        # Se node_modules não existir, executa npm install primeiro
        if not os.path.exists(node_modules_dir):
            print("[!] 'node_modules' ausente. Executando 'npm install'...")
            try:
                subprocess.run("npm install", cwd=frontend_dir, shell=True, check=True)
                print("[OK] Dependencias do frontend instaladas!")
            except subprocess.CalledProcessError as e:
                print(f"[ERRO] Falha ao executar 'npm install':\n{e}")
                return

        try:
            print("Executando 'npm run build'...")
            res = subprocess.run("npm run build", cwd=frontend_dir, shell=True, capture_output=True, text=True, check=True)
            print("[OK] Frontend compilado com sucesso!")
            
            # Limpa cache do WebView2 para garantir carregamento imediato da nova versão
            cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".webview_cache")
            if os.path.exists(cache_dir):
                import shutil
                try:
                    shutil.rmtree(cache_dir)
                    print("[OK] Cache antigo do WebView2 limpo com sucesso!")
                except Exception:
                    pass
        except subprocess.CalledProcessError as e:
            print(f"[ERRO] Falha no build do frontend:\n{e.stderr or e.stdout}")

def sincronizar_nuvem():
    log_passo(3, "Sincronizando dados com a Nuvem Hub (Hostinger)...")
    try:
        from services.gestores.nuvem_sync import sincronizar_tudo
        resultado = asyncio.run(sincronizar_tudo())
        if resultado.get("sucesso"):
            print(f"[OK] {resultado.get('mensagem')}")
            pull_info = resultado.get("pull", {})
            total_baixados = pull_info.get("total_recebidos", 0)
            print(f"[OK] Registros baixados da nuvem: {total_baixados}")
        else:
            print(f"[AVISO] Sincronizacao retornou: {resultado.get('mensagem')}")
    except Exception as e:
        print(f"[AVISO] Nao foi possivel sincronizar com a nuvem agora: {e}")

def main():
    print("\n==================================================")
    print("      GERENCIGEO — ATUALIZACAO RAPIDA DE SISTEMA     ")
    print("==================================================")
    
    git_out = executar_git_pull()
    if git_out is not None:
        recompilar_frontend(git_out)
    sincronizar_nuvem()
    
    print("\n==================================================")
    print("[SUCESSO] ATUALIZACAO CONCLUIDA COM SUCESSO!")
    print("==================================================\n")

if __name__ == "__main__":
    main()
