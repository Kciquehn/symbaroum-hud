# Symbaroum HUD

HUD independente para o sistema Symbaroum 6.1.6 no Foundry VTT v13.

Manifest URL:

```text
https://github.com/Kciquehn/symbaroum-hud/releases/latest/download/module.json
```

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

Não declarei compatibilidade com Foundry v14 porque este módulo foi desenvolvido e validado para o alvo atual v13/Symbaroum 6.1.6.

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

O manifesto já aponta para os assets esperados em GitHub Releases:

- Repositório: `https://github.com/Kciquehn/symbaroum-hud`
- Manifest: `https://github.com/Kciquehn/symbaroum-hud/releases/latest/download/module.json`
- Download: `https://github.com/Kciquehn/symbaroum-hud/releases/latest/download/symbaroum-hud.zip`

Para publicar uma versão:

```powershell
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

O workflow `.github/workflows/release.yml` cria uma GitHub Release com `module.json` e `symbaroum-hud.zip`.

Para a loja oficial do Foundry:

1. publique o repositório no GitHub;
2. publique a release com os dois assets;
3. verifique se a Manifest URL instala em um Foundry v13 limpo;
4. envie o pacote pelo formulário oficial de criadores do Foundry;
5. use o conteúdo de `FOUNDRY-PACKAGE-DESCRIPTION.html` como descrição HTML.

## Licença e aviso

Código sob licença MIT. Veja `LICENSE`.

Este módulo não inclui conteúdo, regras textuais ou arte oficial de Symbaroum. Symbaroum pertence à Free League Publishing.
Este é um projeto independente da comunidade e não é afiliado nem endossado pela Free League Publishing ou pela Foundry Virtual Tabletop.
