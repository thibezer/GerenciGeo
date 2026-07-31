"""
Script de debug para analisar o conteúdo de planilhas ODS e mostrar
os valores brutos das células para diagnóstico de parsing.
Uso: python scratch/debug_ods.py "caminho/para/arquivo.ods"
"""
import sys, os, zipfile, io, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import xml.etree.ElementTree as ET

if len(sys.argv) < 2:
    print("Uso: python scratch/debug_ods.py <caminho_para_ods>")
    sys.exit(1)

filepath = sys.argv[1]
if not os.path.exists(filepath):
    print(f"Arquivo não encontrado: {filepath}")
    sys.exit(1)

with open(filepath, "rb") as f:
    content = f.read()

ns = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
}

with zipfile.ZipFile(io.BytesIO(content)) as zf:
    xml_data = zf.read('content.xml')
    root = ET.fromstring(xml_data)
    tables = root.findall('.//table:table', ns)
    
    for table in tables:
        table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name') or ""
        print(f"\n{'='*80}")
        print(f"ABA: {table_name}")
        print(f"{'='*80}")
        
        rows = table.findall('.//table:table-row', ns)
        pontos_encontrados = 0
        
        for row_idx, row in enumerate(rows):
            cells = row.findall('.//table:table-cell', ns)
            cell_texts = []
            cell_details = []
            
            for cell in cells:
                repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                p_elements = cell.findall('.//text:p', ns)
                text_p_val = "".join([p.text for p in p_elements if p.text])
                
                # Atributo office:value
                office_val = cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value') or ""
                # Tipo do valor
                val_type = cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value-type') or ""
                
                final_val = text_p_val if text_p_val else office_val
                
                count = int(repeated) if repeated else 1
                if count > 30: count = 1
                for _ in range(count):
                    cell_texts.append(final_val)
                    cell_details.append(f"text_p='{text_p_val}' | office_val='{office_val}' | type='{val_type}'")
            
            # Verificar se é um vértice SIGEF
            if cell_texts:
                vertice = str(cell_texts[0]).strip()
                if re.match(r"^([A-Z0-9]{3,5})-(M|P|V)-(\d+)$", vertice, re.IGNORECASE):
                    pontos_encontrados += 1
                    if pontos_encontrados <= 5:  # Mostra os 5 primeiros
                        print(f"\n  VÉRTICE: {vertice}")
                        for ci, (cv, cd) in enumerate(zip(cell_texts[:12], cell_details[:12])):
                            col_names = ["[0]Vértice", "[1]V1(E/Lon)", "[2]Sigma_E", "[3]V2(N/Lat)", "[4]Sigma_N", "[5]Altitude", "[6]Sigma_Z", "[7]Método", "[8]TipoLim", "[9]CNS", "[10]MatConf", "[11]Descrit"]
                            col_name = col_names[ci] if ci < len(col_names) else f"[{ci}]"
                            print(f"    {col_name}: valor_final='{cv}' | {cd}")
        
        print(f"\n  Total de vértices encontrados na aba: {pontos_encontrados}")
