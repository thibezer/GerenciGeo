import html as _html
import json
import logging
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

from pyproj import Geod

from services.documentacao.erros import ErroDocumento

logger = logging.getLogger(__name__)

LACUNA_PADRAO = "_" * 20
LACUNA_TRT = "_" * 20
LACUNA_DATA = "____/____/________"


# ── Segurança de HTML ───────────────────────────────────────────────────────────

class Html(str):
    """Marca um texto como HTML já seguro (montado pelo gerador, com todos os valores escapados por `esc`)."""
    __slots__ = ()


def esc(valor) -> str:
    """Escapa qualquer valor de usuário/BD/query para interpolar em HTML. None vira vazio.
    Um `Html` já marcado não é escapado de novo."""
    if valor is None:
        return ""
    if isinstance(valor, Html):
        return str.__str__(valor)
    return _html.escape(str(valor), quote=True)


_RE_PLACEHOLDER = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")

# Os documentos dependem de CDN (Tailwind, Leaflet/unpkg, Google Fonts e tiles de satélite): sem internet o
# layout quebra ou o mapa sai em branco. Este aviso (só na tela, nunca impresso) deixa isso visível.
SCRIPT_AVISO_OFFLINE = """<script data-aviso-offline>
(function () {
  function aviso(msg) {
    var st = document.createElement('style');
    st.textContent = '@media print{[data-no-print-aviso]{display:none!important}}';
    document.head.appendChild(st);
    var d = document.createElement('div');
    d.setAttribute('data-no-print-aviso', '1');
    d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#fef2f2;color:#991b1b;border-bottom:2px solid #f87171;padding:8px 16px;font:bold 12px sans-serif;text-align:center';
    d.textContent = msg;
    document.body.appendChild(d);
  }
  window.addEventListener('load', function () {
    if (typeof tailwind === 'undefined') {
      aviso('Sem acesso aos estilos online (Tailwind CDN): conecte-se à internet e recarregue antes de imprimir; o documento pode sair sem formatação.');
    }
  });
})();
</script>
"""


def injetar_aviso_offline(html: str) -> str:
    if "data-aviso-offline" in html or "</body>" not in html:
        return html
    idx = html.rfind("</body>")
    return html[:idx] + SCRIPT_AVISO_OFFLINE + html[idx:]


def renderizar_template(template: str, valores: dict) -> str:
    """Substitui `{chave}` em UMA passada: um valor que contenha `{outra_chave}` não é re-substituído.
    Valores comuns são escapados; passe `Html(...)` para HTML já montado. Chaves ausentes em `valores`
    (CSS/JS do template, por exemplo) ficam intactas."""
    def _sub(m):
        chave = m.group(1)
        if chave in valores:
            return esc(valores[chave])
        return m.group(0)
    return injetar_aviso_offline(_RE_PLACEHOLDER.sub(_sub, template))


def json_para_script(obj) -> str:
    """JSON seguro para embutir dentro de <script>: neutraliza `</script>`, `<!--` e separadores de linha unicode."""
    texto = json.dumps(obj, ensure_ascii=False)
    return (
        texto.replace("</", "<\\/")
        .replace("<!--", "<\\!--")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )


# ── Texto e lacunas ─────────────────────────────────────────────────────────────

_PLACEHOLDERS_VAZIOS = {"", "NÃO INFORMADO", "NAO INFORMADO", "NONE", "NULL", "N/A", "-"}


def norm_texto(valor) -> str:
    """minúsculas, sem acento, sem '_' (para comparar rótulos/códigos de cadastro)."""
    sem_acento = unicodedata.normalize("NFKD", str(valor or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", sem_acento.lower().replace("_", " ")).strip()


def valor_preenchido(valor) -> str:
    """Texto limpo do valor, ou '' se vazio/placeholder ('Não informado', 'None', ...)."""
    if valor is None:
        return ""
    texto = str(valor).strip()
    return "" if texto.upper() in _PLACEHOLDERS_VAZIOS else texto


def valor_ou_lacuna(valor, tamanho: int = 24) -> str:
    """Valor ESCAPADO ou uma linha de preenchimento ('____') quando faltar."""
    texto = valor_preenchido(valor)
    return esc(texto) if texto else "_" * tamanho


def lacuna(tamanho: int = 24) -> str:
    return "_" * tamanho


# ── Datas e números ─────────────────────────────────────────────────────────────

def interpretar_data(valor, campo: str = "data") -> date | None:
    """Aceita AAAA-MM-DD (com ou sem hora) e dd/mm/aaaa. Vazio -> None; inválido -> ErroDocumento (422)."""
    texto = valor_preenchido(valor)
    if not texto:
        return None
    candidato = texto[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", texto) else texto
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(candidato, fmt).date()
        except ValueError:
            continue
    raise ErroDocumento(f"{campo} inválida ('{texto[:30]}'): use AAAA-MM-DD ou dd/mm/aaaa.")


def formatar_data_br(valor, campo: str = "data", lacuna_se_vazio: str = LACUNA_DATA) -> str:
    dt = interpretar_data(valor, campo)
    return dt.strftime("%d/%m/%Y") if dt else lacuna_se_vazio


def formatar_numero_br(valor, casas: int = 2, vazio: str = "") -> str:
    """12345.678 -> '12.345,68'. None/inválido -> `vazio`."""
    if valor is None or valor == "":
        return vazio
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return vazio
    return f"{numero:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def formatar_area_ha(valor, casas: int = 4, vazio: str = "____________") -> str:
    return formatar_numero_br(valor, casas, vazio)


def resolver_trt(numero_trt, data_trt, lev_numero=None, lev_data=None, obrigatorio: bool = False) -> tuple[str, str]:
    """Resolve (numero, data_formatada) da TRT.
    - número: parâmetro > valor salvo no levantamento > lacuna (ou 422 quando `obrigatorio`);
    - data: parâmetro (inválido -> 422) > valor salvo (inválido é ignorado com aviso) > lacuna."""
    numero = valor_preenchido(numero_trt) or valor_preenchido(lev_numero)
    if not numero:
        if obrigatorio:
            raise ErroDocumento("Informe o número da TRT/ART para gerar este documento.")
        numero = LACUNA_TRT
    data_param = valor_preenchido(data_trt)
    if data_param:
        data_f = formatar_data_br(data_param, "Data da TRT")
    else:
        try:
            data_f = formatar_data_br(lev_data, "Data da TRT")
        except ErroDocumento:
            logger.warning("Data de TRT salva no levantamento está em formato inválido; usando lacuna.")
            data_f = LACUNA_DATA
    return numero, data_f


_MESES = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril", 5: "maio", 6: "junho",
    7: "julho", 8: "agosto", 9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def obter_data_extenso(data: date | datetime | None = None) -> str:
    """Retorna a data (padrão: hoje) por extenso, por exemplo '4 de agosto de 2026'."""
    ref = data or datetime.now()
    return f"{ref.day} de {_MESES[ref.month]} de {ref.year}"


_EXTENSOS_PARCELAS = {
    2: "duas", 3: "três", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez",
    11: "onze", 12: "doze", 13: "treze", 14: "quatorze", 15: "quinze", 16: "dezesseis", 17: "dezessete",
    18: "dezoito", 19: "dezenove", 20: "vinte",
}
PARCELAS_MIN, PARCELAS_MAX = 2, 20


def extenso_parcelas(n) -> str:
    """'3' -> '3 (três)'. Aceita 2..20; fora disso ErroDocumento (não imprime '0 (0)')."""
    try:
        val = int(str(n).strip())
    except (TypeError, ValueError):
        raise ErroDocumento(f"Quantidade de parcelas inválida: '{n}'. Informe um número inteiro entre {PARCELAS_MIN} e {PARCELAS_MAX}.")
    if val not in _EXTENSOS_PARCELAS:
        raise ErroDocumento(f"Quantidade de parcelas fora do intervalo permitido ({PARCELAS_MIN} a {PARCELAS_MAX}): {val}.")
    return f"{val} ({_EXTENSOS_PARCELAS[val]})"


# ── Cadastro: CPF/CNPJ, RG, regime de bens ───────────────────────────────────────

def calcular_azimute_e_distancia(ini_lat, ini_lon, fim_lat, fim_lon) -> tuple[str, str]:
    """Calcula o azimute e a distância entre dois pontos geodésicos.

    Parameters
    ----------
    ini_lat, ini_lon: float
        Latitude e longitude do ponto inicial.
    fim_lat, fim_lon: float
        Latitude e longitude do ponto final.
    Returns
    -------
    tuple[str, str]
        Azimute formatado e distância em metros como string.
    """
    try:
        # Usar pyproj.Geod com elipsoide GRS80 (SIRGAS 2000) para cálculo geodésico rigoroso 2D (elipsoidal)
        # Isso remove as distorções do fator de escala UTM (k) e bate perfeitamente com os cálculos do SIGEF.
        geod = Geod(ellps="GRS80")
        az_ida, _, distancia = geod.inv(ini_lon, ini_lat, fim_lon, fim_lat)

        distancia_str = f"{distancia:.2f} m"

        # Ajusta azimute para a faixa 0-360
        az_deg = az_ida % 360.0

        # Formatar azimute no padrão GMS (Graus, Minutos e Segundos)
        graus = int(az_deg)
        minutos_dec = (az_deg - graus) * 60.0
        minutos = int(minutos_dec)
        segundos = (minutos_dec - minutos) * 60.0

        # Proteção clássica para arredondamento de segundos
        if segundos >= 59.5:
            segundos = 0.0
            minutos += 1
            if minutos >= 60:
                minutos = 0
                graus = (graus + 1) % 360

        azimute_str = f"{graus}°{minutos:02d}'{segundos:02.0f}\""

        return azimute_str, distancia_str
    except Exception as e:
        logger.warning(f"Erro ao calcular azimute/distância geodésica do segmento: {e}")
        return "-", "-"


_CACHE_TEMPLATES: dict = {}


def carregar_template(nome_arquivo: str) -> str:
    """Carrega o conteúdo de um template HTML da pasta `templates/` (cache por data de modificação:
    o lote de anuências não relê o disco a cada confrontante, mas edições no arquivo valem na hora)."""
    project_root = Path(__file__).resolve().parents[3]
    caminho_template = project_root / "templates" / nome_arquivo
    try:
        mtime = caminho_template.stat().st_mtime_ns
        em_cache = _CACHE_TEMPLATES.get(nome_arquivo)
        if em_cache and em_cache[0] == mtime:
            return em_cache[1]
        conteudo = caminho_template.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.error(f"Template not found: {caminho_template}")
        raise
    _CACHE_TEMPLATES[nome_arquivo] = (mtime, conteudo)
    return conteudo


def apenas_digitos(valor) -> str:
    return "".join(ch for ch in str(valor or "") if ch.isdigit())


def eh_cnpj(valor) -> bool:
    return len(apenas_digitos(valor)) == 14


def formatar_cpf(valor) -> str:
    """Aplica a máscara ###.###.###-## em números puros de CPF (ou ##.###.###/####-## de CNPJ)."""
    if not valor:
        return ""
    nums = apenas_digitos(valor)
    if len(nums) == 11:
        return f"{nums[:3]}.{nums[3:6]}.{nums[6:9]}-{nums[9:]}"
    elif len(nums) == 14:
        return f"{nums[:2]}.{nums[2:5]}.{nums[5:8]}/{nums[8:12]}-{nums[12:]}"
    return str(valor)


def formatar_rg(valor) -> str:
    """Formata e limpa o campo de RG/Inscrição Estadual."""
    if not valor:
        return ""
    return str(valor).strip()


def formatar_regime_bens_extenso(regime) -> str:
    """Normaliza as variantes do cadastro (códigos 'comunhao_parcial', rótulos 'Comunhão Parcial de Bens',
    'separacao_total'...) para um único rótulo por extenso. Vazio fica vazio: nunca presume um regime."""
    r = norm_texto(valor_preenchido(regime))
    if not r:
        return ""
    if "universal" in r:
        return "Comunhão Universal de Bens"
    if "parcial" in r:
        return "Comunhão Parcial de Bens"
    if "obrigat" in r:
        return "Separação Obrigatória de Bens"
    if "separ" in r:
        return "Separação Total de Bens"
    if "aquest" in r or "participa" in r:
        return "Participação Final nos Aquestos"
    return str(regime).strip().replace("_", " ")


UF_NOMES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará",
    "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná",
    "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina",
    "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins",
}


_UF_COM_ARTIGO = {
    "AC": "DO ACRE", "AL": "DE ALAGOAS", "AP": "DO AMAPÁ", "AM": "DO AMAZONAS", "BA": "DA BAHIA", "CE": "DO CEARÁ",
    "DF": "DO DISTRITO FEDERAL", "ES": "DO ESPÍRITO SANTO", "GO": "DE GOIÁS", "MA": "DO MARANHÃO",
    "MT": "DE MATO GROSSO", "MS": "DE MATO GROSSO DO SUL", "MG": "DE MINAS GERAIS", "PA": "DO PARÁ",
    "PB": "DA PARAÍBA", "PR": "DO PARANÁ", "PE": "DE PERNAMBUCO", "PI": "DO PIAUÍ", "RJ": "DO RIO DE JANEIRO",
    "RN": "DO RIO GRANDE DO NORTE", "RS": "DO RIO GRANDE DO SUL", "RO": "DE RONDÔNIA", "RR": "DE RORAIMA",
    "SC": "DE SANTA CATARINA", "SP": "DE SÃO PAULO", "SE": "DE SERGIPE", "TO": "DO TOCANTINS",
}


def estado_com_artigo(uf) -> str:
    """'DO PARANÁ', 'DE SÃO PAULO'... (maiúsculas) a partir da UF real; sem UF, lacuna."""
    return _UF_COM_ARTIGO.get(valor_preenchido(uf).upper(), "DE " + "_" * 12)


def uf_exibicao(uf) -> str:
    """UF real da propriedade em maiúsculas; sem UF cadastrada, uma lacuna (nunca presume 'PR')."""
    texto = valor_preenchido(uf).upper()
    return texto if texto else "__"


def nome_estado(uf) -> str:
    return UF_NOMES.get(valor_preenchido(uf).upper(), "")
