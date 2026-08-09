# Changelog

## 0.1.31

- Mantém o botão de expandir a apenas quatro pixels do retrato quando o HUD estiver recolhido.
- Posiciona o controle no fluxo do retrato para evitar afastamentos causados pela largura anterior da interface.

## 0.1.30

- Evita que a seta de recolhimento seja duplicada quando o Foundry reconstruir a hotbar.
- Remove controles antigos antes de encaixar a nova seta funcional entre os slots e os controles direitos.

## 0.1.29

- Move a seta de recolhimento para o espaço entre o slot `0` e os controles de página, travar e excluir da hotbar.
- Encaixa o botão diretamente na estrutura nativa da hotbar para manter o posicionamento em diferentes resoluções.

## 0.1.28

- Corrige a ordem das camadas para que todos os painéis abertos do HUD apareçam à frente das Táticas e dos efeitos ativos.

## 0.1.27

- Adiciona uma seta ao lado dos controles direitos da hotbar para recolher ou expandir o HUD.
- No modo recolhido, mantém somente o retrato e a própria seta de restauração.
- Salva a preferência individualmente no navegador de cada usuário.

## 0.1.26

- Alinha o quadro de Táticas ao visual preto e dourado dos atributos do HUD.
- Exibe o texto das Táticas em um campo claro com o mesmo papel, borda e sombra interna dos valores numéricos.

## 0.1.25

- Posiciona o quadro de Táticas no lugar original dos efeitos ativos, encostado ao HUD.
- Move os ícones dos efeitos ativos para cima do quadro de Táticas.

## 0.1.24

- Exibe a Defesa de criaturas como modificador assinado, seguindo o mesmo valor `defmod` da ficha nativa.
- Considera automaticamente alterações preparadas pelo sistema, incluindo o efeito de Amoque, e calcula um valor compatível quando `defmod` não estiver disponível.

## 0.1.23

- Exibe as Táticas das fichas de criatura na área acima do HUD para consulta rápida do mestre.
- Mantém os efeitos ativos visíveis junto do novo quadro e aceita o texto formatado da ficha.

## 0.1.22

- Suaviza o sangue no retrato enquanto o personagem perdeu pouca Vitalidade e ainda está acima de 50%.
- Mantém a progressão mais intensa do sangue nos estados muito ferido e crítico.

## 0.1.21

- Deixa as rachaduras individuais mais brancas e contrastantes em todos os componentes do HUD.
- Aumenta a visibilidade progressiva das rachaduras nos estados ferido, muito ferido e crítico.

## 0.1.20

- Aplica a condição nativa `dead` quando o dano pelo HUD reduz a Vitalidade de um valor positivo para zero.
- Exibe a notificação de Morto e envia ao chat as mensagens nativas de morte e ferimento fatal do Symbaroum.
- Evita repetir a mensagem ao alterar um personagem que já estava com zero de Vitalidade.

## 0.1.19

- Permite digitar alterações rápidas como `+3` ou `-9` no campo de Vitalidade e aplicá-las com Enter.
- Mantém os botões Curar e Tomar dano com direção explícita, independentemente do sinal digitado.

## 0.1.18

- Ativa a borda vermelha pulsante de perigo quando o personagem chega a 25% de Vitalidade ou menos.
- Mantém o mesmo efeito para armas sacadas e evita duplicá-lo quando as duas condições estão ativas.

## 0.1.17

- Adiciona uma configuração individual para mostrar o botão separado de sacar e guardar armas antes da hotbar.
- Mantém esse botão desativado por padrão, sem afetar o saque diretamente pelo painel de Ataques.
- Evita que o botão flutuante original do Ind Resources reapareça enquanto o Symbaroum HUD estiver ativo.

## 0.1.16

- Torna as manchas de sangue mais fortes, vermelhas e chamativas desde o primeiro ponto de Vitalidade perdido.
- Substitui a rachadura única sobre todo o HUD por rachaduras individuais em cada botão e quadro.
- Intensifica progressivamente sangue e rachaduras quando a Vitalidade chega a 50% e 25%.

## 0.1.15

- Impede que o HUD tente rolar um ataque imediatamente após sacar uma arma guardada.
- Exige um segundo clique na arma já sacada para atacar, evitando o pedido prematuro de seleção de alvo.

## 0.1.14

- Envia ao chat os avisos nativos de proximidade, limiar e corrupção máxima ao ganhar Corrupção temporária pelo HUD.
- Não envia avisos de limiar ao reduzir Corrupção.

## 0.1.13

- Adiciona manchas de sangue graduais sobre o retrato quando a Vitalidade chega à metade.
- Intensifica o sangue e adiciona rachaduras animadas ao HUD quando a Vitalidade chega a 25% ou menos.
- Respeita a preferência do sistema por movimento reduzido.

## 0.1.12

- Permite clicar na barra de Corrupção para aumentar ou reduzir a Corrupção temporária.
- Preserva a Corrupção permanente e respeita o máximo restante do ator.

## 0.1.11

- Permite clicar na barra de Vitalidade para curar ou aplicar dano.
- Limita automaticamente o novo valor entre zero e a Vitalidade máxima do ator.

## 0.1.10

- Transforma o selo `Sacada` em um controle para guardar aquela arma pelo Ind Resources.
- Mantém o restante do cartão reservado para rolar o ataque.

## 0.1.9

- Mantém as barras de Vitalidade e Corrupção ocultas até o retrato receber foco ou o cursor do mouse.

## 0.1.8

- Alinha a coluna de controles laterais ao topo e ao rodapé do HUD.
- Distribui uniformemente a altura disponível entre os seis botões laterais.

## 0.1.7

- Ao atacar com uma arma guardada, oferece sacá-la antes de continuar o ataque.
- A confirmação lembra que sacar a arma consome uma ação de movimento e delega a alteração ao Ind Resources.

## 0.1.6

- Oculta o nome e os controles de troca do ator até o retrato receber foco ou o cursor do mouse.
- Substitui os números soltos de Vitalidade e Corrupção por barras de progresso sobre o retrato.

## 0.1.5

- Ativa por padrão o controle que oculta a lista de jogadores.

## 0.1.4

- Adds an expand/collapse button to every maneuver with descriptive notes.
- Displays the complete maneuver description in a readable, scrollable area.

## 0.1.3

- Keeps the abilities and traits buttons visible even when their lists are empty.
- Allows traits, boons and burdens to be dropped directly on the traits button.
- Opens the traits panel with the newly imported item selected.

## 0.1.2

- Moves the experience bar above the complete action area.
- Keeps the experience bar aligned with the attack, storage and knowledge buttons below it.

## 0.1.1

- Aligns the experience bar above the knowledge buttons.
- Makes the experience bar automatically match the width of the button grid.
- Improves the GitHub documentation and adds automated validation before releases.

## 0.1.0

- Initial public release for Foundry VTT v13 and Symbaroum 6.1.6.
- Adds a persistent Symbaroum-focused HUD integrated with the Foundry hotbar.
- Adds actor cycling, attributes, toughness, corruption, defense, armor, effects, attacks, abilities, traits, mystical powers, rituals, XP, load and money panels.
- Adds optional integration with Symbaroum Ind Resources for storage, rations, quivers, ammunition, maneuvers, money, rest and weapon readiness.
- Adds per-actor player hotbar document shortcuts while preserving the normal GM hotbar.
