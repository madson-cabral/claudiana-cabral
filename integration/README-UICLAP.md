# Integração UICLAP — execução pendente no Worker

## Estado
- Banco Neon PRODUÇÃO: tabelas `claudiana.uiclap_intents` e `claudiana.uiclap_intent_events` criadas.
- Site: o formulário e JS estão SOMENTE na branch `feature/uiclap-cadastro-manual-20261104`.
- Este código NÃO deve ser mesclado na branch publicada antes do endpoint estar operacional.
- Worker real: `D:\Bio site Claudiana\Claudiana_Admin_Correcao_Redirect\src\worker.js`
- Painel real: `D:\Bio site Claudiana\Claudiana_Admin_Correcao_Redirect\public\admin\index.html`

## Endpoint esperado no Worker
`POST /api/store/uiclap-intents` => `createUiclapIntent(request, env, query)`

O arquivo `integration/uiclap-routes.js` contém o adaptador que depende da função de SQL já utilizada pelo Worker. **Não presuma o nome do adaptador**: use a conexão Neon existente, sem inserir credenciais no código.

Rotas administrativas a registrar **somente depois** do middleware Cloudflare Access/JWT já implementado:
- `GET /api/admin/uiclap-intents` => `listUiclapIntents(query)`
- `PATCH /api/admin/uiclap-intents` => `updateUiclapStatus(request,query,actorVerificado)`

O e-mail/ator deve vir da identidade autenticada, nunca do corpo da requisição.

## Segurança exigida
- Preserve o middleware Cloudflare Access nas rotas /api/admin.
- Preserve CORS restrito a https://madson-cabral.github.io e método POST para a rota pública.
- Valide Turnstile, limites de requisições e tamanho máximo do corpo antes de processar.
- Não registre nome, telefone, e-mail ou token em logs.
- Não inclua UICLAP nos indicadores de receita Asaas.
- Não atualize estoque do livro Mulher Ensinável.
- O cadastro não indica pagamento.
- A confirmação manual exige referência da compra encontrada na UICLAP.
- Envio só pode ser marcado após confirmação na UICLAP.

## UI administrativa a incorporar
Criar seção separada "Cadastros UICLAP" com lista e filtros por status:
`AWAITING_VERIFICATION`, `PAYMENT_CONFIRMED`, `AWAITING_SHIPMENT`, `SHIPPED`, `DELIVERED`, `NOT_FOUND`, `CANCELLED`.
Campos: data, nome, WhatsApp, livro, quantidade, preço de referência, ID UICLAP e rastreamento.
Ações: Confirmar pagamento (referência obrigatória), Aguardando envio, Enviado (transportadora/rastreio se disponíveis), Entregue, Não localizado, Cancelado.
Cada ação envia PATCH autenticado ao Worker; não armazenar dados pessoais no localStorage.

## Ordem correta
1. Integrar módulo no Worker local e adicionar a seção administrativa, sem mexer nos fluxos Asaas.
2. Publicar Worker, preservando segredos e rotas.
3. Verificar que o endpoint público aceita exclusivamente cadastro validado com Turnstile e que o painel lê as intenções.
4. Só então mesclar a branch do site para produção.
