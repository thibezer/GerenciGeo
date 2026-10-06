"""Gera uma anuência do sistema (Fazenda Douradina) com painel para preencher o confrontante na página.

Uso: python scripts/gerar_anuencia_douradina.py [perfil]
Perfis: p0093_0170 (padrão, arquivo anuencia_douradina_editavel.html) e v0036_v0037.
Os dados (proprietário requerente, divisas, profissional, mapa) vêm do banco via o mesmo gerador
da rota /anuencia-html. Só a qualificação do confrontante anuente é editável no HTML gerado.
"""
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from services.documentacao.cartorio.anuencias import gerar_declaracao_anuencia_html  # noqa: E402

from database.connection import execute_query  # noqa: E402

PERFIS = {
    # lev, matrícula do desenho, confrontante, arquivo, chave do localStorage
    "p0093_0170": (17, 17, 141, "anuencia_douradina_editavel.html", "anuencia_douradina_v1"),     # confrontante "Não Cadastrado"
    "v0036_v0037": (17, 16, 132, "anuencia_douradina_v0036_v0037.html", "anuencia_douradina_v0036_v0037_v1"),  # V-0036 → P-0091 → V-0037
}
perfil = sys.argv[1] if len(sys.argv) > 1 else "p0093_0170"
LEVANTAMENTO_ID, MATRICULA_ID, CONFRONTANTE_ID, ARQUIVO, CHAVE_LS = PERFIS[perfil]

_c = execute_query(
    """SELECT COALESCE(p.nome, c.nome) AS nome, c.matricula_imovel AS mat
       FROM confrontantes c LEFT JOIN pessoas p ON p.id = c.pessoa_id WHERE c.id = ?""",
    params=(CONFRONTANTE_ID,), fetch_one=True)
NOME_PADRAO = _c["nome"]
MAT_PADRAO = (_c["mat"] or "").strip()  # já cadastrada no sistema (ex.: "1978"); vira o valor inicial do painel

html = gerar_declaracao_anuencia_html(LEVANTAMENTO_ID, MATRICULA_ID, CONFRONTANTE_ID)


def trocar(padrao, novo, texto, flags=0, esperado=1):
    resultado, n = re.subn(padrao, novo, texto, flags=flags)
    assert n == esperado, f"substituição {padrao!r}: {n} ocorrência(s), esperava {esperado}"
    return resultado


def span(chave):
    return f'<span data-k="{chave}"></span>'


# Qualificação (do nome até "...RG nº ___") vira um bloco gerado pelo painel, e também editável à mão.
html = trocar(
    r'<p><strong class="text-slate-900">' + re.escape(NOME_PADRAO) + r'</strong>, .*?(?=, na qualidade de)',
    '<p><span id="qualif" contenteditable="true" spellcheck="false"></span>',
    html, re.S)
html = trocar(r'na qualidade de proprietário e/ou possuidor legítimo',
              'na qualidade de ' + span('proprietario') + ' e/ou ' + span('possuidor') + ' ' + span('legitimo'), html)
html = trocar(r'<strong>Matrícula nº (?:_+|' + re.escape(MAT_PADRAO or '_') + r')</strong>', '<strong>Matrícula nº ' + span('mat') + '</strong>', html)
html = trocar(r'<strong>DECLARA</strong>', '<strong>' + span('declara') + '</strong>', html)
html = trocar(r'<p>O declarante atesta que', '<p>' + span('declarante') + ' ' + span('atesta') + ' que', html)
html = trocar(r'Declaro ainda que', span('declaro_ainda') + ' que', html)
html = trocar(r'O declarante concorda integralmente', span('declarante') + ' ' + span('concorda') + ' integralmente', html)
html = trocar(r'e reconhece esta descrição', 'e ' + span('reconhece') + ' esta descrição', html)

# Nome e matrícula do confrontante nas demais ocorrências.
html = html.replace(
    NOME_PADRAO + '</div>\n        <div class="text-[9px] text-slate-500 text-center font-medium mt-0.5">Confrontante Anuente</div>\n    </div>',
    span('nome_assinatura') + '</div>\n        <div class="text-[9px] text-slate-500 text-center font-medium mt-0.5">Confrontante Anuente</div>\n    </div>'
    '\n    <div id="assina_conjuge" class="flex flex-col items-center min-w-[170px] flex-1 max-w-[260px]" style="display:none">'
    '\n        <div class="w-full border-t border-slate-400 mt-6 mb-1.5"></div>'
    '\n        <div class="text-[11px] font-bold text-slate-900 text-center uppercase tracking-wide leading-tight">' + span('conjuge_assinatura') + '</div>'
    '\n        <div class="text-[9px] text-slate-500 text-center font-medium mt-0.5">Cônjuge do Confrontante Anuente</div>\n    </div>')
assert 'data-k="nome_assinatura"' in html, "bloco de assinatura do confrontante não encontrado"
html = trocar(r'(Confrontante: <strong class="text-slate-900">)' + re.escape(NOME_PADRAO) + r'(</strong>)',
              r'\1' + span('nome') + r'\2', html)
html = trocar(r'(Imóvel Confrontante: <strong class="text-slate-900">)(?:_+|' + re.escape(MAT_PADRAO or '_') + r')(</strong>)',
              r'\1' + span('mat') + r'\2', html)
html = html.replace('<title>Declaração de Anuência do Confrontante - ' + NOME_PADRAO + '</title>',
                    '<title>Declaração de Anuência - Fazenda Douradina</title>')

# Data e nº do TRT editáveis à mão.
html = trocar(r'(<p class="text-xs font-medium text-slate-900 text-left")>(Umuarama/PR, [^<]+)</p>',
              r'\1 contenteditable="true" spellcheck="false">\2</p>', html)
html = trocar(r'(ART/TRT nº <strong)>(_+)</strong>', r'\1 contenteditable="true" spellcheck="false">\2</strong>', html)

with open(os.path.join(RAIZ, "scripts", "anuencia_douradina_painel.html"), encoding="utf-8") as f:
    painel = f.read()
html = trocar(r'<!-- BARRA_ACOES_FIM -->', '<!-- BARRA_ACOES_FIM -->\n' + painel.split('<!--SCRIPT-->')[0], html)
script = (painel.split('<!--SCRIPT-->')[1]
          .replace("'anuencia_douradina_v1'", repr(CHAVE_LS))
          .replace("/*PADRAO*/{}", json.dumps({"mat": MAT_PADRAO})))
html = trocar(r'</body>', script + '\n</body>', html)

destino = os.path.join(RAIZ, ARQUIVO)
with open(destino, "w", encoding="utf-8") as f:
    f.write(html)
print("OK:", destino, f"({len(html) // 1024} KB)")
