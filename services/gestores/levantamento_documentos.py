import re
import math
import logging
from database.connection import DatabaseManager, execute_query
from services.gestores.cliente_manager import ClienteManager, validar_cpf_cnpj
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from services.processamento.geoprocessamento import geodesic_to_ecef, ecef_to_geodesic, calcular_zona_utm_segura
from utils.transformer_cache import get_transformer

logger = logging.getLogger(__name__)

def gerar_requerimento_html(levantamento_id: int, matricula_id: int) -> str:
    """Gera um requerimento em HTML formatado para retificação de registro endereçado ao CRI"""
    lev_row = execute_query(
        "SELECT l.*, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
        params=(levantamento_id,), fetch_one=True
    )
    if not lev_row:
        raise ValueError("Levantamento não localizado.")
    lev_data = dict(lev_row)

    prop_row = execute_query("SELECT * FROM propriedades WHERE id = ?", params=(lev_data["propriedade_id"],), fetch_one=True)
    prop_data = dict(prop_row) if prop_row else {}

    mat_row = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(matricula_id,), fetch_one=True)
    if not mat_row:
        raise ValueError("Matrícula não localizada.")
    mat_data = dict(mat_row)

    cli_rows = execute_query(
        "SELECT c.*, pc.percentual_participacao FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
        params=(lev_data["propriedade_id"],), fetch_all=True
    )
    clientes = [dict(c) for c in cli_rows]

    cli_html = ""
    for c in clientes:
        civil_info = f", {c['estado_civil']}" if c['estado_civil'] else ""
        prof_info = f", {c['profissao']}" if c['profissao'] else ""
        conj_info = ""
        if c['estado_civil'] and c['estado_civil'].upper() == "CASADO":
            conj_info = f" casado sob o regime de {c['regime_bens']} com {c['nome_conjuge']}, portador(a) do CPF nº {c['cpf_conjuge']} e RG nº {c['rg_conjuge']}"

        cli_html += f"<p><b>{c['nome_completo']}</b>, nacionalidade {c['nacionalidade']}{civil_info}{prof_info}{conj_info}, portador(a) do CPF/CNPJ nº {c['cpf_cnpj']} e RG nº {c['rg_ie']}, residente e domiciliado(a) em {c['endereco_completo']}, {c['cidade']}-{c['estado']}.</p>"

    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Requerimento de Retificação de Área - {prop_data.get('nome_propriedade', 'Imóvel')}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body {{ font-family: 'Inter', 'Segoe UI', 'Tahoma', sans-serif; color: #2d3748; line-height: 1.6; padding: 40px; background-color: #fff; }}
            .page {{ max-width: 800px; margin: 0 auto; }}
            .header {{ text-align: center; margin-bottom: 40px; border-bottom: 2px solid #00f5a0; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 700; color: #0c1510; text-transform: uppercase; letter-spacing: 2px; }}
            .logo span {{ color: #00f5a0; }}
            .document-title {{ font-size: 18px; font-weight: 700; text-transform: uppercase; margin-top: 15px; color: #1a202c; }}
            .address {{ font-weight: 700; margin-top: 30px; margin-bottom: 30px; }}
            .content {{ text-align: justify; font-size: 15px; }}
            .footer-signature {{ margin-top: 60px; page-break-inside: avoid; }}
            .sig-line {{ width: 320px; border-top: 1px solid #4a5568; margin: 50px auto 10px auto; text-align: center; }}
            .sig-title {{ text-align: center; font-size: 13px; color: #718096; font-weight: 600; }}
            .btn-print {{ background-color: #00f5a0; color: #0c1510; padding: 10px 20px; font-weight: 700; border-radius: 4px; border: none; cursor: pointer; font-family: inherit; transition: opacity 0.2s; }}
            .btn-print:hover {{ opacity: 0.8; }}
            @media print {{ body {{ padding: 0; }} .no-print {{ display: none; }} }}
        </style>
    </head>
    <body>
        <div class="page">
            <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
            </div>
            <div class="header">
                <div class="logo">Gerenci<span>Geo</span></div>
                <div class="document-title">Requerimento de Retificação de Registro de Imóvel Rural</div>
            </div>
            <div class="address">
                AO ILUSTRÍSSIMO OFICIAL DO CARTÓRIO DE REGISTRO DE IMÓVEIS DE {str(mat_data.get('cri_comarca') or prop_data.get('municipio', '')).upper()}/{prop_data.get('uf', '').upper()}
            </div>
            <div class="content">
                <p>Senhor Oficial,</p>
                {cli_html}
                <p>Proprietários do imóvel rural denominado <b>{prop_data.get('nome_propriedade')}</b>, localizado no município de {prop_data.get('municipio')}-{prop_data.get('uf')}, com área registrada de <b>{mat_data.get('area_ha')} ha</b>, sob a Matrícula nº <b>{mat_data.get('numero_matricula')}</b> do {mat_data.get('cri_circunscricao') or 'CRI local'}, registrada no {mat_data.get('livro_registro') or 'Livro 2-RG'}, {mat_data.get('folha_registro') or 'Folha correspondente'}, vêm respeitosamente requerer a Vossa Senhoria, com fundamento no Artigo 213, Inciso II da Lei Federal nº 6.015 de 31 de dezembro de 1973 (Lei dos Registros Públicos), com as alterações introduzidas pela Lei nº 10.267 de 28 de agosto de 2001, a <b>RETIFICAÇÃO DE REGISTRO</b> de seu imóvel rural.</p>

                <p>O presente pedido justifica-se por haver divergência nas dimensões perimetrais e na área do imóvel, estando a realidade de divisa consolidada de campo descrita nos trabalhos técnicos de georreferenciamento elaborados pelo Engenheiro/Responsável Técnico <b>{lev_data.get('nome_profissional')}</b>, credenciado perante o INCRA sob o código <b>{lev_data.get('codigo_credenciado')}</b>, conforme planta, memorial descritivo e anexo de confrontações anexados à presente.</p>

                <p>Os confrontantes anuíram expressamente aos limites e divisas retificados, tendo assinado individualmente as respectivas cartas de anuência anexadas, com firmas reconhecidas in cartório.</p>

                <p>Nestes termos, pede e espera deferimento.</p>

                <p style="margin-top: 40px; text-align: right;">{prop_data.get('municipio')}-{prop_data.get('uf')}, _____ de ____________________ de 20___.</p>
            </div>

            <div class="footer-signature">
                <div class="sig-line"></div>
                <div class="sig-title">Requerente Proprietário</div>
            </div>
        </div>
    </body>
    </html>
    """
    return html_content

def gerar_termo_anuencia_html(levantamento_id: int, confrontante_id: int) -> str:
    """Gera Carta de Anuência preenchida com a ordenação perimetral dos segmentos lindeiros daquele confrontante em HTML"""
    conf_row = execute_query("SELECT * FROM confrontantes WHERE id = ?", params=(confrontante_id,), fetch_one=True)
    if not conf_row:
        raise ValueError("Confrontante não localizado.")
    conf = dict(conf_row)

    lev_row = execute_query(
        "SELECT l.*, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
        params=(levantamento_id,), fetch_one=True
    )
    if not lev_row:
        raise ValueError("Levantamento não localizado.")
    lev_data = dict(lev_row)

    prop_row = execute_query("SELECT * FROM propriedades WHERE id = ?", params=(lev_data["propriedade_id"],), fetch_one=True)
    prop_data = dict(prop_row) if prop_row else {}

    cli_rows = execute_query(
        "SELECT c.* FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
        params=(lev_data["propriedade_id"],), fetch_all=True
    )
    clientes = [dict(c) for c in cli_rows]

    # Busca segmentos lindeiros
    seg_rows = execute_query(
        """
        SELECT s.*, p_ini.nome_vertice as nome_p_ini, p_ini.lat as lat_ini, p_ini.lon as lon_ini,
                    p_fim.nome_vertice as nome_p_fim, p_fim.lat as lat_fim, p_fim.lon as lon_fim
        FROM segmentos s
        JOIN pontos p_ini ON s.ponto_inicio_id = p_ini.id
        JOIN pontos p_fim ON s.ponto_fim_id = p_fim.id
        WHERE s.levantamento_id = ? AND s.confrontante_id = ?
        """,
        params=(levantamento_id, confrontante_id), fetch_all=True
    )

    if not seg_rows:
        raise ValueError("Nenhum segmento de divisa associado a este confrontante para este levantamento.")

    segmentos = [dict(s) for s in seg_rows]

    divisas_html = ""
    total_dist = 0.0

    lon0 = segmentos[0]["lon_ini"]
    zona_utm = int((lon0 + 180) / 6) + 1

    transformer = get_transformer("epsg:4674", f"epsg:319{60 + zona_utm}", always_xy=True)

    for s in segmentos:
        e_ini, n_ini = transformer.transform(s["lon_ini"], s["lat_ini"])
        e_fim, n_fim = transformer.transform(s["lon_fim"], s["lat_fim"])

        de = e_fim - e_ini
        dn = n_fim - n_ini
        dist = math.sqrt(de**2 + dn**2)
        total_dist += dist

        az = math.degrees(math.atan2(de, dn)) % 360.0

        graus = int(az)
        minutos_dec = (az - graus) * 60.0
        minutos = int(minutos_dec)
        segundos = (minutos_dec - minutos) * 60.0
        az_format = f"{graus}° {minutos:02d}' {segundos:04.1f}\""

        divisas_html += f"<tr><td>{s['nome_p_ini']}</td><td>{s['nome_p_fim']}</td><td>{az_format}</td><td>{dist:.2f} m</td><td>{s['tipo_limite_sigef']}</td><td>{s['metodo_posicionamento_sigef']}</td></tr>"

    proprietarios_nomes = ", ".join([c["nome_completo"] for c in clientes])

    conj_info = ""
    if conf.get("estado_civil") and conf.get("estado_civil").upper() == "CASADO":
        conj_info = f" e seu cônjuge <b>{conf.get('nome_conjuge')}</b>, nacionalidade {conf.get('nacionalidade') or 'brasileiro(a)'}, portador(a) do CPF nº {conf.get('cpf_conjuge')} e RG nº {conf.get('rg_conjuge')},"

    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Termo de Anuência de Confrontante - {conf['nome']}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body {{ font-family: 'Inter', 'Segoe UI', 'Tahoma', sans-serif; color: #2d3748; line-height: 1.6; padding: 40px; }}
            .page {{ max-width: 800px; margin: 0 auto; }}
            .header {{ text-align: center; margin-bottom: 40px; border-bottom: 2px solid #00f5a0; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 700; color: #0c1510; text-transform: uppercase; }}
            .logo span {{ color: #00f5a0; }}
            .document-title {{ font-size: 18px; font-weight: 700; text-transform: uppercase; margin-top: 15px; color: #1a202c; }}
            .content {{ text-align: justify; font-size: 14px; margin-bottom: 30px; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; font-size: 13px; }}
            th, td {{ border: 1px solid #cbd5e0; padding: 10px; text-align: center; }}
            th {{ background-color: #f7fafc; font-weight: 700; }}
            .signatures {{ display: flex; justify-content: space-between; margin-top: 60px; page-break-inside: avoid; }}
            .sig-block {{ width: 45%; text-align: center; }}
            .sig-line {{ border-top: 1px solid #4a5568; margin-top: 40px; margin-bottom: 10px; }}
            .sig-title {{ font-size: 12px; color: #718096; font-weight: 600; }}
            .btn-print {{ background-color: #00f5a0; color: #0c1510; padding: 10px 20px; font-weight: 700; border-radius: 4px; border: none; cursor: pointer; font-family: inherit; }}
            @media print {{ body {{ padding: 0; }} .no-print {{ display: none; }} }}
        </style>
    </head>
    <body>
        <div class="page">
            <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
            </div>
            <div class="header">
                <div class="logo">Gerenci<span>Geo</span></div>
                <div class="document-title">Carta de Anuência de Limites de Confrontação</div>
            </div>
            <div class="content">
                <p>Pelo presente instrumento particular de anuência e reconhecimento de divisas, eu <b>{conf['nome']}</b>, nacionalidade {conf.get('nacionalidade') or 'brasileiro(a)'}, {conf.get('estado_civil') or 'estado civil não informado'}, {conf.get('profissao') or 'profissão não informada'}, portador(a) do CPF nº {conf.get('cpf_cnpj')} e RG nº {conf.get('rg') or 'não informado'}, residente e domiciliado(a) em {conf.get('endereco_completo') or 'endereço não informado'}{conj_info} na qualidade de confrontante e proprietário legal de área lindeira à propriedade denominada <b>{prop_data.get('nome_propriedade')}</b>, declaro expressamente e sob responsabilidade jurídica:</p>

                <p>1. Que **ANUO E CONCORDOS** de forma irrestrita com as novas divisas, marcos e coordenadas levantadas e descritas no perímetro da propriedade de <b>{proprietarios_nomes}</b>, referente ao perímetro delimitado pelos segmentos de divisa listados na tabela abaixo, cujo trabalho de demarcação de campo foi executado em conformidade com as normas do INCRA/SIGEF.</p>

                <table>
                    <thead>
                        <tr>
                            <th>De Vértice</th>
                            <th>Para Vértice</th>
                            <th>Azimute</th>
                            <th>Distância</th>
                            <th>Tipo Limite</th>
                            <th>Método Pos.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {divisas_html}
                    </tbody>
                </table>

                <p>2. A soma linear de confrontação corresponde a uma extensão perimetral total de <b>{total_dist:.2f} metros</b> de divisa retificada.</p>
                <p>3. Reconheço e atesto que as cercas ou marcos instalados neste trecho representam fielmente os limites históricos consolidados da posse e propriedade, não havendo invasões, sobreposições ou litígios de divisa de qualquer natureza.</p>

                <p style="margin-top: 40px; text-align: right;">{prop_data.get('municipio')}-{prop_data.get('uf')}, _____ de ____________________ de 20___.</p>
            </div>

            <div class="signatures">
                <div class="sig-block">
                    <div class="sig-line"></div>
                    <div class="sig-title">Confrontante Proprietário</div>
                    <div class="sig-title">{conf['nome']}</div>
                </div>
                {"<div class='sig-block'><div class='sig-line'></div><div class='sig-title'>Cônjuge do Confrontante</div><div class='sig-title'>" + conf.get('nome_conjuge', '') + "</div></div>" if conj_info else ""}
            </div>
        </div>
    </body>
    </html>
    """
    return html_content
