import zipfile
import xml.etree.ElementTree as ET
import io

import os
ods_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Norte Corre.ODS")

with zipfile.ZipFile(ods_path, 'r') as zip_ref:
    xml_data = zip_ref.read('content.xml')

# namespaces
ns = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
}

root = ET.fromstring(xml_data)

tables = root.findall('.//table:table', ns)

with open("scratch/ods_structure.txt", "w", encoding="utf-8") as out:
    out.write(f"Total de tabelas encontradas: {len(tables)}\n")
    
    for i, table in enumerate(tables):
        table_name = table.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name')
        out.write(f"\nTabela {i+1}: {table_name}\n")
        rows = table.findall('.//table:table-row', ns)
        out.write(f"Total de linhas nesta tabela: {len(rows)}\n")
        
        printed = 0
        for r_idx, row in enumerate(rows):
            cells = row.findall('.//table:table-cell', ns)
            cell_texts = []
            for cell in cells:
                # Trata células repetidas se houver atributo table:number-columns-repeated
                repeated = cell.get('{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                p_elements = cell.findall('.//text:p', ns)
                cell_text = "".join([p.text for p in p_elements if p.text])
                
                count = int(repeated) if repeated else 1
                if count > 20: # Limita a repetição de colunas vazias
                    count = 1
                for _ in range(count):
                    cell_texts.append(cell_text)
            
            if any(cell_texts) and printed < 50:
                while cell_texts and cell_texts[-1] == "":
                    cell_texts.pop()
                if cell_texts:
                    out.write(f" Linha {r_idx}: {cell_texts}\n")
                    printed += 1
print("Estrutura escrita com sucesso em scratch/ods_structure.txt")
