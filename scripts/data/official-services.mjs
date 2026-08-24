function service(id, name, {
  img = "icons/svg/coins.svg",
  description,
  category,
  cost,
  unit = "purchase",
  fulfillment = "instant",
  origin = "core-rulebook",
  source = "",
  itemCategories = [],
  priceMode = "fixed",
  pricingNote = ""
}) {
  return Object.freeze({
    id,
    name,
    img,
    description,
    category,
    cost,
    priceMode,
    pricingNote,
    unit,
    fulfillment,
    origin,
    source,
    official: true,
    offerKind: "service",
    itemCategories: Object.freeze([...new Set(["services", ...itemCategories])])
  });
}

const EXPENSE_ITEM_CATEGORIES = Object.freeze(["expenses"]);

/**
 * Services and expenses that are sold in the official rules but do not need to
 * become physical Items in an Actor inventory.
 */
export const OFFICIAL_SERVICES = Object.freeze([
  service("inn-bath", "Banho em estalagem", {
    description: "Um banho preparado por uma estalagem ou casa de hospedagem.",
    category: "hospitality",
    cost: "3 ortegas",
    source: "Livro Básico — Equipamentos, Tabela 20"
  }),
  service("laundry", "Lavanderia", {
    description: "Lavagem das roupas e pertences pessoais do viajante.",
    category: "hospitality",
    cost: "7 ortegas",
    source: "Livro Básico — Equipamentos, Tabela 20"
  }),
  service("rural-lodging", "Estadia em estalagem rural", {
    description: "Uma diária simples em uma estalagem rural, com duas refeições.",
    category: "hospitality",
    cost: "5 ortegas",
    unit: "day",
    fulfillment: "temporary",
    source: "Livro Básico — Equipamentos, Tabela 19",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("city-lodging", "Estadia em estalagem urbana", {
    description: "Uma diária em uma estalagem urbana, com duas refeições. O preço oficial começa em 1 xelim.",
    category: "hospitality",
    cost: "1 xelim",
    unit: "day",
    fulfillment: "temporary",
    source: "Livro Básico — Equipamentos, Tabela 19",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("bodyguard", "Guarda-costas", {
    description: "Contratação de um guarda-costas por dia de serviço.",
    category: "contracts",
    cost: "1 xelim",
    unit: "day",
    fulfillment: "temporary",
    source: "Livro Básico — Equipamentos, Tabela 20"
  }),
  service("cartographer", "Cartógrafo", {
    description: "Serviço profissional para produzir ou interpretar um mapa.",
    category: "professionals",
    cost: "1 táler",
    fulfillment: "consumable",
    source: "Livro Básico — Equipamentos, Tabela 20"
  }),
  service("medicus", "Médico", {
    description: "Atendimento de um médico. Preparações alquímicas necessárias são cobradas separadamente.",
    category: "professionals",
    cost: "1 xelim",
    fulfillment: "consumable",
    source: "Livro Básico — Equipamentos, Tabela 20"
  }),
  service("mystic-ritual", "Ritual místico", {
    description: "Contratação de um místico para executar um ritual disponível.",
    category: "professionals",
    cost: "10 táleres",
    fulfillment: "consumable",
    source: "Livro Básico — Equipamentos, Tabela 20"
  }),
  service("road-toll", "Pedágio de estrada ou cidade", {
    description: "Taxa comum para atravessar uma estrada, ponte, portão ou cidade.",
    category: "fees",
    cost: "1 ortega",
    source: "Livro Básico — Equipamentos, Tabela 20",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-hold-entry-toll", "Pedágio de entrada em Forte do Cardo", {
    description: "A entrada sem carta de passagem custa 1 xelim por perna ou roda que atravesse o portão. Use a quantidade para informar o total de pernas e rodas: uma pessoa a pé paga 2 xelins; uma pessoa puxando uma carroça de duas rodas paga 4 xelins; cavaleiro e cavalo pagam 6 xelins. Quem entrar para negociar também deve declarar os bens e pagar separadamente uma taxa de 10% do valor de mercado.",
    category: "fees",
    cost: "1 xelim",
    unit: "legOrWheel",
    fulfillment: "instant",
    origin: "core-rulebook",
    source: "Livro Básico — Forte do Cardo: Ganhando Acesso ao Forte",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("porter", "Carregador", {
    description: "Carregador capaz de transportar 40 unidades de equipamento durante uma expedição. Sua alimentação deve ser providenciada pelo contratante.",
    category: "contracts",
    cost: "1 xelim",
    unit: "day",
    fulfillment: "temporary",
    origin: "game-masters-guide",
    source: "Guia do Mestre — Movimento em Davokar"
  }),
  service("guide", "Guia de expedição", {
    description: "Contratação semanal de um guia. O preço-base é 1 táler, acrescido de 1 táler por ponto de Vigilante acima de 11 e de 1 táler por nível de Mateiro acima de Novato.",
    category: "contracts",
    cost: "1 táler",
    unit: "week",
    fulfillment: "temporary",
    origin: "game-masters-guide",
    source: "Guia do Mestre — Movimento em Davokar"
  }),
  service("archive-access", "Acesso a arquivos", {
    description: "Acesso diário a arquivos ou coleções de documentos para pesquisa durante o planejamento de uma expedição.",
    category: "information",
    cost: "1 táler",
    unit: "day",
    fulfillment: "temporary",
    origin: "game-masters-guide",
    source: "Guia do Mestre — Planejando uma expedição"
  }),
  service("private-librarian", "Auxílio de bibliotecário", {
    description: "Assistência diária de um bibliotecário particular durante uma pesquisa.",
    category: "information",
    cost: "10 táleres",
    unit: "day",
    fulfillment: "temporary",
    origin: "game-masters-guide",
    source: "Guia do Mestre — Planejando uma expedição"
  }),
  service("treasure-information", "Informação de caçador de tesouros", {
    description: "Informação de um informante comum. Impõe –1 ao líder ou guia nos Testes de orientação e +1 nas rolagens das tabelas de inimigos e terreno.",
    category: "information",
    cost: "1-9 táleres",
    fulfillment: "consumable",
    origin: "game-masters-guide",
    source: "Guia do Mestre — Planejando uma expedição"
  }),
  service("explorer-license", "Licença de Explorador", {
    img: "icons/svg/book.svg",
    description: "Documento oficial para viagens e explorações legalizadas em Davokar. Pode ser mensal ou anual e seu custo depende do tamanho, dos objetivos e da composição da expedição.",
    category: "permits",
    cost: "2 táleres",
    unit: "month",
    fulfillment: "temporary",
    origin: "core-rulebook",
    source: "Livro Básico — Licença de Explorador"
  })
]);
