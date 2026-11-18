"""
scripts/verificar_arquivo_ia.py — Utilitário CLI para verificar se um arquivo já foi enviado
ao GerenciGeo (por hash SHA-256 ou nome), listar histórico de envios e limpar marca d'água de PDFs.

Exemplos de uso:
    python scripts/verificar_arquivo_ia.py --arquivo "C:/caminho/rg.jpg" --arquivo "C:/caminho/matricula.pdf"
    python scripts/verificar_arquivo_ia.py --listar --busca "10189"
    python scripts/verificar_arquivo_ia.py --limpar-pdf "C:/caminho/matricula.pdf" --saida "C:/caminho/matricula_limpo.pdf"
"""

import argparse
import json
import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from services.gestores.historico_arquivos_service import (
    listar_arquivos_enviados,
    verificar_arquivo_enviado,
)
from services.processamento.pdf_limpeza import gerar_pdf_sem_marca


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verifica arquivos já enviados ao GerenciGeo e limpa marca d'água de PDFs."
    )
    parser.add_argument(
        "--arquivo",
        action="append",
        help="Caminho do arquivo a verificar (pode ser repetido).",
    )
    parser.add_argument(
        "--listar",
        action="store_true",
        help="Lista os arquivos já enviados/processados no histórico.",
    )
    parser.add_argument("--busca", type=str, default=None, help="Filtro de busca ao listar.")
    parser.add_argument("--categoria", type=str, default=None, help="Categoria: CLIENTE, MATRICULA, PROPRIEDADE.")
    parser.add_argument("--limite", type=int, default=100, help="Limite de registros na listagem.")
    parser.add_argument("--limpar-pdf", type=str, default=None, help="Caminho de PDF para remover marca d'água.")
    parser.add_argument("--saida", type=str, default=None, help="Caminho de saída do PDF limpo (opcional).")

    args = parser.parse_args()

    if args.limpar_pdf:
        origem = os.path.abspath(args.limpar_pdf)
        destino = (
            os.path.abspath(args.saida)
            if args.saida
            else os.path.splitext(origem)[0] + "_limpo.pdf"
        )
        res = gerar_pdf_sem_marca(origem, destino)
        print(json.dumps(res, indent=2, ensure_ascii=False))
        sys.exit(0 if res.get("sucesso") else 1)

    if args.listar:
        itens = listar_arquivos_enviados(
            busca=args.busca,
            categoria=args.categoria,
            limite=args.limite,
        )
        print(json.dumps({"total": len(itens), "arquivos": itens}, indent=2, ensure_ascii=False))
        return

    if args.arquivo:
        resultados = []
        for caminho in args.arquivo:
            info = verificar_arquivo_enviado(caminho=caminho)
            info["caminho_verificado"] = caminho
            resultados.append(info)
        print(json.dumps({"resultados": resultados}, indent=2, ensure_ascii=False))
        return

    parser.print_help()


if __name__ == "__main__":
    main()
