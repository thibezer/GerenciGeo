import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
import logging

# Configuração do Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def open_file_dialog(driver, file_path):
    # Encontrar o campo de entrada de arquivo
    input_element = driver.find_element(By.CSS_SELECTOR, 'input[type="file"]')
    
    # Clicar no campo para abrir a janela de diálogo do sistema
    input_element.click()
    
    # Esperar até que a janela de diálogo seja aberta
    time.sleep(1)
    
    # Usar o método send_keys para digitar o caminho do arquivo
    input_element.send_keys(file_path)

def wait_for_element(driver, by, value, timeout=10):
    for _ in range(timeout):
        try:
            element = driver.find_element(by, value)
            return element
        except Exception as e:
            time.sleep(1)
    raise TimeoutError(f"Elemento não encontrado em {timeout} segundos")

def main():
    # Configurar o WebDriver (substitua pelo caminho do seu executável)
    driver_path = 'path/to/chromedriver'
    driver = webdriver.Chrome(executable_path=driver_path)
    
    # Abrir a página onde está o campo de entrada de arquivo
    driver.get('http://example.com')
    
    try:
        logging.info("Aguardando até que o campo de entrada de arquivo esteja disponível")
        # Esperar até que o campo de entrada de arquivo esteja disponível
        input_element = wait_for_element(driver, By.CSS_SELECTOR, 'input[type="file"]')
        
        # Caminho do arquivo a ser selecionado
        file_path = 'C:\\path\\to\\your\\file.txt'
        
        logging.info(f"Selecionando o arquivo: {file_path}")
        # Abrir a janela de diálogo do sistema e digitar o caminho do arquivo
        open_file_dialog(driver, file_path)
        
        logging.info("Arquivo selecionado com sucesso!")
    except Exception as e:
        logging.error(f"Erro ao selecionar o arquivo: {e}")
    finally:
        driver.quit()

if __name__ == '__main__':
    main()
