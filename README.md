# Symbaroum HUD

HUD independente para o sistema Symbaroum, integrado à hotbar do Foundry VTT.

## Compatibilidade

- Foundry VTT v13, conforme o manifesto.
- Sistema Symbaroum 6.1.6.
- Symbaroum Ind Resources opcional e recomendado.
- Item Piles opcional para descartar itens na cena.
- Idiomas: português do Brasil e inglês.

A auditoria de código de 19/10/2026 comparou o módulo aos arquivos locais do Symbaroum 6.1.6 e do Ind Resources 0.18.47. O desenvolvimento e os testes anteriores do responsável pelo módulo foram realizados no Foundry v13, conforme informado por ele. As alterações desta auditoria passaram pelos testes automatizados; sua validação prática pelo auditor dentro do Foundry v13 permanece pendente. Consulte [AUDIT.md](AUDIT.md) para resultados e testes pendentes.

## Recursos disponíveis

- HUD simplificado com modos Completo, Mínimo e Oculto.
- Retrato, Vitalidade, Corrupção, Defesa, proteção de armadura, oito Atributos, dinheiro e experiência.
- Corrupção temporária, de longo prazo e permanente, usando o total preparado pelo sistema.
- Seleção por token controlado, turno de combate ou personagem atribuído; seleção manual de atores acessíveis.
- Painéis de ações, inventário, Habilidades, Traços, Poderes Místicos e Rituais.
- Rolagens nativas do Symbaroum e rolagem da proteção preparada de armaduras.
- Efeitos ativos e Táticas de criaturas para consulta pelo mestre.
- Atalhos de documentos na hotbar, separados por ator para jogadores; hotbar nativa para o mestre.
- Arrastar documentos para os destinos de inventário, ataques, rituais, poderes e traços suportados.
- Exportação de personagens para uma cópia configurada da ficha PDF editável.

O Criador de Fichas foi removido na versão 0.1.87. Os antigos navegadores globais de compêndios e a interface de loja também não estão conectados à aplicação atual. Alguns serviços e dados permanecem no código para compatibilidade histórica; sua presença não significa que essas telas estejam disponíveis.

Os serviços de compras e contratos foram corrigidos para executar alterações por uma fila no mestre ativo, com validação de propriedade, preço e opções administrativas. Eles exigem um mestre conectado; não executam uma compra local quando a autoridade está indisponível. Contratos existentes são preservados sem truncamento por quantidade. No gerador, essenciais prevalecem sobre a disponibilidade aleatória, exceto quando o mestre exclui explicitamente um item com chance zero; a ausência é informada no resultado.

## Instalação

Em **Add-on Modules > Install Module**, use o manifesto:

```text
https://github.com/Kciquehn/symbaroum-hud/releases/latest/download/module.json
```

Ative o módulo no mundo Symbaroum. Para instalação manual, extraia a pasta `symbaroum-hud` da release para `Data/modules` e reinicie o Foundry.

## Seleção e permissões

O modo padrão procura um token controlado, depois o combatente atual e, por último, o personagem atribuído ao usuário. Os modos Combate e Personagem priorizam sua respectiva origem. Para o mestre, um token controlado prevalece sobre esses modos.

A seleção manual permite consultar outro ator acessível. Se a permissão de Observador for retirada, o HUD abandona esse ator na próxima atualização. Quando a origem automática não oferece um ator acessível, o retrato vazio substitui a seleção anterior.

**Observador** permite consultar informações e abrir fichas. **Proprietário** é necessário para rolagens e alterações.

## Uso

Clique no retrato para abrir a ficha. Clique em um atributo ou arma para usar a ação correspondente. Na Vitalidade, informe `+3` para curar ou `-9` para sofrer dano; os botões explícitos também estão disponíveis. O diálogo de Corrupção altera apenas a parcela temporária.

Com a automação de morte do Ind Resources ativa, use a solicitação de Teste de Morte no chat. O botão do HUD orienta esse fluxo e o mestre pode gerar a solicitação. Dano que reduz um personagem a zero é tratado pela automação. Sem essa automação, permanece o comportamento nativo de condição e teste de morte.

Com a integração de prontidão ativa, clicar em uma arma guardada pede confirmação para sacá-la. Clique novamente para atacar. O lembrete de ação de movimento é informativo.

Arraste documentos para a hotbar para criar atalhos. Jogadores mantêm seus atalhos por ator, incluindo atores de tokens não vinculados. Um poder ou ritual sem ação executável abre sua ficha. `Shift` ao ativar um atalho abre a ficha diretamente.

O menu do inventário oferece as ações suportadas pelo item e pelas integrações. Descartar na cena exige a API de criação e transferência do Item Piles; o HUD delega a transferência ao módulo.

## Integração com Ind Resources

Quando ativo, o HUD consulta a API pública `game.tenebreResources` para carga, recipientes, rações, fome, munição, aljavas, dinheiro, manobras, descanso, prontidão e outros recursos disponíveis. As automações pertencem ao Ind Resources.

Recarga e retirada de munição usam os serviços públicos de munição quando disponíveis. Cancelar o uso de um item tratado pela API encerra a ação.

## Configurações

As preferências de ativação, seleção, integração com Ind Resources, botão de prontidão, lista de jogadores e visualização do inventário pertencem a cada cliente. O tema atual é o simplificado. Desativar o HUD também desativa a interceptação dos atalhos e retira seu tema global da hotbar.

O mestre pode configurar **Ficha PDF editável** com o caminho de sua própria cópia do PDF. O módulo não distribui a ficha oficial. A exportação preenche os campos e preserva sua edição; o mapeamento de atributos é específico da ficha traduzida descrita no serviço de exportação. Outros modelos precisam de validação.

## Desenvolvimento e validação

Requer Node.js 20 ou superior, sem etapa de build:

```powershell
node --test tests/*.test.mjs
```

Os testes incluem serviços, permissões, contexto, hooks, persistência de atalhos, inventário, integrações e preenchimento do PDF. Uma parte da suíte verifica estrutura textual; passar nesses testes não substitui uma sessão no Foundry.

Antes de publicar, testar no v13 com mestre e jogador, tokens vinculados e não vinculados, perda de permissões, troca de atores, Ind Resources ativo e desativado, morte, aljavas, drag-and-drop, Item Piles, tamanhos de tela e o PDF real. A checklist detalhada consta em [AUDIT.md](AUDIT.md).

Tags `v*` acionam a release; a tag precisa corresponder à versão de `module.json`.

## Licença

O código original usa a [licença MIT](LICENSE). A licença não se estende ao nome, às regras, aos textos, às ilustrações ou a outros materiais de Symbaroum. Symbaroum pertence à Free League Publishing. Este projeto independente não é afiliado nem endossado pela Free League Publishing ou pela Foundry Virtual Tabletop.
