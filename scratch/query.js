const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('gerencigeo.db');

db.all("SELECT id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, ordem_caminhamento FROM pontos ORDER BY id DESC LIMIT 15", [], (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log("=== ÚLTIMOS 15 PONTOS NO BANCO ===");
  console.log(rows);
  
  db.all("SELECT * FROM matriculas", [], (err2, rows2) => {
    console.log("=== TODAS AS MATRÍCULAS ===");
    console.log(rows2);
    db.close();
  });
});
