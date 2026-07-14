import os

class MemEditorEngine:
    def __init__(self, filepath=None):
        self.filepath = filepath
        self.lines = []
        self.pontos = [] # [{'line_index': int, 'id_vertice': str, 'lon': float, 'lat': float, ...}]
        
    def read_mem(self):
        """Lê o arquivo .MEM, entendendo encoding e estrutura delimitada por ;"""
        if not self.filepath or not os.path.exists(self.filepath):
            raise FileNotFoundError("Arquivo .MEM não encontrado.")
            
        with open(self.filepath, 'r', encoding='latin-1') as f:
            self.lines = f.readlines()
            
        self.parse_pontos()

    def parse_pontos(self):
        """Busca linhas estruturais de pontos. No topocad elas começam com número > 100 e têm tags 21-"""
        self.pontos = []
        for idx, line in enumerate(self.lines):
            line = line.strip()
            if not line:
                continue
                
            parts = line.split(';')
            if len(parts) > 10 and '21-' in line and '22-' in line:
                # É uma linha de vértice
                ponto_dict = {'line_index': idx, 'raw': line, 'parts': parts}
                
                for pt in parts:
                    if pt.startswith('22-'):
                        ponto_dict['nome_vertice'] = pt[3:]
                    elif pt.startswith('25-'):
                        ponto_dict['E'] = pt[3:]
                    elif pt.startswith('26-'):
                        ponto_dict['N'] = pt[3:]
                    elif pt.startswith('30-'):
                        ponto_dict['lat'] = pt[3:]
                    elif pt.startswith('31-'):
                        ponto_dict['lon'] = pt[3:]
                    elif pt.startswith('34-'):
                        ponto_dict['alt'] = pt[3:]
                        
                self.pontos.append(ponto_dict)

    def get_pontos(self):
        return self.pontos

    def update_coordenadas(self, line_index, nova_lat, nova_lon, nova_alt=None, new_E=None, new_N=None):
        """Substitui as coordenadas brutas pelas processadas e atualiza o RAW String na lista lines"""
        old_line = self.lines[line_index].strip()
        parts = old_line.split(';')
        
        new_parts = []
        for pt in parts:
            if pt.startswith('30-') and nova_lat:
                new_parts.append(f"30-{nova_lat}")
            elif pt.startswith('31-') and nova_lon:
                new_parts.append(f"31-{nova_lon}")
            elif pt.startswith('34-') and nova_alt:
                new_parts.append(f"34-{nova_alt}")
            elif pt.startswith('25-') and new_E:
                new_parts.append(f"25-{new_E}")
            elif pt.startswith('26-') and new_N:
                new_parts.append(f"26-{new_N}")
            else:
                new_parts.append(pt)
                
        # Mantendo \n
        self.lines[line_index] = ";".join(new_parts) + "\n"
        
    def save(self, output_path=None):
        save_path = output_path if output_path else self.filepath
        with open(save_path, 'w', encoding='latin-1') as f:
            f.writelines(self.lines)
        return save_path
