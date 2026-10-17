"""Edição de confrontante: trocar o titular (digitando o CPF de outra pessoa) não pode alterar os outros
lotes que compartilham a mesma pessoa."""
import unittest

from database.connection import DatabaseManager, execute_query
from routes.levantamento.segmentos import ConfrontanteCreate, update_confrontante

CPF_MARIDO = "111.111.111-11"
CPF_ESPOSA = "222.222.222-22"


def _titular_marido(**extra):
    dados = dict(
        nome="Marido Lujan", cpf_cnpj=CPF_MARIDO, genero="M", estado_civil="casado", regime_bens="separacao_total",
        nome_conjuge="Esposa Lujan", cpf_conjuge=CPF_ESPOSA, genero_conjuge="F",
    )
    dados.update(extra)
    return ConfrontanteCreate(**dados)


def _titular_esposa():
    return ConfrontanteCreate(
        nome="Esposa Lujan", cpf_cnpj=CPF_ESPOSA, genero="F", estado_civil="casado", regime_bens="separacao_total",
        nome_conjuge="Marido Lujan", cpf_conjuge=CPF_MARIDO, genero_conjuge="M",
    )


class TestConfrontanteTrocaTitular(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            for t in ("confrontante_coproprietarios", "segmentos", "confrontantes", "pontos", "matriculas",
                      "levantamentos", "propriedade_clientes", "propriedades", "clientes", "pessoas", "profissionais"):
                c.execute(f"DELETE FROM {t}")
            c.execute("INSERT INTO profissionais (id, nome, registro, codigo_credenciado, conselho) VALUES (1, 'Agr', '1', 'A', 'CFTA')")
            c.execute("INSERT INTO propriedades (id, nome_propriedade, municipio, uf) VALUES (1, 'Faz', 'Umuarama', 'PR')")
            c.execute("INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (1, 1, 1, '2026-01-01')")
            c.execute(
                "INSERT INTO pessoas (id, nome, cpf_cnpj, genero, estado_civil, regime_bens, nome_conjuge, cpf_conjuge, genero_conjuge) "
                "VALUES (10, 'Marido Lujan', ?, 'M', 'casado', 'separacao_total', 'Esposa Lujan', ?, 'F')",
                (CPF_MARIDO, CPF_ESPOSA),
            )
            for cid, lote in ((1, "Lote A"), (2, "Lote B"), (3, "Lote C")):
                c.execute("INSERT INTO confrontantes (id, levantamento_id, pessoa_id, nome, lote) VALUES (?, 1, 10, 'Marido Lujan', ?)", (cid, lote))

    def _pessoa_de(self, cid):
        return dict(execute_query(
            "SELECT p.id, p.nome, p.genero, p.nome_conjuge FROM confrontantes c JOIN pessoas p ON p.id = c.pessoa_id WHERE c.id = ?",
            params=(cid,), fetch_one=True))

    def test_digitar_cpf_da_esposa_inverte_so_aquele_lote(self):
        update_confrontante(2, _titular_esposa())

        lote_b = self._pessoa_de(2)
        self.assertEqual(lote_b["nome"], "Esposa Lujan")
        self.assertEqual(lote_b["genero"], "F")
        self.assertEqual(lote_b["nome_conjuge"], "Marido Lujan")
        self.assertNotEqual(lote_b["id"], 10)

        # Os outros lotes continuam com o marido como titular, na pessoa original
        for cid in (1, 3):
            p = self._pessoa_de(cid)
            self.assertEqual(p["id"], 10)
            self.assertEqual(p["nome"], "Marido Lujan")
            self.assertEqual(p["genero"], "M")
            self.assertEqual(p["nome_conjuge"], "Esposa Lujan")

    def test_segundo_lote_da_esposa_reaproveita_a_mesma_pessoa(self):
        update_confrontante(2, _titular_esposa())
        update_confrontante(3, _titular_esposa())
        self.assertEqual(self._pessoa_de(2)["id"], self._pessoa_de(3)["id"])
        self.assertEqual(self._pessoa_de(1)["id"], 10)

    def test_mesmo_titular_continua_atualizando_a_pessoa_compartilhada(self):
        # Mesmo CPF = mesma pessoa: corrigir um dado vale para todos os lotes dela (comportamento mantido)
        update_confrontante(1, _titular_marido(profissao="Pecuarista"))
        for cid in (1, 2, 3):
            self.assertEqual(self._pessoa_de(cid)["id"], 10)
        prof = execute_query("SELECT profissao FROM pessoas WHERE id = 10", fetch_one=True)["profissao"]
        self.assertEqual(prof, "Pecuarista")

    def test_pessoa_sem_cpf_recebe_o_cpf_sem_se_separar(self):
        with DatabaseManager() as conn:
            conn.execute("UPDATE pessoas SET cpf_cnpj = NULL WHERE id = 10")
        update_confrontante(1, _titular_marido())
        for cid in (1, 2, 3):
            self.assertEqual(self._pessoa_de(cid)["id"], 10)

    def test_pessoa_nao_compartilhada_e_corrigida_no_lugar(self):
        # Só o lote 1 usa a pessoa 10 (remove os outros): trocar o CPF é correção de cadastro, não cria pessoa nova
        with DatabaseManager() as conn:
            conn.execute("DELETE FROM confrontantes WHERE id IN (2, 3)")
        update_confrontante(1, _titular_esposa())
        self.assertEqual(self._pessoa_de(1)["id"], 10)
        self.assertEqual(self._pessoa_de(1)["nome"], "Esposa Lujan")


if __name__ == "__main__":
    unittest.main()
