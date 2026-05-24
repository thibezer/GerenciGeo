import os
import time
import zipfile
import logging
from config import IBGE_PPP_URL, IBGE_PPP_WEB_URL, DEFAULT_EMAIL, DEFAULT_ANTENNA

logger = logging.getLogger(__name__)

class LotePPPManager:
    def __init__(self, use_api=True, log_callback=None):
        self.use_api = use_api
        self.log_callback = log_callback

    def _log(self, msg):
        logger.info(msg)
        if self.log_callback:
            self.log_callback(msg)

    def processar_lote(self, lista_rines, pasta_saida):
        """
        Recebe uma lista de caminhos .o (Rinex) e tenta enviar pra processar.
        Retorna: {"path_enviado": ("sucesso/erro", "path_do_zip_se_sucesso")}
        """
        resultados = {}
        for rinex in lista_rines:
            self._log(f"Processando arquivo: {rinex}")
            sucesso, msg_or_path = self.enviar_para_ppp(rinex, pasta_saida)
            resultados[rinex] = (sucesso, msg_or_path)
            if sucesso:
                self._log(f"   [OK] Resultado salvo em: {os.path.basename(msg_or_path)}")
            else:
                self._log(f"   [ERRO] {msg_or_path}")
        return resultados

    def enviar_para_ppp(self, arquivo_rinex, pasta_saida):
        if self.use_api:
            try:
                return self._enviar_via_api(arquivo_rinex, pasta_saida)
            except Exception as e:
                logger.warning(f"Falha na API PPP ({e}), executando fallback via Selenium...")
                return self._enviar_via_selenium(arquivo_rinex, pasta_saida)
        else:
            return self._enviar_via_selenium(arquivo_rinex, pasta_saida)

    def _enviar_via_api(self, arquivo_rinex, pasta_saida):
        """
        Submete requests POST multi-part baseado na estrutura documentada curl
        """
        try:
            import requests
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        except ImportError:
            raise Exception("Biblioteca 'requests' não instalada. Execute: pip install requests")

        if not os.path.exists(arquivo_rinex):
            return False, "Arquivo Rinex Inexiste."

        nome_base = os.path.basename(arquivo_rinex)
        with open(arquivo_rinex, 'rb') as f_rinex:
            files = {
                'file': (nome_base, f_rinex)
            }
            data = {
                'email': DEFAULT_EMAIL,
                'modelo_antena': DEFAULT_ANTENNA,
                'altura_antena': '0.000',
                'tipo_lev': 'estatico'
            }

            # Adicionamos verify=False para lidar com erros de SSL comuns em sites do governo
            # e aumentamos o timeout pois o processamento pode demorar
            try:
                response = requests.post(IBGE_PPP_URL, files=files, data=data, timeout=120, verify=False)
                
                if response.status_code in [200, 201]:
                    content_disposition = response.headers.get('content-disposition', '')
                    out_name = f"{nome_base}_resultado.zip"
                    
                    if 'filename=' in content_disposition:
                        out_name = content_disposition.split('filename=')[1].strip('"')
                        
                    out_path = os.path.join(pasta_saida, out_name)
                    
                    with open(out_path, 'wb') as f:
                        f.write(response.content)
                        
                    return True, out_path
                else:
                    raise Exception(f"API HTTP Status code falhou: {response.status_code}")
            except Exception as e:
                logger.error(f"Erro na API PPP: {e}")
                raise e

    def _enviar_via_selenium(self, arquivo_rinex, pasta_saida):
        """Webbot Fallback robusto"""
        try:
            from selenium import webdriver
            from selenium.webdriver.common.by import By
            from selenium.webdriver.chrome.service import Service as ChromeService
            from selenium.webdriver.support.ui import WebDriverWait, Select
            from selenium.webdriver.support import expected_conditions as EC
            from webdriver_manager.chrome import ChromeDriverManager
            import glob
        except ImportError:
            return False, "Selenium não instalado. Execute: pip install selenium webdriver-manager"

        driver = None
        try:
            options = webdriver.ChromeOptions()
            # options.add_argument("--headless") # Descomente para rodar sem janela
            
            # Preferencias para auto download
            abs_pasta_saida = os.path.abspath(pasta_saida)
            prefs = {
                "download.default_directory": abs_pasta_saida,
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "safebrowsing.enabled": True
            }
            options.add_experimental_option("prefs", prefs)

            driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=options)
            driver.get(IBGE_PPP_WEB_URL)
            
            wait = WebDriverWait(driver, 30)

            # 0. Verificar se o formulário está dentro de um iframe (comum no portal IBGE)
            try:
                # Tenta esperar por um iframe e mudar para ele
                iframes = driver.find_elements(By.TAG_NAME, "iframe")
                for iframe in iframes:
                    src = iframe.get_attribute("src")
                    if src and ("ppp" in src or "geodesia" in src):
                        driver.switch_to.frame(iframe)
                        break
            except: pass
            
            # 1. Upload arquivo
            upload_input = wait.until(EC.presence_of_element_located((By.ID, "arquivo")))
            upload_input.send_keys(os.path.abspath(arquivo_rinex))
            
            # 2. Email
            email_input = driver.find_element(By.NAME, "email")
            email_input.clear()
            email_input.send_keys(DEFAULT_EMAIL)

            # 3. Tipo de Processamento (Estático)
            try:
                radio_estatico = driver.find_element(By.ID, "processo1")
                if not radio_estatico.is_selected():
                    radio_estatico.click()
            except: pass

            # 4. Antena (Opcional - Tentamos selecionar se existir na lista)
            try:
                select_antena = Select(driver.find_element(By.ID, "antenasPPP"))
                # O valor no select pode ser diferente do DEFAULT_ANTENNA literal
                # Mas tentamos por texto visível se possível
                try:
                    select_antena.select_by_visible_text(DEFAULT_ANTENNA)
                except:
                    # Fallback: seleciona a primeira se não achar a específica
                    pass
            except: pass

            # 5. Aceitar termos (se houver checkbox)
            try:
                checkboxes = driver.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
                for cb in checkboxes:
                    if not cb.is_selected():
                        cb.click()
            except: pass

            # 6. Botão Processar
            btn_processar = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "input.botao[value='Processar']")))
            btn_processar.click()

            # 7. Aguardar download (monitorando a pasta por arquivos .zip novos)
            self._log("   Aguardando conclusão do processamento e download no IBGE (isso pode levar alguns minutos)...")
            
            # Loop de espera pelo download (timeout de 10 minutos)
            start_time = time.time()
            encontrou = False
            while time.time() - start_time < 600:
                # Procura por arquivos .zip ou .crdownload na pasta
                zips = glob.glob(os.path.join(abs_pasta_saida, "*.zip"))
                if zips:
                    # Ordena por data de modificação para pegar o mais recente
                    zips.sort(key=os.path.getmtime, reverse=True)
                    mais_recente = zips[0]
                    
                    # Verifica se o arquivo é recente (criado nos últimos 10 minutos)
                    if time.time() - os.path.getmtime(mais_recente) < 600:
                        encontrou = True
                        abs_pasta_saida = mais_recente # Retorna o caminho do arquivo, não da pasta
                        break
                if encontrou: break
                time.sleep(5)
                
            if encontrou:
                logger.info(f"Sucesso: Arquivo processado e salvo em {abs_pasta_saida}")
                time.sleep(2) # Margem de segurança para finalizar escrita
                return True, abs_pasta_saida
            else:
                return False, "Timeout aguardando download do resultado."
            
        except Exception as e:
            logger.error(f"Selenium bot falhou: {e}")
            return False, str(e)
        finally:
            if driver:
                driver.quit()
