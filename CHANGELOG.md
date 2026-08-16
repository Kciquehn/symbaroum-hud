# Changelog

## 0.1.65

- Libera as setas do Criador de Fichas para navegar em ambas as direções por todas as oito etapas, mesmo antes de concluir a página atual.
- Registra cada etapa confirmada separadamente, impedindo que apenas visitar ou concluir uma página futura marque etapas anteriores como prontas.
- Preserva as escolhas ao voltar, avançar ou reabrir o Criador e migra automaticamente o progresso salvo por versões anteriores.
- Mantém compatíveis os fluxos especiais de Contatos e de Atributos adiados.
- Amplia a suíte automatizada para 148 testes, incluindo navegação livre e progresso não linear.

## 0.1.64

- Mantém todas as escolhas do Criador de Fichas salvas ao voltar, avançar ou reabrir uma etapa, incluindo Atributos, Raça, Traços, Habilidades, Sombra, equipamentos, personalidade, amigos e grupo.
- Faz o traço **Privilegiado** substituir o dinheiro inicial por exatamente 50 táleres.
- Corrige os caminhos das texturas usadas pela ficha nativa de Habilidade incorporada, eliminando erros 404 de `title.webp` e `green_flower_light.webp`.
- Adiciona **Abrir Criador de Fichas** ao topo das fichas de jogador, retomando a etapa pendente ou permitindo revisar uma criação concluída sem fechar a ficha original.
- Amplia a suíte automatizada para 146 testes cobrindo os novos fluxos e regressões.

## 0.1.63

- Reconstrói a etapa **Sombra** como páginas ilustradas de Natureza, Civilização e Escuridão, seguindo a composição editorial usada nas Raças.
- Adiciona páginas temáticas para Bruxaria, Feitiçaria, Magismo e Teurgia antes da ficha nativa da Habilidade, explicando tradição, poderes, rituais e Corrupção.
- Remove o título de nível duplicado da ficha nativa de Habilidade incorporada ao Criador.
- Fecha de forma confiável a ficha original do Ator ao iniciar o Criador de Fichas.
- Reconhece o item mundial **Flechas/Virotes - Regulares** na combinação inicial de Arco.
- Torna todos os campos da etapa **Amigos e Grupo** opcionais, permitindo concluir ou pular essa parte livremente.
- Substitui o manipulador de erro inline das ilustrações por eventos vinculados com segurança e amplia as verificações estáticas contra execução dinâmica e handlers inline.
- Mantém a distribuição instalável restrita ao manifesto, licença, recursos, idiomas, scripts, estilos e templates necessários ao módulo.

## 0.1.62

- Completa o Criador de Fichas em oito etapas: Ocupação, Atributos, Raça, Habilidades, Sombra, Equipamentos, História e Personalidade, e Amigos e Grupo.
- Reconstrói o visual do Criador com os fundos, molduras, fontes e composição editorial do sistema Symbaroum, incluindo páginas detalhadas de ocupações e raças.
- Adiciona navegação entre etapas concluídas, opção de adiar Atributos e preparação especial para o traço Contatos.
- Integra Compra com XP, distribuições iniciais, Poder Místico e Ritualista à etapa de Habilidades, renderizando a ficha nativa de Item no painel de leitura.
- Faz o botão **+** de Habilidades do HUD abrir o mesmo navegador temático em personagens prontos, usando o XP disponível e apenas documentos acessíveis como Observer.
- Automatiza o equipamento inicial, dinheiro e Equipamento de Acampar, preservando os itens configurados do mundo e identificando a Habilidade que concedeu cada recompensa.
- Adiciona a escolha especial de Atirador entre Arco e Besta, acompanhada de Aljava e 10 Flechas/Virotes.
- Usa Bordão, Adaga, Espada, Arco, Aljava e munição configurados no mundo nas combinações iniciais, sem substituí-los por categorias genéricas.
- Impede a concessão de Armadura Leve quando uma Habilidade já entrega outra armadura.
- Melhora o layout e a leitura de ocupações, raças, traços, sombras, equipamentos e fichas nativas incorporadas.
- Atualiza o HUD para a API namespaced de templates do Foundry v13, eliminando o aviso de compatibilidade da API global obsoleta.
- Limpa o pacote de distribuição: a release agora inclui somente o manifesto, a licença e os diretórios necessários ao funcionamento no Foundry.
- Amplia a suíte automatizada para 136 testes cobrindo o Criador, navegador de Habilidades, equipamentos e regressões do HUD.

## 0.1.61

- Remove a moldura verde externa ao redor da ficha nativa de Habilidade no Criador.
- Reduz as margens do painel direito para a ficha ocupar toda a largura e altura disponíveis.
- Preserva somente as próprias molduras pretas oficiais da ficha de Item do sistema.

## 0.1.60

- Reorganiza o quadro de Experiência da etapa de Habilidades para destacar o XP restante no número principal.
- Move o XP total informado pelo jogador para a linha inferior, ao lado do valor já gasto.
- Mantém o saldo principal atualizado imediatamente a cada compra ou remoção de Habilidade.

## 0.1.59

- Reconstrói a aparência completa do Criador de Fichas com os próprios fundos, molduras, fontes e padrões visuais do sistema Symbaroum.
- Unifica todas as etapas com tecido verde oficial, páginas claras, títulos pretos, bordas ornamentais e estados de seleção dourados.
- Aproxima índices, abas, campos, cartões e botões dos componentes usados nas fichas nativas de Ator e Item.
- Mantém o layout compacto e garante que a janela do Criador permaneça acima da ficha do personagem durante a preparação.

## 0.1.58

- Substitui a reprodução visual do painel de Habilidades pela renderização direta do template da ficha nativa fornecido pelo sistema Symbaroum.
- Usa os dados preparados pela própria classe de ficha do Item, preservando descrições enriquecidas, ações, abas e bônus definidos pelo sistema.
- Remove apenas o formulário externo da janela, bloqueia a edição e aplica um encaixe compacto para exibir a ficha real dentro do Criador.
- Mantém os controles de compra de XP separados da ficha nativa, evitando alterações no documento do mundo antes da confirmação da etapa.

## 0.1.57

- Substitui o painel próprio de leitura das Habilidades por uma adaptação compacta da ficha nativa do Item.
- Adiciona as abas **Descrição**, **Novato**, **Adepto**, **Mestre** e **Bônus**, alimentadas diretamente pelos campos do documento existente no mundo.
- Integra os controles de compra de XP às abas de nível e permite abrir a ficha original ao clicar no nome da Habilidade.
- Exibe ações e todos os modificadores configurados pelo sistema sem copiar ou manter descrições paralelas no módulo.

## 0.1.56

- Substitui a ilustração da página de Bárbaro pela nova arte fornecida.
- Ajusta o enquadramento para preservar o rosto, a armadura e os elementos do escudo na página compacta.

## 0.1.55

- Substitui a ilustração compartilhada da página de Goblin pela arte individual fornecida para a raça.
- Ajusta o enquadramento vertical para destacar o rosto e a silhueta do goblin sem alterar a arte usada pelo Ogro.

## 0.1.54

- Reconstrói as páginas de Raças do Criador de Fichas com composição inspirada diretamente no Livro Básico: arte oficial, texto em colunas e tratamento editorial temático.
- Acrescenta história, cultura, costumes e informações completas de nomes para ambrianos, bárbaros, cambiantes, goblins e ogres.
- Mantém todas as escolhas mecânicas de traços reunidas ao final de cada página, depois da leitura da raça.
- Adapta o enquadramento das ilustrações por raça e preserva uma leitura compacta em telas menores.

## 0.1.53

- Transforma o nome de cada Poder Místico no Criador de Fichas em um atalho para abrir sua ficha nativa de item.
- Remove as descrições expansíveis de dentro da lista de poderes, deixando os cartões menores e a consulta mais rápida.
- Mantém os seletores de nível e permite consultar na ficha aberta todas as descrições, ações e bônus do poder.

## 0.1.52

- Integra **Poder Místico** à etapa de Habilidades do Criador de Fichas, listando todos os poderes do mundo compartilhados com o jogador como **Observer** ou superior.
- Permite comprar vários poderes místicos, escolher individualmente o nível Novato, Adepto ou Mestre e ler a descrição completa de cada poder antes da escolha.
- Faz cada poder escolhido ocupar uma compra própria e copia diretamente o documento nativo para a ficha, sem duplicar a Habilidade genérica **Poder Místico**.
- Integra **Ritualista** à mesma etapa e mostra todos os rituais acessíveis no mundo.
- Exige e adiciona automaticamente 1 ritual no nível Novato, 3 no Adepto ou 6 no Mestre, conforme a progressão oficial da Habilidade.
- Adiciona seletores compactos e temáticos, contadores, bloqueio de capacidade e validação das escolhas especiais antes da confirmação.

## 0.1.51

- Adiciona uma seta branca discreta ao cabeçalho das Táticas de NPCs.
- Permite recolher o texto das Táticas para baixo, mantendo somente o cabeçalho compacto acima do HUD.
- Anima suavemente a ocultação e a reabertura do conteúdo, com rótulos acessíveis para os dois estados.

## 0.1.50

- Adiciona **Compra com XP** como modo principal e inicial da etapa de Habilidades.
- Permite informar o XP disponível e comprar níveis Novato, Adepto e Mestre pelos custos cumulativos de `10`, `30` e `60 XP`.
- Mostra em tempo real o XP gasto e restante, bloqueando compras que ultrapassem o orçamento informado.
- Mantém as duas distribuições iniciais prontas como alternativas.
- Inclui no catálogo todas as Habilidades do mundo compartilhadas com o jogador em nível **Observer** ou superior.
- Registra o XP inicial e ativa corretamente todos os níveis necessários das Habilidades compradas.

## 0.1.49

- Adiciona o quarto passo do Criador de Fichas: seleção de Habilidades disponíveis no mundo.
- Oferece as duas distribuições oficiais: **Cinco Novatas** ou **Duas Novatas + uma Adepta**.
- Mostra índice pesquisável, ícones, referências, descrição geral e os textos completos dos níveis Novato, Adepto e Mestre.
- Desconta automaticamente as vagas ocupadas por Metamorfo, Instinto de Sobrevivência ou Robusto escolhidos na etapa racial.
- Copia os documentos nativos para a ficha com os níveis corretos e concede o abatimento de experiência inicial, evitando XP disponível negativo.
- Mantém a confirmação bloqueada até que todas as vagas da distribuição escolhida estejam preenchidas.

## 0.1.48

- Remove completamente do Criador de Fichas as classificações não oficiais das raças.
- Deixa o índice lateral de Raças somente com o ícone e o nome de cada opção.

## 0.1.47

- Simplifica o cabeçalho da página de cada raça, mantendo somente o ícone e o nome.
- Remove da área principal classificações redundantes como **Humano**, **Povo élfico** e **Povo de vida breve**.

## 0.1.46

- Faz a Compra de Pontos iniciar todos os oito Atributos no valor mínimo `5`.
- Exibe inicialmente `40` pontos restantes, que devem ser distribuídos até completar o total oficial de 80 pontos.

## 0.1.45

- Remove o rótulo **Regras do Livro Básico** das abas Distribuição típica e Compra de pontos.
- Faz a Distribuição típica começar sem valores atribuídos, permitindo acompanhar claramente o preenchimento dos oito Atributos.
- Risca com aparência de lápis cada número utilizado na lista lateral.
- Remove dos outros campos os valores já distribuídos, impedindo repetições acidentais.
- Trata separadamente os dois valores `10`: o segundo continua disponível até também ser utilizado.
- Mantém a confirmação bloqueada até que todos os valores oficiais tenham sido distribuídos corretamente.

## 0.1.44

- Remove o texto auxiliar abaixo do título **Ocupações**, deixando o índice do Criador de Fichas mais limpo e compacto.

## 0.1.43

- Remove o texto redundante **Como criar um personagem** do marcador superior do Criador de Fichas.
- Mantém apenas o indicador numérico de etapa no cabeçalho do Criador, deixando-o mais limpo e compacto.

## 0.1.42

- Adiciona o terceiro passo do Criador de Fichas: escolha entre ambriano, bárbaro, cambiante, goblin e ogro.
- Apresenta cada raça em uma página compacta no estilo do Livro Básico, com origem, descrição e seus traços raciais.
- Exige que ambrianos escolham **Contatos** ou **Privilegiado** e que bárbaros escolham **Contatos** ou **Mateiro**.
- Adiciona automaticamente os traços obrigatórios de cambiante, goblin e ogro, mostrando ao jogador um aviso com os itens inseridos.
- Permite escolher **Metamorfo**, **Instinto de Sobrevivência** ou **Robusto** no nível Novato e registra que a opção consumirá uma escolha de Habilidade.
- Copia preferencialmente os documentos nativos existentes no mundo e evita duplicar um traço que já esteja na ficha.
- Mantém uma definição de segurança compatível com o schema do Symbaroum quando um dos itens raciais não existir no mundo.

## 0.1.41

- Adiciona o segundo passo do Criador de Fichas: distribuição dos oito Atributos.
- Oferece no topo as abas **Distribuição típica** e **Compra de pontos**, preservando o visual compacto de livro de Symbaroum.
- Na distribuição típica, permite reorganizar `5, 7, 9, 10, 10, 11, 13 e 15` por troca automática entre os Atributos.
- Na compra de pontos, inicia com 80 pontos distribuídos, exibe o saldo em tempo real e oferece controles para reduzir e aumentar cada valor.
- Aplica os limites oficiais de 5 a 15, permite apenas um Atributo em 15 e impede a confirmação enquanto ainda houver pontos livres.
- Apresenta descrições resumidas dos oito Atributos com base no Livro Básico e grava a escolha diretamente nos campos nativos da ficha.
- Abre automaticamente a etapa de Atributos após a escolha da ocupação e permite retomá-la com **Continuar depois**.

## 0.1.40

- Reduz o Criador de Fichas de 1080 × 700 para 860 × 550, liberando mais espaço da mesa durante a criação.
- Compacta o guia da etapa, o índice, a apresentação do arquétipo e os detalhes da ocupação sem remover a identidade visual de Symbaroum.
- Substitui a lista nativa por um índice temático com ícones, grupos e seleção em vermelho escuro e dourado.
- Organiza Atributos e Raças lado a lado e mantém Habilidades em uma linha própria para aproveitar melhor a página.
- Mantém rolagem independente no índice e na página de leitura, sem cortes horizontais.
- Garante que o livro permaneça acima da ficha quando uma criação interrompida for retomada.

## 0.1.39

- Reorganiza o primeiro passo do Criador de Fichas conforme a sequência apresentada no Livro Básico.
- Exibe uma introdução guiada com o progresso da criação antes da escolha da ocupação.
- Substitui o índice anterior por uma lista visível das 15 ocupações, agrupadas entre Guerreiro, Místico e Ladino.
- Apresenta à direita uma página completa para cada escolha, com explicação do arquétipo, citação, descrição, Atributos importantes, Raças sugeridas e Habilidades apropriadas.
- Ajusta os nomes em português para as ocupações do Livro Básico, incluindo Amoque e Bandido.

## 0.1.38

- Implementa a primeira etapa real do Criador de Fichas: escolha de ocupação.
- Apresenta as 15 ocupações do Livro Básico, divididas entre Guerreiro, Místico e Ladino, em uma interface de livro aberto.
- Permite navegar pelo índice e ler resumos originais sobre o conceito e o estilo de jogo de cada ocupação.
- Preenche automaticamente `system.bio.occupation` e salva o arquétipo, a ocupação e o progresso do criador na ficha.
- Retoma o livro ao reabrir a ficha quando o jogador escolher continuar depois.

## 0.1.37

- Adiciona o primeiro protótipo do Criador de Fichas para personagens jogadores.
- Oferece as opções de usar o criador guiado ou preencher manualmente ao abrir uma ficha totalmente nova.
- Salva a decisão na própria ficha e não exibe o convite para fichas já preenchidas, criaturas ou usuários sem permissão de proprietário.
- Abre uma introdução do protótipo ao escolher o criador; as etapas guiadas de raça, atributos e habilidades serão adicionadas nas próximas versões.

## 0.1.36

- Corrige o arraste de poderes místicos do HUD para a hotbar do jogador.
- Permite iniciar o arraste pela entrada lateral, pelo ícone ou pelo nome do poder selecionado.
- Usa diretamente o UUID preparado pelo painel para preservar o vínculo com o item do personagem.

## 0.1.35

- Oculta o pão de viagem do HUD quando o mestre seleciona um NPC.
- Mantém aljava e munição visíveis para NPCs, pois continuam relevantes em combate.

## 0.1.34

- Exibe as abas de nível Novato, Adepto e Mestre nos traços monstruosos.
- Mostra a ação, a descrição e a indicação do nível ativo de cada traço.
- Mantém dádivas, fardos e traços marcadores sem níveis, conforme a estrutura do sistema Symbaroum.

## 0.1.33

- Adiciona uma animação curta de deslize e transparência ao recolher e expandir o HUD.
- Mantém o retrato estável durante o recolhimento e revela os controles a partir da esquerda na expansão.
- Respeita a preferência de movimento reduzido do sistema operacional.

## 0.1.32

- Dá prioridade imediata ao token controlado pelo mestre, independentemente do modo de seleção configurado.
- Retorna automaticamente ao turno, personagem atribuído ou seleção automática quando o mestre soltar o token.
- Mantém o comportamento original das configurações para jogadores.

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
