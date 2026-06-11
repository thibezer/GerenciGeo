    import sys
from pathlib import Path

# Adiciona o diretório raiz ao path do python
sys.path.append(str(Path(__file__).resolve().parents[1]))

from api import processar_arquivos_sigef

def main():
    root_dir = Path(__file__).resolve().parents[1]
    
    # Caminhos dos arquivos de teste
    vertices_path = root_dir / "exportacao (4).csv"
    limites_path = root_dir / "exportacao (5).csv"
    
    print(f"Lendo arquivos:")
    print(f"  Vértices: {vertices_path}")
    print(f"  Limites: {limites_path}")
    
    if not vertices_path.exists() or not limites_path.exists():
        print("Erro: Arquivos de teste não encontrados na raiz do projeto!")
        return

    # Lê o conteúdo
    with open(vertices_path, "r", encoding="utf-8", errors="ignore") as f:
        vertices_content = f.read()
        
    with open(limites_path, "r", encoding="utf-8", errors="ignore") as f:
        limites_content = f.read()
        
    # Processa
    try:
        resultado = processar_arquivos_sigef(vertices_content, limites_content)
        
        saida_path = root_dir / "vizinho_consolidado_1A.txt"
        with open(saida_path, "w", encoding="utf-8") as f:
            f.write(resultado)
            
        print(f"Sucesso! Arquivo gerado em: {saida_path}")
        print("Primeiras 10 linhas da saída:")
        for line in resultado.splitlines()[:10]:
            print(f"  {line}")
    except Exception as e:
        print(f"Ocorreu um erro no processamento: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
