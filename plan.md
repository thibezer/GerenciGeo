1. **Fix map reloading (flicker/fitBounds)**: Remove `ctx.mapaController.fitBounds(pontosMat);` from `renderTabelaMesaGeodesica` in `frontend/src/views/mesa_trabalho/mesa_geodesica.ts` (near line 194). This prevents the map from resetting its viewport on every minor render.
2. **Fix properties panel showing old data on single save**: In `frontend/src/views/mesa_trabalho/painel_propriedades.ts` around line 618:
   Change:
   `ctx.loadLevantamentoDetails();`
   To:
   `await ctx.loadLevantamentoDetails();`
   `atualizarPainelPropriedades(ctx);`
3. **Fix properties panel showing old data on batch save**: In `frontend/src/views/mesa_trabalho/painel_propriedades.ts` around line 1174:
   Change:
   `ctx.loadLevantamentoDetails();`
   To:
   `await ctx.loadLevantamentoDetails();`
   `atualizarPainelPropriedades(ctx);`
4. Use `set_plan` with this, run it, test it.
