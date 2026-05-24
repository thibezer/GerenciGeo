---
description: Regra de CRUD
---

Sempre que criar uma interface de formulário para manipulação de dados, implemente o ciclo CRUD completo: deve haver botões claros para Salvar (novo registro), Atualizar/Editar (registros existentes) e Excluir e toda ação de Exclusão ou Reset deve disparar um pop-up de confirmação (ex: 'Tem certeza que deseja excluir?') antes de executar a função no banco de dados. Adicione uma lógica de verificação para habilitar/desabilitar o botão 'Excluir' apenas quando um registro existente estiver selecionado.