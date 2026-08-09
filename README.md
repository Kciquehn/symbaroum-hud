# Symbaroum HUD

[![Check](https://github.com/Kciquehn/symbaroum-hud/actions/workflows/check.yml/badge.svg)](https://github.com/Kciquehn/symbaroum-hud/actions/workflows/check.yml)
[![Foundry VTT v13](https://img.shields.io/badge/Foundry_VTT-v13-5c1f1f)](https://foundryvtt.com/)
[![Symbaroum 6.1.6](https://img.shields.io/badge/Symbaroum-6.1.6-3f4b35)](https://foundryvtt.com/packages/symbaroum)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Um HUD independente para **Symbaroum**, criado para manter as informações e ações mais usadas do personagem ao alcance da hotbar do Foundry VTT.

O módulo usa as rolagens e os documentos nativos do sistema. Ele não altera o schema do Symbaroum, não executa migrações e não substitui as regras do sistema ou de módulos integrados.

> Compatibilidade atual: **Foundry VTT v13** e **Symbaroum 6.1.6**.

## Principais recursos

- HUD persistente integrado à hotbar do Foundry;
- controles laterais distribuídos por toda a altura do HUD;
- seleção pelo token controlado, combatente atual ou personagem atribuído;
- troca rápida entre atores que o usuário pode acessar;
- barras de Vitalidade e Corrupção reveladas ao passar o mouse sobre o retrato, além de Defesa, armadura, carga, dinheiro e experiência;
- efeitos imersivos graduais de sangue no retrato e rachaduras no HUD conforme a Vitalidade diminui;
- rolagem dos oito atributos, armas, armadura e teste de morte;
- recuperação, descanso, custo de nova rolagem e efeitos ativos;
- painéis de ataques, habilidades, traços, poderes místicos e rituais;
- busca e adição de habilidades ou rituais existentes no mundo;
- painel de Ritualista com grau, capacidade e progressão;
- descrições completas expansíveis no seletor de manobras;
- atalhos de documentos na hotbar, separados por ator para jogadores;
- drag-and-drop entre inventário, recipientes, aljava, armas, rituais, poderes místicos e hotbar;
- adição de traços, dádivas e fardos ao arrastá-los diretamente para o botão de traços;
- indicação visual de armas sacadas;
- confirmação para sacar uma arma guardada antes do ataque, com lembrete do custo de ação de movimento;
- interface em português do Brasil e inglês.

## Instalação

### Pelo manifesto

No Foundry VTT, abra **Add-on Modules**, escolha **Install Module** e cole esta URL em **Manifest URL**:

```text
https://github.com/Kciquehn/symbaroum-hud/releases/latest/download/module.json
```

Depois da instalação, ative **Symbaroum HUD** em **Manage Modules** dentro do mundo.

### Instalação manual

1. Baixe `symbaroum-hud.zip` na [release mais recente](https://github.com/Kciquehn/symbaroum-hud/releases/latest).
2. Extraia a pasta `symbaroum-hud` no diretório `Data/modules` do Foundry.
3. Reinicie o Foundry e ative o módulo no mundo.

## Requisitos e compatibilidade

| Componente | Versão | Situação |
| --- | --- | --- |
| Foundry Virtual Tabletop | 13 | Obrigatório e validado |
| Symbaroum | 6.1.6 ou superior na série compatível | Obrigatório; validado em 6.1.6 |
| Symbaroum Ind Resources | Compatível com sua instalação | Opcional e recomendado |

O manifesto está limitado ao Foundry v13. O módulo ainda não declara compatibilidade com v14 porque essa versão não faz parte do ambiente atualmente validado.

## Como o ator é escolhido

O modo padrão procura, nesta ordem:

1. um token controlado;
2. o combatente do turno atual;
3. o personagem atribuído ao usuário.

Essa preferência pode ser alterada nas configurações do módulo. As setas próximas ao retrato percorrem os atores acessíveis sem alterar a seleção de tokens.

O HUD permite visualizar atores com permissão de **Observer**, mas ações, rolagens e alterações exigem permissão de **Owner**.

## Configurações

As configurações são individuais por cliente:

- **Ativar HUD:** mostra ou oculta toda a interface;
- **Modo de seleção:** escolhe entre token controlado, combate ou personagem atribuído;
- **Mostrar Ind Resources:** habilita os elementos da integração quando o módulo estiver ativo;
- **Ocultar lista de jogadores:** ativada por padrão, libera espaço na lateral da tela enquanto o HUD estiver em uso.

O modo de visualização do inventário, em grade ou lista, também é lembrado individualmente.

## Uso rápido

- Passe o mouse sobre o retrato para revelar o nome e as setas de troca; clique na imagem para abrir a ficha do ator.
- Clique na barra de Vitalidade para curar o personagem ou aplicar uma quantidade de dano.
- Ao chegar a 50% de Vitalidade, o retrato começa a apresentar sangue; com 25% ou menos, o efeito se intensifica e o HUD passa a exibir rachaduras.
- Clique na barra de Corrupção para aumentar ou reduzir a Corrupção temporária; a permanente é preservada.
- Ao ganhar Corrupção pelo HUD, os avisos nativos de proximidade, limiar e corrupção máxima também são enviados ao chat.
- Clique em um atributo, arma ou ação disponível para usar a operação nativa do Symbaroum.
- Ao atacar com uma arma guardada, confirme o aviso para sacá-la pelo Ind Resources e continuar o ataque.
- Clique no selo **Sacada** de uma arma para guardá-la sem realizar um ataque.
- Use os botões laterais para abrir inventário, ataques, habilidades, traços, poderes místicos e rituais.
- Clique com o botão direito em um efeito ativo para abrir o menu de remoção.
- Arraste documentos para a hotbar para criar atalhos sem precisar criar macros.
- Para jogadores, esses atalhos acompanham o ator exibido no HUD. O GM continua usando a hotbar normal do Foundry.

## Integração com Symbaroum Ind Resources

[Symbaroum Ind Resources](https://foundryvtt.com/packages/symbaroum-ind-resources) é opcional, mas recomendado para aproveitar todos os recursos do HUD.

Quando a integração está ativa, o HUD usa a API pública do Ind Resources para:

- carga e recipientes;
- pão de viagem e fome;
- aljavas, munição e recuperação de munição;
- dinheiro;
- manobras;
- descanso;
- prontidão de armas;
- recursos relacionados a rituais.

Essas regras continuam pertencendo ao Ind Resources; o HUD apenas apresenta e aciona sua API. Sem ele, os recursos nativos do Symbaroum continuam disponíveis normalmente.

## Solução de problemas

### O HUD não aparece

- confirme que o mundo usa o sistema Symbaroum;
- confirme que o módulo está ativo e que **Ativar HUD** está habilitado;
- selecione um token ou atribua um personagem ao usuário;
- recarregue o navegador com `Ctrl+F5` após atualizar o módulo.

### Uma ação está desabilitada

O usuário precisa ter permissão de **Owner** sobre o ator. Permissão de **Observer** permite visualizar o HUD, mas não alterar a ficha nem executar rolagens.

### Os recursos de inventário ou munição não aparecem

Confirme que o Symbaroum Ind Resources está ativo, compatível e habilitado nas configurações do HUD.

Se o problema persistir, abra uma [issue](https://github.com/Kciquehn/symbaroum-hud/issues) informando as versões do Foundry, Symbaroum e módulos relacionados, além dos erros exibidos no console do navegador (`F12`).

## Desenvolvimento

O projeto usa módulos JavaScript nativos e não possui etapa de build. É necessário Node.js 20 ou superior para executar as verificações locais:

```powershell
npm test
```

A suíte cobre serviços do ator, permissões, contexto, hooks, armazenamento, integração com Ind Resources, rituais e atalhos da hotbar.

Antes de publicar uma versão, também é recomendável validar em um mundo de teste:

- GM e jogador;
- token selecionado, personagem atribuído e troca entre atores;
- Ind Resources ativo e desativado;
- hotbar por ator para jogador e hotbar comum para GM;
- inventário, recipientes, aljava, armas, habilidades, rituais e poderes místicos.

Tags no formato `v*` acionam o workflow de release. A tag precisa corresponder à versão declarada em `module.json`; os testes são executados antes da criação do pacote.

## Licença e aviso legal

O código está disponível sob a [licença MIT](LICENSE).

Este módulo não inclui textos de regras, conteúdo ou arte oficial de Symbaroum. Symbaroum pertence à Free League Publishing. Este é um projeto independente da comunidade e não é afiliado nem endossado pela Free League Publishing ou pela Foundry Virtual Tabletop.
