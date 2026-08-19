import zipfile
import re
import os

ods_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Norte Corre.ODS")
codigo_credenciado = "XRXR"

with zipfile.ZipFile(ods_path, 'r') as zip_ref:
    xml_content = zip_ref.read('content.xml').decode('utf-8', errors='ignore')

# Regex da API original
pattern_api = re.compile(rf"\b({re.escape(codigo_credenciado)})-(M|P|V)-(\d+)\b", re.IGNORECASE)
matches_api = pattern_api.findall(xml_content)

print("Matches com regex da API:", len(matches_api))
if matches_api:
    print(matches_api[:5])
else:
    # Vamos achar onde a string XRXR-M- aparece e ver o contexto
    idx = xml_content.find("XRXR")
    if idx != -1:
        print("\nTrecho ao redor de XRXR no content.xml:")
        print(xml_content[max(0, idx-50):min(len(xml_content), idx+150)])
    else:
        print("A string 'XRXR' não foi encontrada no content.xml!")
