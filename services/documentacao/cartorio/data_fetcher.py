import math
from database.connection import execute_query
from services.documentacao.cartorio.utils import calcular_azimute_e_distancia

def obter_dados_comuns(lev_id: int, matricula_id: int) -> dict:
    """Carrega profissional, propriedade, matricula e proprietários com dados qualificados"""
    # 1. Levantamento e Profissional (Inclusão de suporte a TRT persistente no banco)
    query_lev = """
        SELECT l.propriedade_id, l.profissional_id, l.numero_trt as lev_numero_trt, l.data_trt as lev_data_trt,
               p.nome as nome_profissional, p.registro as registro_profissional, 
               p.endereco as endereco_profissional, p.codigo_credenciado, p.formacao as formacao_profissional, p.conselho as conselho_profissional,
               p.nacionalidade as nacionalidade_profissional, p.cpf as cpf_profissional, p.rg as rg_profissional, p.endereco_residencial as endereco_residencial_profissional
        FROM levantamentos l
        JOIN profissionais p ON l.profissional_id = p.id
        WHERE l.id = ?
    """
    row_lev = execute_query(query_lev, params=(lev_id,), fetch_one=True)
    if not row_lev:
        raise ValueError(f"Levantamento ID {lev_id} não encontrado.")
    lev_data = dict(row_lev)
    prop_id = lev_data["propriedade_id"]

    # 2. Propriedade
    row_prop = execute_query(
        "SELECT id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir FROM propriedades WHERE id = ?",
        params=(prop_id,),
        fetch_one=True
    )
    if not row_prop:
        raise ValueError(f"Propriedade com ID {prop_id} não encontrada.")
    prop_data = dict(row_prop)

    # 3. Matrícula
    row_mat = execute_query(
        """
        SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
               m.valor_itr, m.denominacao, m.georreferenciamento
        FROM matriculas m
        JOIN propriedades pr ON m.propriedade_id = pr.id
        WHERE m.id = ? AND m.propriedade_id = ?
        """,
        params=(matricula_id, prop_id),
        fetch_one=True
    )
    if not row_mat:
        raise ValueError(f"Matrícula ID {matricula_id} não encontrada para esta propriedade.")
    mat_data = dict(row_mat)

    # 4. Proprietários
    rows_owners = execute_query(
        """
        SELECT c.id as cliente_id, p.id as pessoa_id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.estado_civil, p.regime_bens, 
               p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, p.genero_conjuge, p.nacionalidade_conjuge, p.profissao_conjuge,
               p.profissao, p.nacionalidade, p.endereco_completo, c.cidade, c.estado, c.cep, c.sexo, c.email, c.telefone
        FROM propriedade_clientes pc
        JOIN clientes c ON pc.cliente_id = c.id
        JOIN pessoas p ON c.pessoa_id = p.id
        WHERE pc.propriedade_id = ?
        ORDER BY pc.percentual_participacao DESC, c.id ASC
        """,
        params=(prop_id,),
        fetch_all=True
    )
    owners = [dict(o) for o in rows_owners]

    return {
        "lev": lev_data,
        "prop": prop_data,
        "mat": mat_data,
        "owners": owners
    }


def obter_segmentos_detalhados_confrontante(matricula_id: int, confrontante_id: int) -> list[dict]:
    """Busca e retorna os segmentos de confrontação ordenados com dados topográficos e geométricos completos"""
    query = """
        SELECT s.tipo_limite_sigef, s.metodo_posicionamento_sigef,
               pi.nome_vertice as ini_nome, pi.lat as ini_lat, pi.lon as ini_lon, pi.ordem_caminhamento as ini_ordem,
               pf.nome_vertice as fim_nome, pf.lat as fim_lat, pf.lon as fim_lon
        FROM segmentos s
        JOIN pontos pi ON s.ponto_inicio_id = pi.id
        JOIN pontos pf ON s.ponto_fim_id = pf.id
        WHERE s.matricula_id = ? AND s.confrontante_id = ?
    """
    rows = execute_query(query, params=(matricula_id, confrontante_id), fetch_all=True)
    segs = [dict(r) for r in rows]
    segs.sort(key=lambda x: x["ini_ordem"] if x["ini_ordem"] is not None else 0)
    return segs


def gerar_tabela_divisas_html(matricula_id: int, confrontante_id: int) -> str:
    """Gera uma tabela HTML estruturada com os dados de caminhamento técnico da divisa lindeira"""
    segmentos = obter_segmentos_detalhados_confrontante(matricula_id, confrontante_id)
    if not segmentos:
        return '<p class="text-xs text-red-500 italic">Nenhum segmento de divisa mapeado para este confrontante.</p>'

    linhas_html = ""
    for s in segmentos:
        lat_f = f"{s['ini_lat']:.7f}°" if s['ini_lat'] else "-"
        lon_f = f"{s['ini_lon']:.7f}°" if s['ini_lon'] else "-"
        
        # Calcular Azimute e Distância
        azimute_f, dist_f = calcular_azimute_e_distancia(s["ini_lat"], s["ini_lon"], s["fim_lat"], s["fim_lon"])
        
        linhas_html += f"""
        <tr class="border-b border-slate-200 text-[11px] text-slate-700 font-mono">
            <td class="px-3 py-1 font-bold text-slate-900">{s['ini_nome']}</td>
            <td class="px-3 py-1 font-bold text-slate-900">{s['fim_nome']}</td>
            <td class="px-3 py-1 text-right font-bold text-slate-900">{azimute_f}</td>
            <td class="px-3 py-1 text-right font-bold text-slate-900">{dist_f}</td>
            <td class="px-3 py-1 text-right">{lat_f}</td>
            <td class="px-3 py-1 text-right">{lon_f}</td>
        </tr>
        """

    table_html = f"""
    <div class="my-2 border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
        <table class="w-full text-left border-collapse bg-slate-50/50">
            <thead>
                <tr class="bg-slate-100 text-[10px] font-bold text-slate-600 uppercase border-b border-slate-300 tracking-wider">
                    <th class="px-3 py-1">De</th>
                    <th class="px-3 py-1">Para</th>
                    <th class="px-3 py-1 text-right">Azimute</th>
                    <th class="px-3 py-1 text-right">Distância</th>
                    <th class="px-3 py-1 text-right">Lat. Inicial</th>
                    <th class="px-3 py-1 text-right">Lon. Inicial</th>
                </tr>
            </thead>
            <tbody>
                {linhas_html}
            </tbody>
        </table>
    </div>
    """
    return table_html
