# Symbaroum HUD

HUD independente para o sistema Symbaroum 6.1.6 no Foundry VTT v13.

## Recursos

- HUD persistente no canto inferior esquerdo, integrado à hotbar do Foundry;
- seleção pelo token controlado, combatente atual ou personagem atribuído, com troca entre fichas acessíveis;
- Vitalidade, Corrupção, Defesa, armadura, carga, moedas, experiência e os oito atributos;
- rolagem dos oito atributos, teste de morte, recuperação, descanso e efeitos ativos;
- painel de habilidades, traços, poderes místicos e rituais;
- compra/adiciona habilidades e rituais a partir dos itens do mundo, com busca e sem precisar arrastar para a ficha;
- painel de Ritualista com imagem, grau, capacidade e progressão;
- atalhos de Documents na hotbar, por ator e sem criação obrigatória de macros;
- integração opcional com Symbaroum Ind Resources para inventário, recipientes, pão de viagem, aljava, munição, dinheiro, manobras, descanso e prontidão de armas;
- arrastar itens entre inventário, mochila, aljava, armas, rituais, poderes místicos e hotbar;
- indicação visual quando o personagem está com uma arma sacada.

O HUD chama métodos nativos do ator, como `rollAttribute`, `rollArmor`, `rollWeapon` e `usePower`.
Quando o Symbaroum Ind Resources está ativo, regras de inventário, munição, fome, dinheiro, manobras, descanso,
prontidão de armas e rituais continuam delegadas para a API pública dele.

## Compatibilidade

- Foundry VTT: v13
- Sistema: Symbaroum 6.1.6
- Módulo recomendado: Symbaroum Ind Resources

Este módulo não altera o schema do sistema e não executa migrações.

## Validação local

```powershell
npm run check
```

Antes de publicar uma release, teste em um mundo de teste do Foundry v13:

- GM e jogador;
- token selecionado, personagem atribuído e troca entre atores acessíveis;
- Ind Resources ativo e desativado;
- hotbar por ator para jogador e hotbar comum para GM;
- inventário, recipientes, aljava, armas, habilidades, rituais e poderes místicos;
- reload completo do navegador ou Ctrl+F5 após atualizar arquivos.

## Publicação

Para instalação direta pelo Foundry a partir do GitHub, o `module.json` ainda precisa receber URLs públicas quando o repositório existir:

- `url`: página do repositório;
- `manifest`: URL estável para o `module.json`;
- `download`: arquivo `.zip` da release correspondente.

Não declare compatibilidade com Foundry v14 sem teste real nessa versão.
