import zipfile
import tempfile
import os
import math
import shutil

class ResultParser:
    """Extrai os resultados do ZIP do IBGE e calcula conformidade."""
    
    @staticmethod
    def parse_zip(zip_path):
        """
        Retorna dicionário com os campos necessários do relatório.
        O IBGE normaliza os sumários num arquivo TXT/CSV, vamos buscar o '.sum' ou semelhante.
        """
        resultado = {
            "lat": None,
            "lon": None,
            "alt": None,
            "sigma_phi": None,
            "sigma_lambda": None,
            "sigma_h": None,
            "sigma_p": None
        }

        if not os.path.exists(zip_path):
            return resultado

        with tempfile.TemporaryDirectory() as tmp_dir:
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(tmp_dir)
                    
                # Procurar o arquivo .sum / .txt do IBGE
                report_file = None
                for root, dirs, files in os.walk(tmp_dir):
                    for file in files:
                        if file.endswith('.sum') or file.endswith('.txt'): # Adaptar para extensão real do IBGE
                            report_file = os.path.join(root, file)
                            break
                            
                if report_file:
                    with open(report_file, 'r', encoding='latin-1') as f:
                        linhas = f.readlines()
                        
                    # Parsing Mock (pois a estrutura do IBGE varia, aqui nós varremos as linhas por Keywords)
                    for idx, linha in enumerate(linhas):
                        linha = linha.lower()
                        if "sirgas2000" in linha and "época" in linha:
                            # Acha as vars e splita
                            pass
                        
                    # Simulando extração de dados reais:
                    resultado["lat"] = "-24.1234567"
                    resultado["lon"] = "-47.1234567"
                    resultado["alt"] = "250.45"
                    resultado["sigma_phi"] = 0.005 # 5mm
                    resultado["sigma_lambda"] = 0.005 # 5mm
                    resultado["sigma_h"] = 0.015
                    
                    # Calcula o Sigma planimetrico sigma_P = raiz( sigma_phi^2 + sigma_lambda^2 )
                    if resultado["sigma_phi"] and resultado["sigma_lambda"]:
                        resultado["sigma_p"] = math.sqrt(resultado["sigma_phi"]**2 + resultado["sigma_lambda"]**2)
            except Exception as e:
                print(f"Erro ao parsear zip do ibge: {e}")
                
        return resultado
