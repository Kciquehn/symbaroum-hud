# Auditoria do Symbaroum HUD — 19/10/2026

## Resultado e alcance

**Revisão de código concluída, com correções locais. Validação prática das alterações desta auditoria no Foundry v13 pelo auditor pendente.** O responsável pelo módulo informou que todo o desenvolvimento e seus testes anteriores ocorreram na v13. Esta auditoria não certifica que o módulo esteja livre de defeitos nem pronto para publicação.

Base revisada: versão 0.1.88, repositório inicialmente sem alterações. Foram examinados inicialização, configurações, hooks, aplicação e template, CSS, permissões, serviços de ator, combate, morte, corrupção, rituais, armazenamento, atalhos, integração com Ind Resources e Item Piles, PDF, taxonomia, origem de conteúdo, serviços antigos de loja/contratos/estoque, idiomas, manifesto, documentação e workflows.

Referências locais: Symbaroum 6.1.6 e Symbaroum Ind Resources 0.18.47. O ambiente de desenvolvimento e testes informado pelo responsável é **Foundry v13**, coerente com o manifesto. Um executável v12 encontrado em outro caminho não identifica o ambiente usado no projeto e não constitui evidência de uso ou teste na v12. Nesta auditoria, o auditor executou testes automatizados e não realizou uma sessão prática no Foundry v13. A biblioteca externa minificada `pdf-lib` foi usada nos testes de exportação; não foi feita auditoria interna de seu código minificado.

Não houve alteração de identidade, versão, URLs ou compatibilidade do módulo. Não foram editados mundos, atores ou itens existentes, nem feitos commit, push, tag ou release. A atualização de flags de atalhos ocorre somente quando o usuário altera um atalho no Foundry.

## Defeitos corrigidos no fluxo atual

| Área | Defeito confirmado | Correção aplicada |
| --- | --- | --- |
| Seleção e permissões | O ator anterior permanecia quando a seleção automática não retornava um ator acessível. O fallback manual podia recuperar um ator sem Observador. | Limpar a seleção automática vazia e revalidar acesso ao ator manual; a busca mundial deixa de reinserir o objeto antigo. |
| Hooks | Alterações da propriedade de outros atores e troca/exclusão de tokens não invalidavam suficientemente a seleção. | Atualização por propriedade e por troca/exclusão de token. |
| Corrupção | O HUD omitia `longterm` no total e na barra; o limite temporário também desconsiderava essa parcela. | Usar o total preparado e incluir longo prazo na composição e nos limites, preservando as demais parcelas. |
| Armadura | Rolar uma armadura específica podia usar `baseProtection` e perder bônus preparados pelo sistema. | Priorizar a armadura correspondente em `system.armors`. Escapar os textos do cartão da rolagem. |
| Morte com Ind Resources | O botão chamava diretamente a rolagem nativa, contornando o fluxo autorizado da automação. A recuperação apenas zerava falhas. O anúncio nativo de zero Vitalidade competia com a automação. | Encaminhar o usuário ao teste autorizado no chat; solicitar o prompt pela API quando autorizado; delegar recuperação. Com a automação ativa, deixar a transição de personagem a zero com o Ind Resources. |
| Rituais | Comprar um ritual além dos seis gratuitos podia criar XP negativo com `optionalMoreRituals`. | Conferir o custo e saldo nativos antes de criar o item adicional. O sistema continua calculando o gasto. |
| Uso de itens | Cancelar Cura Herbal via API podia abrir/executar o serviço outra vez. | Um retorno cancelado de um item reconhecido pela API encerra a ação. |
| Persistência da hotbar | Chaves de ator com UUID e remoção por omissão eram incompatíveis com expansão de caminhos e mesclagem recursiva de flags. | Formato interno v3 com array de registros; leitura do formato anterior, inclusive UUIDs expandidos. Remoção e movimentação deixam de ressuscitar slots. |
| Hotbar e troca de ator | O ator de destino era capturado depois de aguardar o documento. | Capturar o ator ao iniciar o drop. |
| Hotbar e concorrência local | Duas atribuições simultâneas podiam sobrescrever seus estados. | Serializar as operações locais que alteram atalhos. Isso não é uma transação entre duas sessões do mesmo usuário. |
| Atalhos de poderes | Rituais e poderes sem script/ação utilizável ficavam sem efeito ao clicar. | Abrir a ficha quando o item não oferece execução. |
| Desativação | Desligar o HUD mantinha a interceptação dos atalhos e o atributo global de tema. | Respeitar a configuração de ativação, retirar o tema global e atualizar a hotbar. |
| Drag-and-drop | Destinos de armas, rituais, poderes e traços exigiam ler JSON durante `dragover`, quando o navegador protege o conteúdo. | Admitir o tipo de transferência durante a passagem; validar o documento no drop. |
| Recarga da aljava | O primeiro handler lia `quiverId`, mas o botão do inventário fornecia `containerId`. O handler correto era inalcançável. | Unificar a ação e reconhecer ambos os identificadores, delegando à API quando disponível. |
| Retirada de munição | A entrada virtual `loaded-legacy` era exibida, mas não era retirada. O fallback ignorava os metadados preservados pela API atual. | Preferir a retirada pública de munição e tratar a entrada legada no fallback; conferir propriedade antes de alterar. |
| Menu do inventário | Observador não conseguia usar “Abrir ficha”, apesar de essa leitura ser permitida. | Separar a permissão de consulta das ações de alteração. |
| Texto em HTML | Nomes de itens eram interpolados sem escape na confirmação de exclusão; o cartão de descarte também interpolava nomes e imagem sem escape. | Escapar os valores textuais antes de gerar HTML. |
| Descarte via Item Piles | Copiar para uma pilha e apagar depois permitia duplicação em chamadas concorrentes ou falha na exclusão. A criação também usava argumentos de cena inconsistentes. | Bloqueio local por item; criar destino vazio com `sceneId` e transferir pela API do Item Piles, sem segunda exclusão local. Exigir propriedade e confirmação da transferência. |
| PDF | Personagem sem documento de armadura ficava sem Defesa exportada. | Preencher Defesa e proteção preparadas mesmo sem armadura. |
| Documentação | README e descrição do pacote anunciavam Criador de Fichas e telas globais ausentes. | Descrever os recursos realmente conectados e as limitações verificadas. |

A integração de descarte foi ajustada conforme a [API pública de Item Piles](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/blob/master/docs/api.md#createitempile), usando criação de destino vazio e transferência. O módulo não está instalado neste ambiente; a execução real dessa integração permanece pendente. Uma transferência recusada pode deixar um destino vazio; o HUD não apaga automaticamente esse destino, para evitar excluir itens caso a operação externa tenha sido parcialmente concluída.

## Correções adicionais dos serviços de loja e contratos

Após autorização para corrigir as pendências, os seis defeitos identificados nessa área foram corrigidos. As telas antigas continuam desconectadas da interface; os serviços e seus dados foram preservados.

| Defeito identificado | Correção aplicada | Evidência automatizada |
| --- | --- | --- |
| Compras simultâneas entre clientes usavam o mesmo saldo anterior. | Pedidos passam pelo mestre ativo, com uma fila por ator e saldo relido na autoridade. O canal nativo usa o remetente fornecido pelo servidor. | Dois clientes independentes com cópias desatualizadas do saldo fazem duas compras; apenas uma é aprovada. |
| Jogadores podiam substituir saldo/preço ou conceder itens gratuitos. | Opções administrativas exigem GM, tanto na entrada quanto na autoridade. Jogadores enviam referências e a autoridade resolve o documento e seu preço atual. | Pedidos diretos à autoridade com overrides, snapshot forjado ou concessão gratuita são rejeitados. |
| O limite de 200 registros eliminava contratos ativos. | Removido o truncamento em normalização, cadastro e compra. IDs já cadastrados não são adicionados novamente. | Normalização/cadastro mantêm 201 registros; a 201ª compra preserva o primeiro direito ativo. |
| Consumos simultâneos perdiam descontos ou sobrescreviam compras. | Cadastro, consumo, remoção e compras compartilham a mesma fila por ator no mestre. | Dois usos deixam um disponível de três; compra simultânea com consumo preserva ambos. |
| Essenciais desapareciam na rolagem de disponibilidade sem diagnóstico. | Essenciais têm precedência sobre disponibilidade aleatória. Exclusão explícita do GM com chance zero permanece válida e é informada em missingEssentials. | Essencial aparece com rolagem 0,99; chance explícita zero não aparece nem com rolagem zero e é diagnosticada. |
| Várias armaduras viravam um documento com quantidade não nativa. | Cada armadura comprada ou concedida gera um documento individual, sem system.number. Armas e equipamentos mantêm sua quantidade nativa. | Duas compradas e duas concedidas geram quatro documentos; a cobrança inclui somente as compradas. |

Também foram corrigidos consumo de contrato expirado, consumo indevido de direito permanente, repetição de cadastro, cobrança sem itens quando a criação é cancelada/parcial e concessão de itens quando a atualização de pagamento é cancelada. Uma criação parcial confirmada é removida antes da restituição; falha na compensação é retornada como rollbackFailed.

O coordenador está em scripts/services/actor-transaction-service.mjs. Não foi adicionada dependência de socketlib. O manifesto habilita apenas o canal próprio com socket: true; ID, versão, URLs e compatibilidade permanecem iguais. A configuração mundial de serviços personalizados também foi registrada, pois seu identificador já existia, mas faltava o registro.

As respostas são aceitas somente do mestre selecionado. Pedidos repetidos do mesmo remetente/ID são deduplicados em memória por dez minutos; payload diferente com o mesmo ID é rejeitado. Não há execução local alternativa nem repetição automática quando não existe GM, ocorre timeout ou a autoridade muda antes do processamento. A indisponibilidade é informada ao chamador.

**Limites:** a fila coordena somente operações que passam por esses serviços. Não bloqueia edições manuais de dinheiro nem alterações de outros módulos. Deduplicação e fila não persistem após recarregar o mestre; uma desconexão durante uma operação já iniciada exige conferir o resultado antes de repetir. O estoque de uma loja não possui interface ativa nem fluxo de checkout conectado: os testes corrigem o gerador e a compra de documentos/serviços, sem afirmar uma integração de estoque inexistente.

A implementação usa o canal nativo de módulos do Foundry; o tratamento do remetente foi conferido no [código do socketlib instalado e seu equivalente público](https://github.com/farling42/foundryvtt-socketlib/blob/develop/src/socketlib.js), que recebe senderId como argumento do transporte. A execução em rede real no Foundry v13 segue na checklist; os testes usam transporte simulado e instâncias independentes de clientes.

## Mecânicas conferidas e limites

- Defesa e proteção possuem valores preparados pelo sistema; a apresentação de criaturas usa seu modificador nativo.
- A experiência gasta em Habilidades/Poderes é derivada pelo Symbaroum. A ausência de um débito separado no HUD não é, por si só, defeito; debitar novamente cobraria em duplicidade.
- O sistema usa Corrupção temporária + longo prazo + permanente. A conferência foi feita em `script/common/actor.js` do sistema local.
- O custo dos rituais adicionais deriva de `optionalMoreRituals` e `expCosts.ritual`, com seis gratuitos na configuração instalada.
- Os caminhos de moeda correspondem aos campos nativos; conversão local usa 1 táler = 10 xelins = 100 ortegas.
- As capacidades exibidas de Ritualista são 1/3/6. Esta auditoria conferiu a implementação e as referências locais, sem uma nova revisão integral dos livros oficiais.
- O PDF contém mapeamento específico dos nomes internos da ficha traduzida. Não é um mapeamento universal para qualquer PDF. O arquivo oficial real não foi aberto/renderizado nesta auditoria.
- A implementação atual mantém apresentação clássica e configurações/dados de recursos removidos. Isso aumenta a manutenção, mas apagar esses arquivos ou flags históricos não foi necessário para as correções.

## Verificações executadas

- Linha de base: **226 testes aprovados**.
- Após as duas etapas de correção: **267 testes aprovados**, sem falhas ou testes ignorados.
- Novos casos incluem perda de permissão, ausência de personagem, Corrupção de longo prazo, proteção preparada, custo de ritual adicional, integração de morte, cancelamento de Cura Herbal, persistência legada de atalhos, UUID de ator de token, troca de ator durante drop, operações concorrentes locais, poderes de consulta, desativação, descarte e PDF sem armadura.
- A segunda etapa acrescenta 20 testes de transações, permissões, concorrência entre clientes simulados, retenção de contratos, essenciais e documentos de armadura.
- Os testes de exportação criam e preenchem um PDF em memória, verificando campos editáveis e checkboxes.
- `git diff --check` sem erros de whitespace.
- Testes de estrutura e correspondência entre idiomas/manifesto incluídos na suíte. Parte desses testes inspeciona texto de fontes; eles não demonstram funcionamento de DOM ou sockets reais.

Comando principal:

```powershell
node --test tests/*.test.mjs
```

## Checklist para validação real no Foundry v13

- [ ] Abrir mundo de teste com Symbaroum 6.1.6, primeiro sem Ind Resources e depois com a versão instalada correspondente.
- [ ] Conferir console na inicialização, desativação/reativação do HUD e recarga do navegador.
- [ ] Usar mestre e jogador em clientes distintos; conferir proprietário, observador e ator sem acesso.
- [ ] Selecionar manualmente e automaticamente atores; revogar acesso, excluir ator/token, trocar ator de token e remover personagem atribuído.
- [ ] Conferir hotbar nativa do mestre e atalhos por ator do jogador, inclusive token não vinculado, troca rápida, remoção, movimentação, macro sobre atalho e persistência após recarregar.
- [ ] Arrastar itens reais de fichas, diretórios e compêndios aos destinos do HUD; rejeitar tipos incompatíveis e impedir alteração por Observador.
- [ ] Confirmar no inventário que o botão de recarga atua na aljava clicada, inclusive com mais de uma aljava; testar retirada atual e legada e conservação das quantidades/metadados.
- [ ] Conferir proteção de armadura com bônus de Habilidades, armadura sem bônus, personagem sem armadura e criatura.
- [ ] Conferir Corrupção com todas as parcelas, limiar/máximo e avisos no chat.
- [ ] Zerar Vitalidade com automação de morte ligada/desligada; conferir prompt autorizado, turno, recuperação, falhas e morte, sem duplicação de mensagens ou testes.
- [ ] Cancelar Cura Herbal e rações; confirmar que o diálogo não reabre e que não há consumo extra.
- [ ] Testar compra de ritual adicional com saldo insuficiente/suficiente e gasto derivado correto.
- [ ] Conferir compras e contratos por chamada aos serviços, com dois clientes proprietários, GM ativo, ausência de GM, preço alterado no mestre, perda de propriedade e falhas de criação/pagamento.
- [ ] Instalar Item Piles compatível em mundo de teste; conferir destino na cena correta, transferência por jogador/GM, clique duplo, recusa, desconexão e inventário após falha.
- [ ] Conferir visual completo/mínimo/oculto, hotbar após desativação, menus, rolagem, efeitos, Táticas, zoom e resoluções de tela usadas na mesa.
- [ ] Exportar com a ficha PDF real configurada; conferir Defesa sem armadura, atributos, textos, limites de campos e edição posterior.

**Critério de liberação:** concluir os testes aplicáveis do fluxo atual no v13. Antes de conectar novamente uma interface de comércio, validar os serviços corrigidos em rede real com dois clientes, incluindo desconexão e compensação de falhas. O manifesto não foi ampliado para v12 ou v14.
