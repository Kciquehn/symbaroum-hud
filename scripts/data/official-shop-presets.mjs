function pool(id, {
  anyTags = [],
  allTags = [],
  excludeTags = [],
  categories = [],
  picks = [1, 1],
  quantity = [1, 1],
  chance = 1,
  weight = 1
} = {}) {
  return Object.freeze({
    id,
    anyTags: Object.freeze(anyTags),
    allTags: Object.freeze(allTags),
    excludeTags: Object.freeze(excludeTags),
    categories: Object.freeze(categories),
    picks: Object.freeze(picks),
    quantity: Object.freeze(quantity),
    chance,
    weight
  });
}

function essential(id, {
  names = [],
  references = [],
  categories = [],
  anyTags = [],
  quantity = [1, 1],
  random = false
} = {}) {
  return Object.freeze({
    id,
    names: Object.freeze(names),
    references: Object.freeze(references),
    categories: Object.freeze(categories),
    anyTags: Object.freeze(anyTags),
    quantity: Object.freeze(quantity),
    random
  });
}

function shop(id, name, location, source, description, pools, {
  price = [95, 105],
  icon = "fa-store",
  essentials = [],
  categories = [],
  details = OFFICIAL_SHOP_DETAILS[id] ?? []
} = {}) {
  return Object.freeze({
    id,
    name,
    location,
    source: Object.freeze(source),
    description,
    details: Object.freeze(details),
    icon,
    price: Object.freeze(price),
    categories: Object.freeze(categories),
    essentials: Object.freeze(essentials),
    pools: Object.freeze(pools)
  });
}

const CORE = "Livro Básico — O Mundo de Symbaroum";
const ADVENTURE_COLLECTION = "Coletânea de Aventuras";
const WRATH_OF_THE_WARDEN = "A Ira do Guardião";

/**
 * Public, source-backed information for the official establishments. These
 * notes deliberately exclude adventure secrets and GM-only revelations: the
 * same shop description is visible to players. Longer source passages are
 * adapted instead of copied verbatim.
 */
const OFFICIAL_SHOP_DETAILS = Object.freeze({
  marvaloms: [
    "Marvalom criou em Forte do Cardo o modelo de loja que depois se espalhou por Ambria: mercadorias compradas em Yndaros e revendidas onde artesãos e suprimentos eram escassos.",
    "O estabelecimento atende sobretudo exploradores e mantém utensílios, equipamento de expedição e armas; a conveniência normalmente vem acompanhada de preços acima do mercado."
  ],
  "rope-and-axe": [
    "Melena, filha e antiga colaboradora de Marvalom, abriu o negócio depois de uma amarga ruptura familiar e passou a competir diretamente com o pai.",
    "A proposta oficial é reunir sob um mesmo teto tudo que uma viagem pela Davokar exige, buscando preços baixos e fornecimento constante em várias partes do reino.",
    "Circulam rumores sobre equipamento de exploradores mortos e mercadoria roubada, acusações que Melena rejeita publicamente."
  ],
  "thalers-drugstore": [
    "As irmãs Ofera e Moria administram o balcão; os preparados são produzidos por Skanander, seu pai, antigo médico da corte da Rainha-Mãe Abesina.",
    "Compra ervas e extratos por preços considerados justos e os revende ou transforma em elixires, inclusive toxinas e outros preparados perigosos.",
    "Rumores ligam algumas fórmulas a ingredientes maculados, mas a reputação oficial da drogaria continua elevada."
  ],
  "big-bashers-smithy": [
    "Grande Golpeador aprendeu o ofício com a ferreira bárbara Hurela e herdou a oficina, sendo reconhecido como um dos melhores ferreiros da cidade.",
    "A oficina emprega aprendizes, um adepto e goblins de Karabbadokk; eles vendem peças comuns, enquanto encomendas de qualidade superior devem ser tratadas diretamente com o mestre.",
    "Trabalhos de mestre levam mais tempo e custam mais, seguindo as regras de Obra-Prima da fonte indicada."
  ],
  "queens-square-market": [
    "O mercado é montado todas as manhãs e favorece quem aceita procurar, negociar e disputar mercadorias usadas ou participar de leilões improvisados.",
    "No canto nordeste ficam vendedores de ervas e drogas, com componentes frescos ou secos, elixires prontos e preparados feitos sob encomenda.",
    "A multidão atrai muitos batedores de carteira; a chamada Liga Livre é o nome mais associado às ondas de furtos da praça."
  ],
  "the-treasury": [
    "Sefira, antiga Mestra da Ordo Magica, administra com sua família uma casa de leilões especializada em artefatos, curiosidades e objetos de arte.",
    "A reputação permite cobrar cerca de 25 táleres para autenticar artefatos, 5 táleres para curiosidades ou arte e comissão de até 25% sobre a venda.",
    "Mesmo com esses custos, o certificado de Sefira costuma elevar o valor final alcançado em leilão."
  ],
  "faraldos-novelty-store": [
    "Faraldo opera uma das casas autorizadas mais prestigiadas da Praça Antiga, frequentemente escolhida para negociar antiguidades trazidas da Davokar.",
    "O negócio emite certificados de autenticidade e participa dos leilões que seguem o retorno de expedições bem-sucedidas.",
    "Sua posição remonta à reorganização do comércio de antiguidades depois da Guerra dos Mercadores."
  ],
  "prospectors-friend": [
    "Semel mantém o único fornecedor organizado de Esperança de Salindra para garimpeiros, exploradores e trabalhadores isolados.",
    "Os preços oficiais são o dobro dos valores do Livro Básico, reduzidos para uma vez e meia com um Teste bem-sucedido de Persuasivo conforme a aventura."
  ],
  "afadirs-triumph": [
    "Afadir tenta recriar a culinária de Alberetor com substitutos locais: truta no lugar do salmão, bagas roka no lugar da pimenta-do-sul e mel no lugar do açúcar.",
    "É uma casa cara, voltada a clientes com saudade do sul; reservas são recomendadas.",
    "Depois de um envenenamento coletivo no ano 18, Afadir pagou multas elevadas e prometeu reforçar o cuidado com substituições de ingredientes."
  ],
  "halls-of-symbaroum": [
    "Ordelia Felisselvagem reuniu em um só estabelecimento comida, bebida, jogos, espetáculos e outras diversões que normalmente estariam espalhadas pela cidade.",
    "Os Salões ocupam cinco andares: três dedicados a prazeres socialmente aceitos e dois a entretenimentos mais discretos.",
    "O andar superior permanece indisponível um dia por semana; a razão não é de conhecimento público."
  ],
  "winged-ladle": [
    "A hospedaria ocupa a antiga casa elevada de Lasifor Campo Noturno, construída na copa da única árvore preservada durante a fundação da cidade.",
    "Possui dezesseis quartos e recebe nobres e dignitários; reservas antecipadas são comuns e vagas de última hora dependem de cancelamentos.",
    "É uma hospedaria exclusiva: a tabela oficial fixa uma noite em 1 táler."
  ],
  "rose-garden": [
    "Apesar do nome, é um abrigo municipal para moradores empobrecidos e caçadores de fortuna arruinados, conhecido como A Última Chance.",
    "Delera administra quatro dormitórios para cerca de sessenta pessoas; 5 ortegas garantem uma caixa de dormir, um cobertor e duas porções de mingau ou sopa.",
    "Doença, violência, banimento e desespero fazem a ocupação mudar continuamente."
  ],
  "court-and-harp": [
    "Os quartos alegam reproduzir aposentos de celebridades, incluindo a Rainha Korinthia, o Grão-Mestre Seldonio e a Grã-Duquesa Esmerelda.",
    "A proprietária Aragina exige aparência e comportamento respeitáveis e não tolera hóspedes sujos ou grosseiros.",
    "É uma hospedaria exclusiva: a tabela oficial fixa uma noite em 1 táler."
  ],
  "witch-and-familiar": [
    "Alomar, do clã Zarek, administra com sua mãe Agdala uma hospedaria de três andares decorada como um acampamento bárbaro.",
    "Musgo, vegetação, peles e troféus de caça substituem o mobiliário convencional; a comida segue tradições bárbaras.",
    "A casa recebe muitos recém-chegados e visitantes bárbaros, mas também atrai curiosos e hostilidade de quem odeia os povos da floresta."
  ],
  "the-ruin": [
    "Mestre Pergalo apresenta a Ruína como pouso de sorte para caçadores de tesouros e associa sua fama a exploradores como Iasogoi Brigo e Lysindra Aperto Dourado.",
    "A sopa da tarde é preparada em um enorme caldeirão antigo recuperado perto da Praça do Sapo, coberto por inscrições ainda indecifradas.",
    "A hospedagem é de qualidade fina: 2 xelins por noite, 1 táler por semana ou 4 táleres por mês."
  ],
  legends: [
    "A taverna recebe narradores e estudiosos interessados em Alberetor, na Grande Guerra, na história ambriana e nas lendas da Davokar.",
    "Grande parte das apresentações é dramatizada, mas sessões especiais trazem historiadores e cronistas reconhecidos e contam com segurança reforçada.",
    "O cardápio oficial inclui bandejas de queijo e vinhos simples ou raros de Alberetor."
  ],
  benegos: [
    "No piso térreo, apostas modestas envolvem dados e o jogo estratégico Sol de Prios; no andar superior e em salas privadas, os limites desaparecem.",
    "No porão ocorrem lutas de galos-orv em jaula, tratadas como combates entre pequenas abominações e publicamente condenadas pela Ordo Magica e pela Igreja de Prios.",
    "O proprietário Benego é antigo companheiro de viagens de Lasifor Campo Noturno."
  ],
  "karvosti-market-days": [
    "Nos equinócios, famílias dos clãs e mercadores ocupam o platô de Karvosti com tendas, carroças, animais, alimentos, ferramentas e bens de troca.",
    "A disponibilidade é sazonal e muda conforme os clãs presentes, as colheitas e as rotas que chegaram ao encontro."
  ],
  "mother-mehiras-agency": [
    "Caçadores de fortuna registram identidade, perícias comprovadas e disposição para riscos classificados como baixo, alto, extremo ou insensato.",
    "Os agentes são organizados como Lutadores, Desbravadores ou Místicos e passam a receber avaliações depois do primeiro contrato.",
    "O preço depende da classificação do agente, duração e risco; um quarto do custo e um depósito ficam com Mãe Mehira, e o restante é pago ao agente ao fim do trabalho."
  ],
  "black-square-market": [
    "A Praça Negra concentra o comércio informal de Brejanegra, fora dos portões e das taxas regulares de Forte do Cardo.",
    "A oferta varia entre suprimentos comuns, equipamento usado, comida, achados da floresta e serviços de procedência incerta.",
    "Preços atraentes vêm acompanhados de menos garantias, maior risco de contrabando e pouca proteção oficial."
  ],
  odovakar: [
    "Os irmãos bárbaros Verama e Melkor servem carnes grelhadas, raízes cozidas, especiarias da floresta, trufas e as tortas de cogumelo doce-picantes do clã Odaiova.",
    "A casa recomenda seguir o costume do clã: comer primeiro e beber depois, um desafio diante dos pratos muito ardentes.",
    "Como outros estabelecimentos bárbaros, sofre preconceito e vandalismo, embora o prefeito reconheça seus donos como residentes da cidade."
  ],
  "the-slaughterhouse": [
    "Mestre Morlam mantém um matadouro e uma taverna vizinhos, com mesas longas para cerca de cem clientes.",
    "Miúdos, pulmão recheado e ensopados formam a opção barata; cortes nobres preparados lentamente ou na manteiga custam mais.",
    "Rumores associam parte da carne a criaturas abatidas no Abomitório, acusações sobre as quais Morlam se recusa a comentar."
  ],
  "chiefs-bell": [
    "No Sino do Chefe, a fama de Kastor por bebida, brigas e excessos se estende do entardecer até depois do amanhecer.",
    "Há quartos, mas a casa é indicada a quem não pretende dormir; recebe tanto expedições vitoriosas quanto grupos que voltaram sem nada.",
    "Agshela, a Comandante, cuida do salão; Seralo cozinha, e os três filhos ajudam no negócio familiar."
  ],
  "rusty-dragon": [
    "Uma das estalagens mais antigas de Kastor, ainda considerada a mais refinada apesar da deterioração do edifício.",
    "O proprietário Ramigal descende do fundador, e cidadãos importantes frequentam regularmente a taverna.",
    "O nome vem da lenda local do Sino e do Dragão; funcionários e habitués conhecem ao menos suas linhas gerais."
  ],
  "queens-threshold": [
    "A hospedaria mais antiga de Passo de Prios oferece dormitórios, quartos, refeições e bebida a viajantes que atravessam a passagem.",
    "Em períodos de bloqueio dos portões ou chegada de caravanas, o salão costuma ficar lotado."
  ],
  "the-trout": [
    "A Truta é conhecida em Passo de Prios por refeições e tortas de peixe, acompanhadas de comida simples e bebida.",
    "A reputação pública é de taverna de viajantes; rumores persistentes mencionam contrabando e achados perigosos circulando nos porões."
  ],
  tandem: [
    "Os cozinheiros Pero e Larso administram uma das tavernas mais respeitadas do Octógono, em Ravenia.",
    "A especialidade é comida para beliscar: queijos, embutidos, canapés e uma variedade alegada de sessenta e três tipos de frios."
  ],
  barbarity: [
    "Doralg e Moira mantêm uma estalagem acolhedora, de ambiente tranquilo; clientes violentos ou inconvenientes são rapidamente postos na rua pelos habitués.",
    "A noite custa 2 xelins por pessoa, tanto no dormitório quanto em um dos sete quartos de quatro camas, e inclui mingau no café da manhã.",
    "O menu combina pratos ambrianos e rústicos, com sucos, cerveja stut, veloum e vesa."
  ],
  "master-tailor-norlio": [
    "A oficina de Norlio, no Octógono de Ravenia, produz alguns dos trajes de exploração mais exclusivos do reino.",
    "As peças são resistentes e práticas, mas caras e associadas a exploradores ricos, o que provoca desprezo entre alguns caçadores de fortuna."
  ]
});

const OFFICIAL_SHOP_SOURCE_PAGES = Object.freeze({
  marvaloms: "A Ira do Guardião, p. 24-25",
  "rope-and-axe": "A Ira do Guardião, p. 25",
  "thalers-drugstore": "A Ira do Guardião, p. 26",
  "big-bashers-smithy": "A Ira do Guardião, p. 25-26",
  "queens-square-market": "A Ira do Guardião, p. 25",
  "the-treasury": "A Ira do Guardião, p. 26",
  "faraldos-novelty-store": "A Ira do Guardião, p. 15-16 e 26",
  "prospectors-friend": "Coletânea de Aventuras, p. 70",
  "afadirs-triumph": "A Ira do Guardião, p. 16-18",
  "halls-of-symbaroum": "Livro Básico, p. 45",
  "winged-ladle": "A Ira do Guardião, p. 21-23",
  "rose-garden": "A Ira do Guardião, p. 23",
  "court-and-harp": "A Ira do Guardião, p. 21",
  "witch-and-familiar": "A Ira do Guardião, p. 23",
  "the-ruin": "Livro Básico, p. 46",
  legends: "A Ira do Guardião, p. 20-21",
  benegos: "A Ira do Guardião, p. 19-20",
  "karvosti-market-days": "Livro Básico, Karvosti",
  "mother-mehiras-agency": "Livro Básico, p. 44",
  "black-square-market": "A Ira do Guardião, Brejanegra",
  odovakar: "A Ira do Guardião, p. 18-19",
  "the-slaughterhouse": "A Ira do Guardião, p. 18",
  "chiefs-bell": "Coletânea de Aventuras, p. 95",
  "rusty-dragon": "Coletânea de Aventuras, p. 95",
  "queens-threshold": "Coletânea de Aventuras, Passo de Prios",
  "the-trout": "Coletânea de Aventuras, Passo de Prios",
  tandem: "Coletânea de Aventuras, p. 157",
  barbarity: "Coletânea de Aventuras, p. 159-160",
  "master-tailor-norlio": "Coletânea de Aventuras, p. 157"
});

export function officialShopDescription(preset) {
  if (!preset) return "";
  const paragraphs = [preset.description, ...(preset.details ?? [])]
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
  const reference = OFFICIAL_SHOP_SOURCE_PAGES[preset.id]
    ?? [preset.source?.book, preset.source?.section].filter(Boolean).join(" - ");
  if (reference) paragraphs.push(`Referência oficial: ${reference}.`);
  return paragraphs.join("\n\n");
}

const EXPEDITION_ESSENTIALS = Object.freeze([
  essential("rope", {
    names: ["Corda", "Rope"], references: ["rope"], categories: ["equipment"],
    quantity: [4, 12]
  }),
  essential("grappling-hook", {
    names: ["Arpéu", "Grappling Hook"], references: ["grapplingHook", "grapplinghook"], categories: ["equipment"],
    quantity: [2, 6]
  }),
  essential("torch", {
    names: ["Tocha", "Torch"], references: ["torch"], categories: ["equipment"],
    quantity: [6, 20]
  }),
  essential("lantern", {
    names: ["Lanterna", "Lantern"], references: ["lantern"], categories: ["equipment"],
    quantity: [2, 8]
  }),
  essential("lamp-oil", {
    names: ["Óleo de Lâmpada", "Lamp Oil"], references: ["lampOil", "lampoil"], categories: ["equipment"],
    quantity: [6, 20]
  }),
  essential("camping-equipment", {
    names: ["Equipamento de Acampar", "Camping Equipment"], references: ["campingEquipment", "campingequipment"],
    categories: ["equipment"], quantity: [2, 8]
  })
]);

const ALCHEMIST_ESSENTIALS = Object.freeze([
  essential("herbal-cure", {
    names: ["Cura Herbal", "Herbal Cure"], quantity: [5, 15], categories: ["equipment"]
  }),
  essential("weak-antidote", {
    names: ["Antídoto Fraco", "Weak Antidote"], quantity: [4, 12], categories: ["equipment"]
  }),
  essential("moderate-antidote", {
    names: ["Antídoto Moderado", "Moderate Antidote"], quantity: [2, 8], categories: ["equipment"]
  }),
  essential("holy-water", {
    names: ["Água Benta", "Holy Water"], quantity: [2, 8], categories: ["equipment"]
  }),
  essential("waybread", {
    names: ["Pão de viagem", "Waybread"], quantity: [4, 12], categories: ["equipment"]
  })
]);

const ARMORY_ESSENTIALS = Object.freeze([
  essential("dagger", { names: ["Adaga", "Dagger"], quantity: [4, 12], categories: ["weapon"] }),
  essential("sword", { names: ["Espada", "Sword"], quantity: [3, 9], categories: ["weapon"] }),
  essential("axe", { names: ["Machado", "Axe"], quantity: [3, 9], categories: ["weapon"] }),
  essential("long-weapon", { names: ["Arma Longa", "Long Weapon"], quantity: [2, 7], categories: ["weapon"] }),
  essential("light-armor", { names: ["Armadura Leve", "Light Armor"], quantity: [3, 9], categories: ["armor"] }),
  essential("whetstone", { names: ["Pedra de Amolar", "Whetstone"], quantity: [5, 15], categories: ["equipment"] }),
  essential("weapon-maintenance", {
    names: ["Kit de Manutenção de Arma", "Weapon Maintenance Kit", "Weapon maintenance kit"],
    quantity: [2, 8], categories: ["equipment"]
  })
]);

const GENERAL_MARKET_ESSENTIALS = Object.freeze([
  essential("backpack", { names: ["Mochila", "Backpack"], quantity: [3, 10], categories: ["equipment"] }),
  essential("sack", { names: ["Saco", "Sack"], quantity: [8, 24], categories: ["equipment"] }),
  essential("waterskin", { names: ["Cantil", "Waterskin"], quantity: [5, 15], categories: ["equipment"] }),
  essential("simple-garb", { names: ["Trajes Simples", "Simple Garb", "Simple garb"], quantity: [3, 10], categories: ["equipment"] }),
  essential("boots", { names: ["Botas", "Boots"], quantity: [3, 10], categories: ["equipment"] })
]);

const TAVERN_ESSENTIALS = Object.freeze([
  essential("table-ale", {
    names: ["Ale de mesa (stut regada)", "Table Ale (watered stut)"], quantity: [12, 40], categories: ["equipment"]
  }),
  essential("red-wine", {
    names: ["Garrafa de vinho tinto (não especificado)", "Bottle of Red Wine (unspecified)"],
    quantity: [4, 16], categories: ["equipment"]
  }),
  essential("mixed-stew", {
    names: ["Ensopado misto", "Mixed Stew"], quantity: [6, 20], categories: ["equipment"]
  })
]);

const INN_ESSENTIALS = Object.freeze([
  ...TAVERN_ESSENTIALS,
  essential("lodging", { anyTags: ["expenses", "service-hospitality"], quantity: [4, 16], random: true })
]);

const FINE_DINING_ESSENTIALS = Object.freeze([
  essential("southern-slopes", {
    names: ["Garrafa das Encostas do Sul (de Alberetor)", "Bottle of Southern Slopes (from Alberetor)"],
    quantity: [2, 8], categories: ["equipment"]
  }),
  essential("kings-steak", {
    names: ["Bife do rei em molho", "King’s Steak in Gravy", "King's Steak in Gravy"],
    quantity: [4, 12], categories: ["equipment"]
  }),
  ...TAVERN_ESSENTIALS
]);

const FINE_INN_ESSENTIALS = Object.freeze([
  ...FINE_DINING_ESSENTIALS,
  essential("lodging", { anyTags: ["expenses", "service-hospitality"], quantity: [3, 12], random: true })
]);

const CHEAP_INN_ESSENTIALS = Object.freeze([
  essential("watered-porridge", { names: ["Mingau regado", "Watered Porridge"], quantity: [8, 24], categories: ["equipment"] }),
  essential("onion-soup", {
    names: ["Sopa de cebola com torrada", "Onion Soup with Crispbread"], quantity: [8, 24], categories: ["equipment"]
  }),
  essential("table-ale", {
    names: ["Ale de mesa (stut regada)", "Table Ale (watered stut)"], quantity: [12, 40], categories: ["equipment"]
  }),
  essential("lodging", { anyTags: ["expenses", "service-hospitality"], quantity: [6, 20], random: true })
]);

const BARBARIAN_FOOD_ESSENTIALS = Object.freeze([
  essential("root-stew", {
    names: ["Ensopado de legumes", "Root Vegetable Stew"], quantity: [8, 24], categories: ["equipment"]
  }),
  essential("veloum", {
    names: ["Caneca de Veloum (mofo bárbaro)", "Tankard Veloum (barbarian must)"],
    quantity: [10, 30], categories: ["equipment"]
  }),
  essential("meat-pie", { names: ["Torta de carne", "Meat Pie"], quantity: [6, 20], categories: ["equipment"] })
]);

const BARBARIAN_INN_ESSENTIALS = Object.freeze([
  ...BARBARIAN_FOOD_ESSENTIALS,
  essential("lodging", { anyTags: ["expenses", "service-hospitality"], quantity: [4, 16], random: true })
]);

const MEAT_TAVERN_ESSENTIALS = Object.freeze([
  essential("stuffed-lung", {
    names: ["Pulmão recheado com purê preto", "Stuffed Lung with Black Mash"], quantity: [8, 24], categories: ["equipment"]
  }),
  essential("offal-pie", { names: ["Torta de miúdos", "Offal Pie"], quantity: [8, 24], categories: ["equipment"] }),
  essential("blood-soup", {
    names: ["Sopa de sangue com pão escuro", "Blood-soup with Dark Bread"], quantity: [8, 24], categories: ["equipment"]
  }),
  ...TAVERN_ESSENTIALS
]);

const FISH_TAVERN_ESSENTIALS = Object.freeze([
  essential("fish-pie", { names: ["Torta de peixe", "Fish Pie"], quantity: [8, 24], categories: ["equipment"] }),
  essential("trout-pie", { names: ["Torta de truta", "Trout Pie"], quantity: [6, 18], categories: ["equipment"] }),
  ...TAVERN_ESSENTIALS
]);

const DELICATESSEN_ESSENTIALS = Object.freeze([
  essential("hack-tray", {
    names: ["Bandeja de cortes (queijos e carnes)", "Hack Tray (cheese and meats)"],
    quantity: [8, 24], categories: ["equipment"]
  }),
  essential("roka-sausage", {
    names: ["Salsicha roka com purê de beterraba", "Roka Sausage with Mashed Beats"],
    quantity: [6, 18], categories: ["equipment"]
  }),
  essential("red-wine", {
    names: ["Garrafa de vinho tinto (não especificado)", "Bottle of Red Wine (unspecified)"],
    quantity: [4, 16], categories: ["equipment"]
  })
]);

const GAME_HOUSE_ESSENTIALS = Object.freeze([
  essential("table-ale", {
    names: ["Ale de mesa (stut regada)", "Table Ale (watered stut)"], quantity: [12, 40], categories: ["equipment"]
  }),
  essential("game-service", { anyTags: ["service-other"], quantity: [4, 20], random: true })
]);

const TAILOR_ESSENTIALS = Object.freeze([
  essential("simple-garb", { names: ["Trajes Simples", "Simple Garb", "Simple garb"], quantity: [4, 12], categories: ["equipment"] }),
  essential("boots", { names: ["Botas", "Boots"], quantity: [4, 12], categories: ["equipment"] }),
  essential("cloak", { names: ["Capa", "Cloak"], quantity: [3, 10], categories: ["equipment"] }),
  essential("shirt", { names: ["Camisa", "Shirt"], quantity: [4, 12], categories: ["equipment"] }),
  essential("pants", { names: ["Calça", "Pants"], quantity: [4, 12], categories: ["equipment"] }),
  essential("coat", { names: ["Casaco", "Coat"], quantity: [2, 8], categories: ["equipment"] })
]);

const CURIOSITY_ESSENTIALS = Object.freeze([
  essential("curiosity", { anyTags: ["curiosities"], quantity: [1, 2], random: true })
]);

const TREASURY_ESSENTIALS = Object.freeze([
  ...CURIOSITY_ESSENTIALS,
  essential("artifact", { anyTags: ["artifacts", "minor-artifacts"], quantity: [1, 1], random: true })
]);

const SERVICE_ESSENTIALS = Object.freeze([
  essential("service", {
    anyTags: ["service-contracts", "service-professionals", "service-travel", "service-information"],
    quantity: [2, 8],
    random: true
  })
]);

/**
 * Official establishments whose merchandise or services are described in the
 * installed Free League journals. Public descriptions are source-backed
 * adaptations; source metadata keeps the rules reference auditable without
 * duplicating long copyrighted passages or exposing adventure secrets.
 */
export const OFFICIAL_SHOP_PRESETS = Object.freeze([
  shop("marvaloms", "Marvalom’s", "Forte do Cardo", {
    book: CORE, section: "Marvalom’s General Store"
  }, "Loja lendária para caçadores de tesouros e exploradores. Mantém equipamento de expedição e uma seleção menor de armas, normalmente acima do preço comum.", [
    pool("expedition", { anyTags: ["survival-items", "containers", "tools"], picks: [8, 15], quantity: [2, 12], weight: 3 }),
    pool("specialist", { anyTags: ["specialized-tools", "traps"], picks: [2, 5], quantity: [1, 4], weight: 2 }),
    pool("weapons", { categories: ["weapon"], picks: [2, 5], quantity: [1, 3], chance: 0.85 })
  ], {
    price: [105, 120], icon: "fa-compass", essentials: EXPEDITION_ESSENTIALS,
    categories: ["survival-items", "containers", "tools", "traps", "melee-weapons", "ranged-weapons"]
  }),

  shop("rope-and-axe", "A Corda e o Machado", "Forte do Cardo", {
    book: CORE, section: "The Rope and Axe"
  }, "Concorrente de Marvalom especializada em tudo que uma expedição precisa para viajar pela Davokar.", [
    pool("expedition", { anyTags: ["survival-items", "containers", "tools"], picks: [10, 18], quantity: [3, 15], weight: 4 }),
    pool("specialist", { anyTags: ["specialized-tools", "traps"], picks: [2, 6], quantity: [1, 5], weight: 2 }),
    pool("field-supplies", { anyTags: ["food-and-drink", "alchemical-elixirs"], picks: [2, 6], quantity: [2, 10] })
  ], {
    price: [90, 105], icon: "fa-route", essentials: EXPEDITION_ESSENTIALS,
    categories: ["survival-items", "containers", "tools", "traps", "food-and-drink", "alchemical-elixirs"]
  }),

  shop("thalers-drugstore", "A Drogaria do Táler", "Forte do Cardo", {
    book: CORE, section: "The Thaler’s Drugstore"
  }, "Drogaria das irmãs Ofera e Moria, abastecida com ingredientes, extratos e elixires preparados.", [
    pool("elixirs", { anyTags: ["alchemical-elixirs"], picks: [8, 16], quantity: [1, 8], weight: 4 }),
    pool("ingredients", { anyTags: ["trade-goods", "tools", "containers"], picks: [3, 8], quantity: [2, 12] }),
    pool("medical", { anyTags: ["specialized-tools"], picks: [1, 4], quantity: [1, 4] })
  ], {
    price: [95, 105], icon: "fa-flask-vial", essentials: ALCHEMIST_ESSENTIALS,
    categories: ["alchemical-elixirs", "trade-goods", "tools", "containers"]
  }),

  shop("big-bashers-smithy", "Ferraria do Grande Golpeador", "Forte do Cardo", {
    book: CORE, section: "Big-Basher’s Smithy"
  }, "A ferraria do ogro Grande Golpeador, conhecido como um dos melhores ferreiros de Forte do Cardo.", [
    pool("melee", { anyTags: ["melee-weapons", "shields"], picks: [7, 14], quantity: [1, 4], weight: 3 }),
    pool("ranged", { anyTags: ["ranged-weapons", "arrows"], picks: [2, 6], quantity: [1, 8] }),
    pool("armor", { anyTags: ["armor"], picks: [4, 8], quantity: [1, 3], weight: 2 }),
    pool("smith-tools", { anyTags: ["tools", "specialized-tools"], picks: [1, 4], quantity: [1, 5] })
  ], {
    price: [105, 125], icon: "fa-hammer", essentials: ARMORY_ESSENTIALS,
    categories: ["melee-weapons", "ranged-weapons", "armor", "tools"]
  }),

  shop("queens-square-market", "Mercado da Praça da Rainha", "Forte do Cardo", {
    book: CORE, section: "The Queen’s Square"
  }, "Mercado de equipamento usado. A seleção muda muito e recompensa quem aceita procurar entre mercadorias de qualidade e procedência variadas.", [
    pool("used-weapons", { categories: ["weapon"], picks: [3, 9], quantity: [1, 3] }),
    pool("used-armor", { categories: ["armor"], picks: [2, 5], quantity: [1, 2] }),
    pool("used-equipment", { categories: ["equipment"], excludeTags: ["artifacts"], picks: [8, 18], quantity: [1, 8], weight: 3 })
  ], {
    price: [65, 95], icon: "fa-people-group", essentials: GENERAL_MARKET_ESSENTIALS,
    categories: [
      "melee-weapons", "ranged-weapons", "armor", "alchemical-elixirs", "survival-items",
      "tools", "containers", "clothing", "trade-goods"
    ]
  }),

  shop("the-treasury", "O Tesouro", "Praça Antiga, Forte do Cardo", {
    book: CORE, section: "The Treasury"
  }, "Casa de leilões administrada por Sefira e sua família, especializada em autenticar e negociar artefatos, curiosidades e objetos de arte.", [
    pool("artifacts", { anyTags: ["artifacts", "minor-artifacts"], picks: [0, 3], quantity: [1, 1], chance: 0.7, weight: 4 }),
    pool("curiosities", { anyTags: ["curiosities"], picks: [3, 9], quantity: [1, 2], weight: 3 }),
    pool("trade", { anyTags: ["trade-goods"], picks: [1, 4], quantity: [1, 4] })
  ], {
    price: [110, 150], icon: "fa-gavel", essentials: TREASURY_ESSENTIALS,
    categories: ["artifacts", "curiosities", "trade-goods"]
  }),

  shop("faraldos-novelty-store", "Loja de Novidades do Faraldo", "Praça Antiga, Forte do Cardo", {
    book: CORE, section: "The Antique Plaza"
  }, "Estabelecimento de antiguidades que recebe acesso antecipado a achados trazidos da Davokar.", [
    pool("curiosities", { anyTags: ["curiosities"], picks: [5, 12], quantity: [1, 3], weight: 4 }),
    pool("minor-artifacts", { anyTags: ["minor-artifacts"], picks: [0, 3], quantity: [1, 1], chance: 0.75 }),
    pool("treasures", { anyTags: ["trade-goods"], picks: [2, 6], quantity: [1, 5] })
  ], {
    price: [105, 140], icon: "fa-gem", essentials: CURIOSITY_ESSENTIALS,
    categories: ["minor-artifacts", "curiosities", "trade-goods"]
  }),

  shop("prospectors-friend", "Amigo do Prospector", "Esperança de Salindra", {
    book: ADVENTURE_COLLECTION, section: "A3-SA-4. Amigo do Prospector"
  }, "Semel vende equipamento a garimpeiros isolados, cobrando preços muito acima dos encontrados nas cidades.", [
    pool("expedition", { anyTags: ["survival-items", "containers", "tools"], picks: [5, 11], quantity: [1, 8], weight: 4 }),
    pool("supplies", { anyTags: ["food-and-drink", "alchemical-elixirs"], picks: [2, 5], quantity: [1, 6] }),
    pool("weapons", { categories: ["weapon"], picks: [1, 4], quantity: [1, 2] })
  ], {
    price: [150, 200], icon: "fa-person-digging", essentials: EXPEDITION_ESSENTIALS,
    categories: [
      "survival-items", "containers", "tools", "food-and-drink", "alchemical-elixirs",
      "melee-weapons", "ranged-weapons"
    ]
  }),

  shop("afadirs-triumph", "Taverna Triunfo de Afadir", "Forte do Cardo", {
    book: CORE, section: "Afadir’s Triumph Tavern"
  }, "Taverna cara que tenta recriar a culinária de Alberetor com ingredientes locais.", [
    pool("meals", { anyTags: ["food-and-drink"], excludeTags: ["ingredient"], picks: [6, 13], quantity: [2, 12], weight: 4 }),
    pool("drinks", { anyTags: ["beverages", "teas"], picks: [3, 8], quantity: [3, 15] })
  ], {
    price: [120, 170], icon: "fa-utensils", essentials: FINE_DINING_ESSENTIALS,
    categories: ["food-and-drink"]
  }),

  shop("halls-of-symbaroum", "Os Salões de Symbaroum", "Forte do Cardo", {
    book: CORE, section: "The Salons of Symbaroum"
  }, "Grande casa de entretenimento onde comida, bebidas, jogos, espetáculos e diversos serviços se encontram sob o mesmo teto.", [
    pool("food", { anyTags: ["food-and-drink"], picks: [8, 16], quantity: [3, 15], weight: 4 }),
    pool("hospitality", { anyTags: ["service-hospitality"], picks: [1, 4], quantity: [1, 12], weight: 2 }),
    pool("entertainment", { anyTags: ["service-other", "tobacco-types", "tobacco-utensils"], picks: [1, 5], quantity: [1, 5] })
  ], {
    price: [100, 150], icon: "fa-champagne-glasses", essentials: TAVERN_ESSENTIALS,
    categories: ["food-and-drink", "tobacco-types", "tobacco-utensils", "service-hospitality", "service-other"]
  }),

  shop("winged-ladle", "A Concha Alada", "Forte do Cardo", {
    book: WRATH_OF_THE_WARDEN, section: "The Winged Ladle"
  }, "Hospedaria tradicional próxima ao portão leste, procurada por viajantes abastados que desejam bons quartos, refeições e bebida.", [
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [2, 5], quantity: [1, 10], weight: 3 }),
    pool("food", { anyTags: ["food-and-drink"], picks: [4, 9], quantity: [2, 12], weight: 2 }),
    pool("drinks", { anyTags: ["beverages", "teas"], picks: [2, 6], quantity: [3, 15] })
  ], {
    price: [115, 155], icon: "fa-spoon", essentials: INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality"]
  }),

  shop("rose-garden", "O Jardim das Rosas", "Forte do Cardo", {
    book: WRATH_OF_THE_WARDEN, section: "The Rose Garden"
  }, "Casa de hóspedes barata perto do portão oeste. Oferece abrigo simples a viajantes com poucas moedas.", [
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [1, 4], quantity: [2, 16], weight: 5 }),
    pool("simple-food", { anyTags: ["porridges", "soups", "beverages"], picks: [1, 4], quantity: [3, 15] })
  ], {
    price: [55, 85], icon: "fa-seedling", essentials: CHEAP_INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality"]
  }),

  shop("court-and-harp", "A Corte e a Harpa", "Forte do Cardo", {
    book: WRATH_OF_THE_WARDEN, section: "The Court and Harp"
  }, "Estalagem luxuosa da Praça Antiga, com quartos inspirados nas câmaras de celebridades e atendimento voltado à elite.", [
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [3, 6], quantity: [1, 8], weight: 4 }),
    pool("fine-food", { anyTags: ["food-and-drink"], picks: [5, 10], quantity: [2, 10] }),
    pool("tobacco", { anyTags: ["tobacco-types", "tobacco-utensils"], picks: [1, 3], quantity: [1, 4], chance: 0.55 })
  ], {
    price: [140, 210], icon: "fa-crown", essentials: FINE_INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality", "tobacco-types", "tobacco-utensils"]
  }),

  shop("witch-and-familiar", "A Bruxa e o Familiar", "Forte do Cardo", {
    book: WRATH_OF_THE_WARDEN, section: "The Witch and Familiar"
  }, "Casa de hóspedes de Alomar e Agdala, ambientada como um acampamento bárbaro e conhecida por sua hospitalidade incomum.", [
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [2, 5], quantity: [1, 12], weight: 3 }),
    pool("barbarian-food", { anyTags: ["meat", "stews", "porridges", "beverages"], picks: [4, 9], quantity: [2, 15], weight: 2 }),
    pool("travel", { anyTags: ["survival-items"], picks: [1, 4], quantity: [1, 5], chance: 0.65 })
  ], {
    price: [85, 115], icon: "fa-hat-wizard", essentials: BARBARIAN_INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality", "survival-items"]
  }),

  shop("the-ruin", "A Ruína", "Forte do Cardo", {
    book: CORE, section: "The Ruin"
  }, "Hospedaria muito conhecida entre caçadores de tesouros. Reúne quartos, comida simples, bebida e os serviços mais procurados por expedicionários.", [
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [2, 5], quantity: [1, 12] }),
    pool("food", { anyTags: ["food-and-drink"], picks: [3, 8], quantity: [2, 15] }),
    pool("expedition", { anyTags: ["survival-items", "tools"], picks: [1, 5], quantity: [1, 6], chance: 0.75 })
  ], {
    price: [90, 125], icon: "fa-campground", essentials: INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality", "survival-items", "tools"]
  }),

  shop("legends", "Lendas", "Forte do Cardo", {
    book: WRATH_OF_THE_WARDEN, section: "Legends"
  }, "Taverna frequentada por contadores de histórias e interessados no passado de Ambria, na Grande Guerra e nas ruínas antigas.", [
    pool("drinks", { anyTags: ["beverages", "teas"], picks: [3, 7], quantity: [3, 15], weight: 3 }),
    pool("food", { anyTags: ["food-and-drink"], picks: [2, 6], quantity: [2, 12] }),
    pool("stories", { anyTags: ["service-information"], picks: [0, 2], quantity: [1, 3], chance: 0.45 })
  ], {
    price: [95, 125], icon: "fa-book-open", essentials: TAVERN_ESSENTIALS,
    categories: ["food-and-drink", "service-information"]
  }),

  shop("benegos", "Benego’s", "Forte do Cardo", {
    book: WRATH_OF_THE_WARDEN, section: "Benego’s"
  }, "Casa de jogos popular entre caçadores de fortuna que tentam financiar ou ampliar os recursos de uma expedição.", [
    pool("gaming", { anyTags: ["service-other"], picks: [1, 4], quantity: [1, 20], weight: 4 }),
    pool("drinks", { anyTags: ["beverages"], picks: [2, 5], quantity: [3, 15] }),
    pool("tobacco", { anyTags: ["tobacco-types", "tobacco-utensils"], picks: [1, 4], quantity: [1, 8] })
  ], {
    price: [90, 120], icon: "fa-dice", essentials: GAME_HOUSE_ESSENTIALS,
    categories: ["beverages", "tobacco-types", "tobacco-utensils", "service-other"]
  }),

  shop("karvosti-market-days", "Dias de Mercado de Karvosti", "Karvosti", {
    book: CORE, section: "The Thingstead"
  }, "Mercado sazonal realizado nos equinócios, quando comerciantes e famílias dos clãs ocupam o platô com tendas, carroças e bens de toda a região.", [
    pool("trade", { anyTags: ["trade-goods", "farm-animals", "containers"], picks: [8, 18], quantity: [2, 20], weight: 4 }),
    pool("food", { anyTags: ["food-and-drink", "tobacco-types"], picks: [6, 14], quantity: [3, 20], weight: 3 }),
    pool("equipment", { anyTags: ["equipment", "tools", "survival-items"], excludeTags: ["artifacts"], picks: [5, 12], quantity: [1, 10] }),
    pool("weapons", { categories: ["weapon", "armor"], picks: [2, 7], quantity: [1, 4], chance: 0.8 })
  ], {
    price: [80, 120], icon: "fa-tents", essentials: GENERAL_MARKET_ESSENTIALS,
    categories: [
      "trade-goods", "farm-animals", "containers", "food-and-drink", "tobacco-types", "clothing",
      "survival-items", "tools", "melee-weapons", "ranged-weapons", "armor"
    ]
  }),

  shop("mother-mehiras-agency", "Agência da Mãe Mehira", "Forte do Cardo", {
    book: CORE, section: "Mother Mehira’s Agency"
  }, "Agência que aproxima expedições de guias, especialistas, guardas e outros profissionais úteis em incursões pela Davokar.", [
    pool("specialists", {
      anyTags: ["service-contracts", "service-professionals", "service-travel", "service-information"],
      picks: [5, 12], quantity: [1, 6], weight: 5
    })
  ], {
    price: [100, 140], icon: "fa-people-arrows", essentials: SERVICE_ESSENTIALS,
    categories: ["service-contracts", "service-professionals", "service-travel", "service-information"]
  }),

  shop("black-square-market", "Mercado da Praça Negra", "Brejanegra", {
    book: WRATH_OF_THE_WARDEN, section: "The Black Square"
  }, "Centro comercial informal de Brejanegra, onde mercadorias comuns, suprimentos, achados e serviços mudam de mãos sem o controle de Forte do Cardo.", [
    pool("equipment", { anyTags: ["equipment", "tools", "survival-items"], excludeTags: ["artifacts"], picks: [7, 16], quantity: [1, 12], weight: 4 }),
    pool("food", { anyTags: ["food-and-drink"], picks: [4, 10], quantity: [3, 18] }),
    pool("weapons", { categories: ["weapon", "armor"], picks: [2, 7], quantity: [1, 4] }),
    pool("finds", { anyTags: ["curiosities", "minor-artifacts"], picks: [0, 3], quantity: [1, 1], chance: 0.45 })
  ], {
    price: [75, 125], icon: "fa-tent", essentials: GENERAL_MARKET_ESSENTIALS,
    categories: [
      "survival-items", "tools", "containers", "food-and-drink", "melee-weapons",
      "ranged-weapons", "armor", "trade-goods", "curiosities", "minor-artifacts", "clothing"
    ]
  }),

  shop("odovakar", "Odovakar", "Forte do Cardo", {
    book: "Forte do Cardo — Ira do Guardião", section: "Odovakar"
  }, "Taverna bárbara conhecida por carnes assadas, raízes ensopadas, especiarias da floresta e tortas de cogumelo.", [
    pool("meat", { anyTags: ["meat"], picks: [3, 7], quantity: [3, 15], weight: 4 }),
    pool("stews", { anyTags: ["stews", "soups"], picks: [2, 5], quantity: [2, 12] }),
    pool("pies", { anyTags: ["pies"], picks: [1, 4], quantity: [2, 10] }),
    pool("drinks", { anyTags: ["beverages"], picks: [2, 5], quantity: [3, 15] })
  ], {
    price: [90, 115], icon: "fa-bowl-food", essentials: BARBARIAN_FOOD_ESSENTIALS,
    categories: ["food-and-drink"]
  }),

  shop("the-slaughterhouse", "O Matadouro", "Forte do Cardo", {
    book: "Forte do Cardo — Ira do Guardião", section: "The Slaughterhouse"
  }, "Taverna e açougue de Mestre Morlam, com miúdos baratos e cortes melhores para clientes dispostos a pagar mais.", [
    pool("meat", { anyTags: ["meat"], picks: [5, 11], quantity: [4, 20], weight: 5 }),
    pool("stews", { anyTags: ["stews", "soups"], picks: [2, 6], quantity: [3, 15] }),
    pool("drinks", { anyTags: ["beverages"], picks: [2, 5], quantity: [3, 15] })
  ], {
    price: [70, 120], icon: "fa-drumstick-bite", essentials: MEAT_TAVERN_ESSENTIALS,
    categories: ["food-and-drink"]
  }),

  shop("chiefs-bell", "O Sino do Chefe", "Kastor", {
    book: ADVENTURE_COLLECTION, section: "A4-KA-4. O Sino do Chefe"
  }, "Estalagem ruidosa de Kastor, voltada a bebida, refeições, quartos e diversão para expedicionários.", [
    pool("drinks", { anyTags: ["beverages"], picks: [4, 9], quantity: [4, 20], weight: 4 }),
    pool("food", { anyTags: ["food-and-drink"], picks: [3, 8], quantity: [3, 15] }),
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [1, 4], quantity: [1, 12] })
  ], {
    price: [85, 115], icon: "fa-bell", essentials: INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality"]
  }),

  shop("rusty-dragon", "O Dragão Enferrujado", "Kastor", {
    book: ADVENTURE_COLLECTION, section: "A4-KA-5. O Dragão Enferrujado"
  }, "Uma das estalagens mais antigas e respeitadas de Kastor, frequentada por cidadãos importantes.", [
    pool("food", { anyTags: ["food-and-drink"], picks: [5, 11], quantity: [2, 12] }),
    pool("drinks", { anyTags: ["beverages"], picks: [3, 7], quantity: [3, 15] }),
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [2, 5], quantity: [1, 10] })
  ], {
    price: [105, 145], icon: "fa-dragon", essentials: INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality"]
  }),

  shop("queens-threshold", "O Limiar da Rainha", "Passo de Prios", {
    book: ADVENTURE_COLLECTION, section: "A5-PP-5. The Queen’s Threshold"
  }, "A estalagem mais antiga do vilarejo, com dormitórios, quartos, refeições e bebidas.", [
    pool("food", { anyTags: ["food-and-drink"], picks: [4, 10], quantity: [3, 15] }),
    pool("drinks", { anyTags: ["beverages"], picks: [2, 6], quantity: [3, 15] }),
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [2, 5], quantity: [1, 12] })
  ], {
    price: [90, 120], icon: "fa-bed", essentials: INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality"]
  }),

  shop("the-trout", "A Truta", "Passo de Prios", {
    book: ADVENTURE_COLLECTION, section: "A5-PP-6. The Trout"
  }, "Taverna famosa por pratos de peixe; nos porões também circulam mercadorias contrabandeadas e achados perigosos.", [
    pool("fish", { anyTags: ["fish"], picks: [5, 11], quantity: [3, 15], weight: 5 }),
    pool("food", { anyTags: ["soups", "pies", "desserts", "beverages"], picks: [4, 9], quantity: [2, 12] }),
    pool("contraband", { anyTags: ["curiosities", "minor-artifacts", "artifacts"], picks: [0, 3], quantity: [1, 1], chance: 0.45 })
  ], {
    price: [95, 145], icon: "fa-fish", essentials: FISH_TAVERN_ESSENTIALS,
    categories: ["food-and-drink", "curiosities", "artifacts"]
  }),

  shop("tandem", "Tandem", "Ravenia", {
    book: ADVENTURE_COLLECTION, section: "A6-R.19. Tandem"
  }, "Taverna especializada em queijos, embutidos, canapés e uma enorme variedade de frios.", [
    pool("finger-food", { anyTags: ["meat", "food-and-drink"], excludeTags: ["beverages"], picks: [7, 14], quantity: [3, 18], weight: 5 }),
    pool("drinks", { anyTags: ["beverages"], picks: [2, 6], quantity: [3, 15] })
  ], {
    price: [95, 125], icon: "fa-cheese", essentials: DELICATESSEN_ESSENTIALS,
    categories: ["food-and-drink"]
  }),

  shop("barbarity", "Barbaridade", "Ravenia", {
    book: ADVENTURE_COLLECTION, section: "A6-R.1. Barbarity"
  }, "Estalagem acolhedora de Doralg e Moira, com comida ambriana e rústica, bebidas, dormitórios e quartos.", [
    pool("food", { anyTags: ["food-and-drink"], picks: [6, 13], quantity: [3, 15], weight: 4 }),
    pool("drinks", { anyTags: ["beverages"], picks: [3, 7], quantity: [3, 15] }),
    pool("lodging", { anyTags: ["service-hospitality", "expenses"], picks: [2, 5], quantity: [1, 12] })
  ], {
    price: [85, 115], icon: "fa-house-chimney", essentials: INN_ESSENTIALS,
    categories: ["food-and-drink", "service-hospitality"]
  }),

  shop("master-tailor-norlio", "Mestre Alfaiate Norlio", "Ravenia", {
    book: ADVENTURE_COLLECTION, section: "A6-R.12. Master Tailor Norlio"
  }, "Oficina de roupas de exploração exclusivas, resistentes e práticas para clientes abastados.", [
    pool("clothing", { anyTags: ["clothing"], picks: [8, 16], quantity: [1, 6], weight: 5 }),
    pool("expedition", { anyTags: ["survival-items", "containers"], picks: [2, 6], quantity: [1, 5] })
  ], {
    price: [130, 200], icon: "fa-shirt", essentials: TAILOR_ESSENTIALS,
    categories: ["clothing", "survival-items", "containers"]
  })
]);

export const OFFICIAL_SHOP_PRESET_BY_ID = new Map(
  OFFICIAL_SHOP_PRESETS.map((entry) => [entry.id, entry])
);

