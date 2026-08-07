# -*- coding: utf-8 -*-
"""
converterrinex.py
==================
Automação de conversão de arquivos GNS (Hi-Target) para RINEX, usando o
software Hi-Target Geomatics Office (HGO) via UI automation (pywinauto).

ATENÇÃO — NATUREZA FRÁGIL DESTE MÓDULO
---------------------------------------
Este script controla um programa de terceiros através da interface gráfica
(cliques, atalhos de teclado, leitura de controles por auto_id/título).
Qualquer atualização do HGO que mude IDs de controles, textos de diálogos,
posição de itens em um combobox, ou o tempo que a aplicação leva para
responder, pode quebrar esta automação. Sempre que o HGO for atualizado,
rode uma conversão de teste manual (com log em DEBUG) antes de usar em
produção.

Todos os pontos que normalmente exigem ajuste fino (tempos de espera,
nome do sistema de coordenadas, offsets de clique, timeouts) foram
centralizados na seção CONFIGURAÇÃO logo abaixo — comece por ali.
"""

import os
import time
import shutil
import logging
import subprocess
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import List, Optional, Union

from pywinauto.application import Application
from pywinauto.keyboard import send_keys
from pywinauto import timings
import pywinauto.mouse as mouse

# ======================================================================
# LOGGING
# ----------------------------------------------------------------------
# Trocamos os prints por um logger de verdade. Isso permite:
#   - Ligar/desligar detalhes (DEBUG) sem mexer no código.
#   - Redirecionar para um arquivo de log em produção (útil pois falhas de
#     UI automation costumam ser esporádicas e difíceis de reproduzir).
# Para ver mais detalhes durante testes, troque o nível para logging.DEBUG.
# ======================================================================
logger = logging.getLogger("converterrinex")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] converterrinex: %(message)s")
    )
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)  # <-- mude para logging.DEBUG ao investigar falhas

# --- Log em arquivo, à prova de configuração externa ------------------------
# IMPORTANTE: se este módulo for importado dentro de uma aplicação maior
# (ex: FastAPI/uvicorn do GerenciGeo), é comum o framework chamar
# `logging.config.dictConfig(...)` com `disable_existing_loggers=True` na
# inicialização — isso DESATIVA silenciosamente qualquer logger criado
# antes disso, inclusive este. Foi exatamente o que aconteceu na primeira
# tentativa: nenhuma linha de log apareceu no terminal, só os prints de
# outro módulo.
#
# Para não depender de como o app hospedeiro configura logging, gravamos
# sempre em um arquivo próprio, e reforçamos (a cada chamada de
# `converter_rinex`) que o logger não está desabilitado.
_PASTA_LOGS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs_converterrinex")
os.makedirs(_PASTA_LOGS, exist_ok=True)
_CAMINHO_LOG_ARQUIVO = os.path.join(_PASTA_LOGS, "converterrinex.log")

if not any(isinstance(h, logging.FileHandler) for h in logger.handlers):
    _file_handler = logging.FileHandler(_CAMINHO_LOG_ARQUIVO, encoding="utf-8")
    _file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] converterrinex: %(message)s")
    )
    logger.addHandler(_file_handler)

logger.propagate = True  # garante que o handler de nível superior também receba, se houver


# ======================================================================
# CONFIGURAÇÃO / CONSTANTES AJUSTÁVEIS
# ----------------------------------------------------------------------
# Ajustes finos devem começar por aqui. Evite mexer na lógica lá embaixo
# se o problema puder ser resolvido só mudando um destes valores.
# ======================================================================

CAMINHO_EXE_PADRAO = r"C:\Program Files (x86)\Hi-Target Geomatics Office\bin\HGO.exe"

# --- Sistema de coordenadas ------------------------------------------------
# NOTA IMPORTANTE: a seleção do sistema de coordenadas no HGO é feita hoje
# por CLIQUE FÍSICO em um item da lista suspensa, usando um deslocamento em
# pixels a partir do combobox (ver `_selecionar_sistema_coordenadas`).
# Isso é FRÁGIL: depende da escala/DPI do Windows e da ordem dos itens na
# lista, e está fixo em uma única zona UTM (22S) — o mesmo tipo de problema
# que você já corrigiu no importador SIGEF (zona hardcoded ao invés de
# inferida dinamicamente). Se HGO permitir digitar/filtrar o nome no
# combobox, prefira usar `cb_coord.select(nome)` (bloco já tentado como
# fallback) em vez do clique por coordenada — é bem mais robusto.
SISTEMA_COORDENADAS_ALVO = "SIRGAS_UTM22S"  # <-- AJUSTE AQUI se mudar de fuso/datum
OFFSET_Y_ITEM_COMBOBOX_PX = 49  # deslocamento vertical do item desejado na lista

# --- Propriedades do projeto ------------------------------------------------
QTD_CARACTERES_NOME_PONTO = "8"  # opção da aba "Avançado" (cbZHDPtNameType)

# --- Timeouts (segundos) ----------------------------------------------------
TIMEOUT_JANELA_PRINCIPAL = 10
TIMEOUT_DIALOGO_PADRAO = 5
TIMEOUT_IMPORTACAO_ARQUIVOS = 20      # espera dinâmica pelos .zsd importados
TIMEOUT_CONVERSAO_RINEX = 120         # espera dinâmica pelos arquivos RINEX gerados
INTERVALO_POLL = 0.3                  # intervalo entre checagens nas esperas dinâmicas
TEMPO_ESTABILIDADE_ARQUIVO = 0.8      # tempo sem mudança de tamanho p/ considerar "pronto"

# --- Extensões de saída RINEX ----------------------------------------------
# Ajuste conforme o que o HGO realmente grava (varia por versão/firmware).
# Usado tanto para achar os arquivos prontos quanto para copiá-los ao final.
EXTENSOES_RINEX = (".o", ".n", ".g", ".obs", ".nav")

# --- Limpeza -----------------------------------------------------------------
LIMPAR_PROJETO_TEMPORARIO = True   # apaga a pasta proj_hgo_auto_* ao final
MATAR_OUTRAS_INSTANCIAS_HGO = False  # ver aviso na função _matar_hgo_previos()

# --- Diagnóstico de performance ---------------------------------------------
# O script original alternava entre Timings.fast() (no início) e
# Timings.defaults() (depois da importação dos arquivos), deixando as
# etapas finais (conversão, navegação por menu/grid) rodando com timings
# de retry/espera mais lentos do pywinauto. Isso foi feito originalmente
# para dar mais estabilidade ao diálogo nativo "Abrir" do Windows, mas pode
# ser uma das causas da lentidão relatada. Deixei como TOGGLE para você
# testar A/B: rode uma vez com True (comportamento original) e outra com
# False, comparando os tempos por etapa no log.
RESTAURAR_TIMINGS_PADRAO_APOS_IMPORTACAO = True

# Configura tempos rápidos globais do pywinauto (evita delays padrão do Windows)
timings.Timings.fast()
timings.Timings.after_clickinput_wait = 0.05
timings.Timings.after_click_wait = 0.05
timings.Timings.after_setcursorpos_wait = 0.01


# ======================================================================
# RESULTADO DA CONVERSÃO
# ----------------------------------------------------------------------
# Antes a função só retornava True/False. Isso obrigava quem chama a
# adivinhar o que deu certo/errado. Agora devolvemos um objeto com os
# detalhes úteis para logging, UI e decisões no backend (FastAPI).
# ======================================================================
@dataclass
class ResultadoConversao:
    sucesso: bool
    arquivos_convertidos: List[str] = field(default_factory=list)
    mensagem_erro: Optional[str] = None
    pasta_projeto_temporario: Optional[str] = None


# ======================================================================
# UTILITÁRIOS DE CLIPBOARD (mantido por compatibilidade / uso futuro)
# ----------------------------------------------------------------------
# Esta função não é usada no fluxo atual de conversão RINEX. Foi mantida
# porque pode ser reaproveitada em outras automações do GerenciGeo que
# colam texto em campos do HGO. Se não for necessária em nenhum lugar,
# considere removê-la para reduzir superfície de manutenção.
# ======================================================================
def set_clipboard_text(text: str) -> bool:
    """Define o conteúdo da área de transferência do Windows (texto Unicode)."""
    import ctypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    CF_UNICODETEXT = 13
    GMEM_MOVEABLE = 2

    if not user32.OpenClipboard(None):
        return False

    h_global = None
    try:
        user32.EmptyClipboard()
        text_bytes = text.encode("utf-16le") + b"\x00\x00"
        h_global = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(text_bytes))
        if not h_global:
            return False

        p_mem = kernel32.GlobalLock(h_global)
        if not p_mem:
            return False
        try:
            ctypes.memmove(p_mem, text_bytes, len(text_bytes))
        finally:
            kernel32.GlobalUnlock(h_global)

        # Após SetClipboardData, o sistema operacional assume a posse da
        # memória — não devemos liberá-la manualmente com GlobalFree.
        user32.SetClipboardData(CF_UNICODETEXT, h_global)
    except Exception as e:
        logger.debug("Falha ao definir clipboard: %s", e)
        return False
    finally:
        user32.CloseClipboard()
    return True


def _log_e_print(nivel, msg, *args):
    """
    Loga normalmente E imprime via print(flush=True) como rede de segurança.

    Existe porque, na prática, já vimos um caso em que o app hospedeiro
    (GerenciGeo/uvicorn) desabilitava o logger deste módulo silenciosamente
    (via disable_existing_loggers=True), fazendo TODO o rastro de tempo por
    etapa sumir do terminal. print() não sofre desse problema. Isso garante
    que, não importa a configuração de logging externa, você sempre vai ver
    pelo menos essas linhas no console/terminal onde o processo roda.
    """
    texto = msg % args if args else msg
    logger.log(nivel, texto)
    print(f"[converterrinex] {texto}", flush=True)


@contextmanager
def _cronometrar(nome_etapa: str):
    """
    Mede e loga (nível INFO) quanto tempo cada etapa da automação levou.

    Isso existe especificamente para diagnosticar lentidão: em vez de
    adivinhar qual sleep é o culpado, rode a conversão uma vez e olhe o
    log — a etapa com duração muito acima do esperado é o ponto a
    investigar. Etapas que "deveriam" ser rápidas (ex: menus que carregam
    quase instantaneamente na tela, como você relatou) mas aparecem com
    dezenas de segundos ou minutos no log indicam que o pywinauto está
    preso num retry/timeout interno, não que a etapa em si é lenta.
    """
    inicio = time.perf_counter()
    _log_e_print(logging.INFO, ">> Iniciando etapa: %s", nome_etapa)
    try:
        yield
    finally:
        duracao = time.perf_counter() - inicio
        nivel = logging.WARNING if duracao > 5 else logging.INFO
        _log_e_print(nivel, "<< Etapa '%s' concluída em %.2fs", nome_etapa, duracao)


# ======================================================================
# HELPERS INTERNOS
# ======================================================================
def _encontrar_controle(dialogo, auto_ids=(), titulos=(), control_type="Button"):
    """
    Procura um controle dentro de `dialogo` testando uma lista de possíveis
    auto_id e, se não achar, uma lista de possíveis títulos.

    Isso substitui os blocos duplicados de "tenta btOK, btnOK, OK..." que
    existiam repetidos em pelo menos dois pontos do script original.
    Retorna o wrapper do controle se encontrado e existente, senão None.
    """
    for auto_id in auto_ids:
        try:
            ctrl = dialogo.child_window(auto_id=auto_id, control_type=control_type)
            if ctrl.exists():
                return ctrl
        except Exception as e:
            logger.debug("Controle auto_id=%s não encontrado (%s)", auto_id, e)

    for titulo in titulos:
        try:
            ctrl = dialogo.child_window(title=titulo, control_type=control_type)
            if ctrl.exists():
                return ctrl
        except Exception as e:
            logger.debug("Controle title=%s não encontrado (%s)", titulo, e)

    return None


def _clicar_ou_atalho(controle, atalho_teclado: str):
    """Clica no controle se ele existir; caso contrário, usa o atalho de teclado."""
    if controle is not None:
        controle.set_focus()
        time.sleep(0.1)
        controle.invoke()
    else:
        logger.warning(
            "Botão não localizado via UI Automation, usando atalho '%s' como fallback.",
            atalho_teclado,
        )
        send_keys(atalho_teclado)


def _aguardar_arquivos_prontos(pasta, nomes_esperados, timeout, intervalo=INTERVALO_POLL,
                                tempo_estabilidade=TEMPO_ESTABILIDADE_ARQUIVO):
    """
    Espera dinamicamente até que todos os arquivos em `nomes_esperados`
    existam dentro de `pasta` E parem de crescer em tamanho (indicando que
    o HGO terminou de escrever, não apenas criou o arquivo).

    Retorna True se todos os arquivos ficaram prontos dentro do timeout,
    False caso contrário (quem chama decide se isso é fatal ou apenas um
    aviso).
    """
    inicio = time.time()
    while True:
        todos_existem = os.path.exists(pasta) and all(
            os.path.exists(os.path.join(pasta, nome)) for nome in nomes_esperados
        )

        if todos_existem:
            tamanhos_iniciais = {
                nome: os.path.getsize(os.path.join(pasta, nome)) for nome in nomes_esperados
            }
            time.sleep(tempo_estabilidade)
            tamanhos_finais = {
                nome: os.path.getsize(os.path.join(pasta, nome)) for nome in nomes_esperados
            }
            if tamanhos_iniciais == tamanhos_finais:
                return True

        if time.time() - inicio > timeout:
            return False

        time.sleep(intervalo)


def _matar_hgo_previos():
    """
    Encerra QUALQUER processo HGO.exe em execução no sistema.

    AVISO: isto afeta TODAS as janelas do HGO abertas no computador, não
    apenas a que este script controla. Se o usuário tiver outra sessão do
    HGO aberta com trabalho não salvo, ela será fechada à força.
    Por isso esta função só roda se `MATAR_OUTRAS_INSTANCIAS_HGO=True`.
    Deixe False (padrão) a menos que você tenha certeza de que não há
    outras instâncias legítimas em uso.
    """
    if not MATAR_OUTRAS_INSTANCIAS_HGO:
        logger.debug(
            "MATAR_OUTRAS_INSTANCIAS_HGO=False: não encerrando instâncias "
            "pré-existentes do HGO (podem conflitar com a automação)."
        )
        return
    logger.warning("Encerrando TODAS as instâncias de HGO.exe em execução...")
    subprocess.run(["taskkill", "/F", "/IM", "HGO.exe"], capture_output=True)


def _matar_processo_hgo(pid: int):
    """Encerra apenas o processo (e sua árvore de filhos) que ESTE script abriu."""
    try:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
    except Exception as e:
        logger.debug("Falha ao encerrar PID %s: %s", pid, e)


# ======================================================================
# ETAPAS DA AUTOMAÇÃO
# ----------------------------------------------------------------------
# O fluxo original era uma função monolítica. Quebrei em etapas nomeadas
# para facilitar ajuste fino: se o HGO mudar o diálogo de propriedades,
# por exemplo, você mexe só em `_configurar_propriedades_projeto`.
# ======================================================================

def _criar_projeto(janela, proj_name):
    """Abre o diálogo 'Novo Projeto' (Alt+F -> N) e confirma com o nome gerado."""
    send_keys("%f")
    time.sleep(0.4)
    send_keys("n")

    dlg_novo = janela.child_window(auto_id="frmNewProject", control_type="Window")
    dlg_novo.wait("ready", timeout=TIMEOUT_DIALOGO_PADRAO)

    tb_path = dlg_novo.child_window(auto_id="tbWorkPath", control_type="Edit")
    desktop_dir = os.path.normpath(os.path.abspath(tb_path.window_text()))
    proj_dir = os.path.normpath(os.path.abspath(os.path.join(desktop_dir, proj_name)))
    logger.info("Pasta de trabalho identificada: %s", desktop_dir)
    logger.info("Pasta do projeto temporário: %s", proj_dir)

    tb_name = dlg_novo.child_window(auto_id="tbProjectName", control_type="Edit")
    tb_name.set_edit_text(proj_name)
    time.sleep(0.2)

    btn_ok = _encontrar_controle(dlg_novo, auto_ids=["btOK", "btnOK", "OK"], titulos=["OK(O)"])
    _clicar_ou_atalho(btn_ok, "%o")

    return desktop_dir, proj_dir


def _configurar_propriedades_projeto(janela):
    """Abre (ou aguarda abrir) o diálogo de Propriedades e ajusta a aba Avançado."""
    time.sleep(0.5)
    dlg_prop = None
    try:
        dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
        dlg_prop.wait("ready", timeout=3.0)
        logger.debug("Diálogo de propriedades detectado automaticamente.")
    except Exception:
        logger.debug("Diálogo de propriedades não abriu sozinho, forçando via Alt+F -> P.")
        janela.set_focus()
        send_keys("%f")
        time.sleep(0.4)
        send_keys("p")
        dlg_prop = janela.child_window(auto_id="frmProjectSetting", control_type="Window")
        dlg_prop.wait("ready", timeout=TIMEOUT_DIALOGO_PADRAO)

    # NOTA: o título abaixo está sem cedilha ("Avancado"). Se a UI do HGO
    # usar "Avançado" (com ç) e o match do pywinauto for sensível a isso,
    # troque a string abaixo. Deixado assim por ser o valor original —
    # ajuste aqui se a automação travar nesta etapa.
    tab_avancado = dlg_prop.child_window(title="Avancado", control_type="TabItem")
    tab_avancado.select()
    time.sleep(0.3)

    cb_chars = dlg_prop.child_window(auto_id="cbZHDPtNameType", control_type="ComboBox")
    try:
        cb_chars.select(QTD_CARACTERES_NOME_PONTO)
        time.sleep(0.3)
    except Exception as e:
        logger.debug("cb_chars.select() falhou (%s), usando fallback de teclado.", e)
        cb_chars.set_focus()
        send_keys(f"{QTD_CARACTERES_NOME_PONTO}{{ENTER}}", pause=0.01)
        time.sleep(0.3)

    btn_prop_ok = _encontrar_controle(dlg_prop, auto_ids=["btOK", "btnOK", "OK"], titulos=["OK(O)"])
    _clicar_ou_atalho(btn_prop_ok, "%o")


def _localizar_dialogo_coordenadas(janela):
    """Tenta localizar o diálogo de Sistema de Coordenadas por título ou auto_id."""
    for titulo in ["Coordenada", "Sistema de Coordenadas"]:
        try:
            dlg = janela.child_window(title=titulo, control_type="Window")
            if dlg.exists():
                return dlg
        except Exception:
            pass
    try:
        dlg = janela.child_window(auto_id="frmCoord", control_type="Window")
        if dlg.exists():
            return dlg
    except Exception:
        pass
    return None


def _configurar_sistema_coordenadas(janela):
    """
    Abre o diálogo de Sistema de Coordenadas e seleciona o sistema alvo
    definido em SISTEMA_COORDENADAS_ALVO.

    ATENÇÃO (ver comentário na seção de CONFIGURAÇÃO): a seleção é feita
    hoje por clique físico com deslocamento em pixels a partir do
    combobox. Isso é frágil em telas com escala (DPI) diferente. Se o
    combobox aceitar `.select(nome)` diretamente, isso é preferível — o
    código já tenta abrir a lista e clicar como método principal, mas se
    quiser tentar o caminho mais seguro primeiro, veja o bloco comentado
    abaixo.
    """
    dlg_coord = None
    for _ in range(10):
        dlg_coord = _localizar_dialogo_coordenadas(janela)
        if dlg_coord:
            break
        time.sleep(0.3)

    if not dlg_coord:
        logger.debug("Diálogo de coordenadas não abriu automaticamente, forçando via Alt+F -> R.")
        janela.set_focus()
        send_keys("%f")
        time.sleep(0.4)
        send_keys("r")
        for _ in range(10):
            dlg_coord = _localizar_dialogo_coordenadas(janela)
            if dlg_coord:
                break
            time.sleep(0.3)

    if not dlg_coord:
        raise RuntimeError("Não foi possível localizar a janela de Coordenadas.")

    cb_coord = dlg_coord.child_window(auto_id="comboBox1", control_type="ComboBox")

    # --- Caminho preferencial: selecionar por nome (mais robusto) ----------
    # Descomente e teste se o combobox do HGO suportar seleção direta pelo
    # texto do item. Caso funcione de forma confiável na sua instalação,
    # substitua o bloco de clique por pixel abaixo por este:
    #
    # try:
    #     cb_coord.select(SISTEMA_COORDENADAS_ALVO)
    #     time.sleep(1.2)
    # except Exception as e:
    #     logger.warning("Seleção direta falhou (%s), caindo para clique por pixel.", e)
    #     ... (bloco abaixo)

    btn_abrir = cb_coord.child_window(title="Abrir", control_type="Button")
    janela.set_focus()
    dlg_coord.set_focus()
    btn_abrir.click_input()
    time.sleep(0.8)  # aguarda a lista suspensa expandir

    # Clique por coordenada física — ver AVISO na seção de configuração.
    cb_rect = cb_coord.rectangle()
    x_clique = int((cb_rect.left + cb_rect.right) / 2)
    y_clique = cb_rect.bottom + OFFSET_Y_ITEM_COMBOBOX_PX
    mouse.click(button="left", coords=(x_clique, y_clique))
    time.sleep(1.2)  # aguarda o HGO processar o template carregado

    btn_ok = _encontrar_controle(dlg_coord, auto_ids=["btOk"], titulos=["OK"])
    if btn_ok:
        btn_ok.click_input()
    else:
        send_keys("{ENTER}")

    # --- Verificação de fechamento -----------------------------------------
    # Se o item errado foi clicado na lista (ex: offset de pixel desalinhado
    # por causa de DPI), o HGO pode: (a) não fechar o diálogo, ou (b) abrir
    # um popup de erro/confirmação que o script não trata. Nos dois casos,
    # as etapas seguintes ficam "procurando" janelas num estado que não é o
    # esperado, e cada busca falhada come o timeout inteiro daquela etapa —
    # isso é o suspeito nº 1 para lentidão de vários minutos. Este check só
    # avisa (não tenta consertar sozinho) para você confirmar no log se é
    # isso mesmo antes de investigar mais fundo.
    time.sleep(0.3)
    try:
        ainda_aberto = dlg_coord.exists()
    except Exception:
        ainda_aberto = False
    if ainda_aberto:
        _log_e_print(
            logging.WARNING,
            "O diálogo de Sistema de Coordenadas parece ter continuado aberto "
            "após o clique em OK. Isso costuma indicar que o item errado foi "
            "selecionado na lista (ver SISTEMA_COORDENADAS_ALVO / "
            "OFFSET_Y_ITEM_COMBOBOX_PX) e é forte candidato a causa raiz da "
            "lentidão nas etapas seguintes, não apenas um problema visual."
        )


def _importar_arquivos(janela, arquivos_origem):
    """Abre o diálogo de importação (Alt+F -> I) e seleciona os arquivos de origem."""
    time.sleep(0.8)
    janela.set_focus()
    send_keys("{ESC}")
    time.sleep(0.2)
    send_keys("%f")
    time.sleep(0.5)
    send_keys("i")

    dlg_importar = janela.child_window(auto_id="frmFileFilter", control_type="Window")
    dlg_importar.wait("ready", timeout=TIMEOUT_DIALOGO_PADRAO)

    send_keys("%s")  # atalho nativo para "Selecionar arquivos"

    dlg_abrir = janela.child_window(title="Abrir", control_type="Window")
    dlg_abrir.wait("ready", timeout=TIMEOUT_DIALOGO_PADRAO)

    caminhos_formatados = " ".join(f'"{arq}"' for arq in arquivos_origem)
    edit_box = dlg_abrir.child_window(class_name="Edit", control_type="Edit")
    edit_box.set_edit_text(caminhos_formatados)
    time.sleep(0.2)

    btn_confirmar = _encontrar_controle(
        dlg_abrir, titulos=["&Abrir", "Abrir", "Open", "&Open"]
    )
    _clicar_ou_atalho(btn_confirmar, "{ENTER}")

    # Ver RESTAURAR_TIMINGS_PADRAO_APOS_IMPORTACAO na seção de CONFIGURAÇÃO.
    # Restaurar os timings padrão (mais lentos) deixa o diálogo nativo
    # "Abrir" do Windows mais estável, mas também deixa TODAS as buscas de
    # controle/menu seguintes mais lentas — candidato a causar a lentidão
    # relatada nas etapas finais (conversão, grid, menus).
    if RESTAURAR_TIMINGS_PADRAO_APOS_IMPORTACAO:
        timings.Timings.defaults()
    else:
        logger.debug("Mantendo Timings.fast() após a importação (toggle desativado).")


def _converter_para_rinex(janela):
    """Seleciona todos os arquivos importados na grade e dispara 'Converter para RINEX'."""
    janela.set_focus()
    send_keys("{ESC}")
    time.sleep(0.2)

    tab_control = janela.child_window(auto_id="tabControl1", control_type="Tab")
    tab_item = tab_control.child_window(title="Arq-Observacoes", control_type="TabItem")
    tab_item.select()
    time.sleep(0.5)

    table = janela.child_window(title="DataGridView", auto_id="dataGridView1", control_type="Table")
    table.wait("ready", timeout=15)

    table.click_input(button="left", coords=(100, 60))
    time.sleep(0.3)
    send_keys("^a")  # seleciona todas as linhas
    time.sleep(0.5)

    table.click_input(button="right", coords=(100, 60))
    time.sleep(0.8)

    # Atalho nativo do item de menu "Converter para Rinex(R)"
    send_keys("r")
    time.sleep(0.3)
    send_keys("{ENTER}")


def _copiar_resultado_para_destino(proj_dir, pasta_destino):
    """
    Localiza os arquivos RINEX gerados dentro da pasta do projeto temporário
    e copia para `pasta_destino`.

    Esta etapa NÃO EXISTIA no script original: a pasta de destino era criada
    mas nunca recebia os arquivos convertidos. Ajuste `EXTENSOES_RINEX` na
    seção de configuração caso o HGO grave em outro formato/local.
    """
    arquivos_copiados = []
    if not os.path.exists(proj_dir):
        logger.error("Pasta do projeto '%s' não existe — não há o que copiar.", proj_dir)
        return arquivos_copiados

    for raiz, _dirs, arquivos in os.walk(proj_dir):
        for nome in arquivos:
            if nome.lower().endswith(tuple(ext.lower() for ext in EXTENSOES_RINEX)):
                origem = os.path.join(raiz, nome)
                destino = os.path.join(pasta_destino, nome)
                try:
                    shutil.copy2(origem, destino)
                    arquivos_copiados.append(destino)
                    logger.info("Copiado: %s -> %s", origem, destino)
                except Exception as e:
                    logger.error("Falha ao copiar '%s': %s", origem, e)

    if not arquivos_copiados:
        logger.warning(
            "Nenhum arquivo RINEX encontrado em '%s' com as extensões %s. "
            "Verifique EXTENSOES_RINEX ou o local real de saída do HGO.",
            proj_dir, EXTENSOES_RINEX,
        )
    return arquivos_copiados


# ======================================================================
# FUNÇÃO PRINCIPAL
# ======================================================================
def converter_rinex(
    arquivos_origem: Union[str, List[str]],
    pasta_destino: str,
    caminho_exe: str = CAMINHO_EXE_PADRAO,
) -> ResultadoConversao:
    """
    Realiza a conversão de um ou mais arquivos .GNS para RINEX usando o HGO.
    Suporta arquivo único (string) ou lote de arquivos (lista).

    Retorna um ResultadoConversao com sucesso/erro, arquivos convertidos e
    o caminho do projeto temporário (útil para depuração manual).
    """
    if isinstance(arquivos_origem, str):
        arquivos_origem = [arquivos_origem]

    # Defesa contra frameworks (ex: uvicorn/FastAPI) que desabilitam loggers
    # criados antes da configuração deles via disable_existing_loggers=True.
    # Sem isso, TODO o log desta função pode sumir silenciosamente mesmo com
    # os handlers configurados corretamente.
    logger.disabled = False
    logger.propagate = True
    _log_e_print(logging.INFO, "Log detalhado também sendo gravado em: %s", _CAMINHO_LOG_ARQUIVO)

    # Separa e avisa individualmente sobre arquivos inexistentes, em vez de
    # silenciosamente descartá-los como no script original.
    arquivos_validos = []
    for a in arquivos_origem:
        caminho_abs = os.path.normpath(os.path.abspath(a))
        if os.path.exists(caminho_abs):
            arquivos_validos.append(caminho_abs)
        else:
            logger.warning("Arquivo de origem não encontrado, ignorando: %s", a)
    arquivos_origem = arquivos_validos

    pasta_destino = os.path.normpath(os.path.abspath(pasta_destino))

    if not arquivos_origem:
        msg = "Nenhum arquivo de origem válido foi encontrado."
        logger.error(msg)
        return ResultadoConversao(sucesso=False, mensagem_erro=msg)

    os.makedirs(pasta_destino, exist_ok=True)

    timestamp = int(time.time())
    proj_name = f"proj_hgo_auto_{timestamp}"

    proj_dir = None
    proc = None

    # Guarda o valor original da variável de ambiente para restaurá-la ao
    # final — evita que a mudança "vaze" para o resto do processo Python
    # (e para futuros subprocessos abertos pelo GerenciGeo nesta mesma
    # execução).
    compat_layer_original = os.environ.get("__COMPAT_LAYER")
    inicio_total = time.perf_counter()

    try:
        with _cronometrar("matar_hgo_previos + abrir_processo"):
            _matar_hgo_previos()
            time.sleep(0.2)

            os.environ["__COMPAT_LAYER"] = "RunAsInvoker"
            cwd_seguro = os.path.dirname(os.path.abspath(__file__))
            proc = subprocess.Popen([caminho_exe], cwd=cwd_seguro)

            app = Application(backend="uia").connect(process=proc.pid, timeout=TIMEOUT_JANELA_PRINCIPAL)
            janela = app.window(title_re="(?i).*hi-target.*")
            janela.wait("ready", timeout=TIMEOUT_JANELA_PRINCIPAL)
            janela.set_focus()

        with _cronometrar("criar_projeto"):
            desktop_dir, proj_dir = _criar_projeto(janela, proj_name)

        with _cronometrar("configurar_propriedades_projeto"):
            _configurar_propriedades_projeto(janela)

        with _cronometrar("configurar_sistema_coordenadas"):
            _configurar_sistema_coordenadas(janela)

        with _cronometrar("importar_arquivos (dialogo + selecao)"):
            _importar_arquivos(janela, arquivos_origem)

        # Espera dinâmica pela importação dos .zsd (substitui o loop manual
        # que existia inline na função original — mesma lógica, função
        # reaproveitável agora em `_aguardar_arquivos_prontos`).
        obs_dir = os.path.join(proj_dir, "ObsBinData")
        logger.info("Aguardando importação dinâmica em: %s", obs_dir)
        nomes_esperados = [os.path.splitext(os.path.basename(a))[0] + ".zsd" for a in arquivos_origem]
        with _cronometrar("aguardar_importacao_zsd"):
            if not _aguardar_arquivos_prontos(obs_dir, nomes_esperados, TIMEOUT_IMPORTACAO_ARQUIVOS):
                logger.warning("Timeout na importação de arquivos brutos. Prosseguindo mesmo assim.")

        time.sleep(1.0)  # estabilização da interface após a importação

        with _cronometrar("converter_para_rinex (grid + menu de contexto)"):
            _converter_para_rinex(janela)

        # --- Espera dinâmica pela conversão RINEX ---------------------------
        # Substitui o `time.sleep(30.0)` fixo do script original. Assim que
        # os arquivos de saída aparecerem em `proj_dir` e pararem de crescer
        # de tamanho, seguimos em frente — sem depender de um número mágico
        # que tanto pode ser curto demais (arquivo grande) quanto
        # desperdiçar tempo (arquivo pequeno).
        # Como não sabemos o nome exato de saída de antemão, fazemos um
        # polling simples: aguarda até `TIMEOUT_CONVERSAO_RINEX` ou até que
        # pelo menos um arquivo com extensão RINEX apareça e estabilize.
        logger.info("Aguardando conversão RINEX (timeout: %ss)...", TIMEOUT_CONVERSAO_RINEX)
        with _cronometrar("aguardar_conversao_rinex"):
            inicio = time.time()
            arquivos_rinex_prontos = []
            while time.time() - inicio < TIMEOUT_CONVERSAO_RINEX:
                candidatos = []
                for raiz, _dirs, arquivos in os.walk(proj_dir):
                    for nome in arquivos:
                        if nome.lower().endswith(tuple(e.lower() for e in EXTENSOES_RINEX)):
                            candidatos.append(os.path.join(raiz, nome))
                if candidatos:
                    tamanhos_iniciais = {c: os.path.getsize(c) for c in candidatos}
                    time.sleep(TEMPO_ESTABILIDADE_ARQUIVO)
                    tamanhos_finais = {
                        c: os.path.getsize(c) for c in candidatos if os.path.exists(c)
                    }
                    if tamanhos_iniciais == tamanhos_finais:
                        arquivos_rinex_prontos = candidatos
                        break
                time.sleep(INTERVALO_POLL)
            else:
                logger.warning(
                    "Timeout aguardando arquivos RINEX. Prosseguindo para copiar o que existir."
                )

        # Copia os arquivos gerados para a pasta de destino informada pelo
        # chamador (etapa que faltava por completo no script original).
        with _cronometrar("copiar_resultado_para_destino"):
            arquivos_convertidos = _copiar_resultado_para_destino(proj_dir, pasta_destino)

        logger.info("Fechando o HGO...")
        try:
            janela.close()
        except Exception as e:
            logger.debug("Falha ao fechar janela normalmente: %s", e)

        _log_e_print(
            logging.INFO, "Tempo total da conversão: %.2fs", time.perf_counter() - inicio_total
        )
        return ResultadoConversao(
            sucesso=len(arquivos_convertidos) > 0,
            arquivos_convertidos=arquivos_convertidos,
            pasta_projeto_temporario=proj_dir,
            mensagem_erro=None if arquivos_convertidos else "Nenhum arquivo RINEX foi gerado/copiado.",
        )

    except Exception as e:
        logger.exception(
            "Erro na conversão HGO (após %.2fs de execução)", time.perf_counter() - inicio_total
        )
        print(
            f"[converterrinex] ERRO após {time.perf_counter() - inicio_total:.2f}s: {e}",
            flush=True,
        )
        return ResultadoConversao(
            sucesso=False,
            mensagem_erro=str(e),
            pasta_projeto_temporario=proj_dir,
        )

    finally:
        # Encerra apenas o processo que ESTE script abriu (em vez de matar
        # qualquer HGO.exe em execução no sistema, como fazia o original).
        if proc is not None:
            _matar_processo_hgo(proc.pid)

        # Restaura a variável de ambiente ao valor original.
        if compat_layer_original is None:
            os.environ.pop("__COMPAT_LAYER", None)
        else:
            os.environ["__COMPAT_LAYER"] = compat_layer_original

        # Limpeza opcional da pasta de projeto temporário.
        if LIMPAR_PROJETO_TEMPORARIO and proj_dir and os.path.exists(proj_dir):
            try:
                shutil.rmtree(proj_dir)
                logger.debug("Pasta de projeto temporário removida: %s", proj_dir)
            except Exception as e:
                logger.warning("Não foi possível remover pasta temporária '%s': %s", proj_dir, e)