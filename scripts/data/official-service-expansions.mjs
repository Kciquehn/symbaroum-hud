function service(id, name, {
  description,
  category,
  cost,
  unit = "purchase",
  fulfillment = "instant",
  origin = "core-rulebook",
  source,
  itemCategories = [],
  priceMode = "fixed",
  pricingNote = ""
}) {
  return Object.freeze({
    id,
    name,
    img: "icons/svg/coins.svg",
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

const CORE_EXPENSES = "Livro Básico — Equipamentos, Tabela 19";
const CORE_LICENSE = "Livro Básico — Licença de Explorador";
const GMG_TROOPS = "Guia do Mestre — Tabela 20: Custos de Tropas";
const GMG_WAGES = "Guia do Mestre — Salários e padrões de vida";
const GMG_EXPEDITIONS = "Guia do Mestre — Planejando uma expedição";
const WARDEN_PRICES = "A Fúria do Guardião — Forte do Cardo, Tabela 3";
const EXPENSE_ITEM_CATEGORIES = Object.freeze(["expenses"]);

/**
 * Purchasable services found in the official books which do not need a
 * physical Foundry Item. Offers without a fixed monetary value are marked as
 * negotiated so a GM can record the agreed price without inventing a default.
 */
export const OFFICIAL_SERVICE_EXPANSIONS = Object.freeze([
  service("rural-barn-lodging", "Alojamento rural no palheiro", {
    description: "A refeição e o lugar mais simples para dormir no interior, normalmente em um palheiro.",
    category: "hospitality", cost: "1 ortega", unit: "day", fulfillment: "temporary",
    source: CORE_EXPENSES, itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("rural-banquet", "Banquete rural", {
    description: "Banquete servido no interior; o preço é cobrado por pessoa.",
    category: "hospitality", cost: "1 xelim", unit: "person", fulfillment: "consumable",
    source: CORE_EXPENSES, itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("urban-banquet", "Banquete urbano", {
    description: "Banquete servido em uma cidade; o preço é cobrado por pessoa.",
    category: "hospitality", cost: "1 táler", unit: "person", fulfillment: "consumable",
    source: CORE_EXPENSES, itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("field-life-knight", "Vida no campo — cavaleiro", {
    description: "Despesas diárias de campanha e manutenção de um cavaleiro.",
    category: "contracts", cost: "1 táler", unit: "day", fulfillment: "temporary",
    source: CORE_EXPENSES, itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("field-life-mounted-knight", "Vida no campo — cavaleiro montado", {
    description: "Despesas diárias de campanha e manutenção de um cavaleiro montado.",
    category: "contracts", cost: "5 xelins", unit: "day", fulfillment: "temporary",
    source: CORE_EXPENSES, itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("field-life-infantry", "Vida no campo — soldado de infantaria", {
    description: "Despesas diárias de campanha e manutenção de um soldado de infantaria.",
    category: "contracts", cost: "5 ortegas", unit: "day", fulfillment: "temporary",
    source: CORE_EXPENSES, itemCategories: EXPENSE_ITEM_CATEGORIES
  }),

  service("urban-manual-laborer", "Trabalhador braçal urbano", {
    description: "Contratação diária de um trabalhador braçal em ambiente urbano, segundo a referência salarial oficial.",
    category: "contracts", cost: "1 ortega", unit: "day", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_WAGES
  }),
  service("army-soldier-wage", "Soldado do exército", {
    description: "Pagamento semanal de um soldado regular do exército; os demais custos de manutenção são cobertos pela organização militar.",
    category: "contracts", cost: "1 ortega", unit: "week", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_WAGES
  }),
  service("infantry-mercenary", "Mercenário de infantaria", {
    description: "Contratação diária de um mercenário de infantaria, conforme a referência salarial oficial.",
    category: "contracts", cost: "1 xelim", unit: "day", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_WAGES
  }),
  service("mounted-mercenary", "Mercenário de cavalaria com cavalo", {
    description: "Contratação diária de um mercenário de cavalaria que fornece o próprio cavalo.",
    category: "contracts", cost: "10 xelins", unit: "day", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_WAGES
  }),
  service("noble-lifestyle", "Estilo de vida nobre", {
    description: "Custo diário de um padrão de vida nobre, conforme a referência econômica oficial.",
    category: "other", cost: "100 táleres", unit: "day", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_WAGES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("expedition-guide-adjusted", "Guia de expedição experiente", {
    description: "Contratação semanal de um guia cujo Vigilante ou nível de Mateiro eleva o preço acima do valor-base.",
    category: "contracts", cost: "1 táler + Vigilante + Mateiro", unit: "week", fulfillment: "temporary",
    priceMode: "negotiated",
    pricingNote: "O Mestre calcula 1 táler, mais 1 táler para cada ponto de Vigilante do guia acima de 11 e mais 1 táler para cada nível de Mateiro acima de Novato, informando o total por semana.",
    origin: "game-masters-guide", source: GMG_EXPEDITIONS
  }),

  service("troop-weak", "Tropa fraca", {
    description: "Contrata uma tropa de 1 Ponto de Batalha, como fazendeiros, caçadores de fortuna ou escudeiros. Em campanha de saque, metade costuma ser paga adiantada.",
    category: "contracts", cost: "1 ortega", unit: "day", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_TROOPS
  }),
  service("troop-ordinary", "Tropa comum", {
    description: "Contrata uma tropa de 2 Pontos de Batalha, como arqueiros, infantaria ou guerreiros de aldeia.",
    category: "contracts", cost: "1 xelim", unit: "day", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_TROOPS
  }),
  service("troop-challenging", "Tropa desafiadora", {
    description: "Contrata uma tropa de 5 Pontos de Batalha, como guerreiros da guarda, oficiais ou sapadores.",
    category: "contracts", cost: "1 táler", unit: "day", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_TROOPS
  }),
  service("troop-strong", "Tropa forte", {
    description: "Contrata uma tropa de 10 Pontos de Batalha, como cavaleiros, Mestres da Ordem ou teurgos.",
    category: "contracts", cost: "5 táleres", unit: "day", fulfillment: "temporary",
    origin: "game-masters-guide", source: GMG_TROOPS
  }),

  service("informant-light-davokar", "Informante experiente — Davokar Claro", {
    description: "Informação experiente sobre Davokar Claro: +1 nos Testes de orientação e –1 nas rolagens das tabelas de inimigos e terreno. O preço pode ser negociado até 20 táleres.",
    category: "information", cost: "20-25 táleres", fulfillment: "consumable",
    origin: "game-masters-guide", source: GMG_EXPEDITIONS
  }),
  service("informant-wild-davokar", "Fonte da Ordo Magica — Davokar Selvagem", {
    description: "Informação especializada sobre Davokar Selvagem: +1 nos Testes de orientação e –1 nas rolagens das tabelas de inimigos e terreno. O preço pode ser negociado até 40 táleres.",
    category: "information", cost: "40-50 táleres", fulfillment: "consumable",
    origin: "game-masters-guide", source: GMG_EXPEDITIONS
  }),
  service("informant-dark-davokar", "Informante de elite — Davokar Escuro", {
    description: "Informação de elite sobre Davokar Escuro: +1 nos Testes de orientação e –1 nas rolagens das tabelas de inimigos e terreno. O preço pode ser negociado até 80 táleres; a alternativa oficial é 4–5% do saque.",
    category: "information", cost: "80-100 táleres", fulfillment: "consumable",
    origin: "game-masters-guide", source: GMG_EXPEDITIONS
  }),
  service("informant-dark-davokar-loot-share", "Informante de elite — participação no saque", {
    description: "Alternativa oficial ao pagamento em dinheiro por informação sobre Davokar Escuro: o informante recebe 5% do saque, negociável a 4%.",
    category: "information", cost: "4–5% do saque", fulfillment: "consumable",
    priceMode: "negotiated",
    pricingNote: "O Mestre registra a participação acordada. Informe 0 em moedas quando o contrato for exclusivamente uma porcentagem do saque.",
    origin: "game-masters-guide", source: GMG_EXPEDITIONS
  }),
  service("expedition-library-research", "Pesquisa em bibliotecas e arquivos", {
    description: "Uma semana de pesquisa. O preço oficial é 10+1D6 táleres; o Mestre em Saber pode usar Astuto em vez de Vigilante para localizar uma ruína rica.",
    category: "information", cost: "11-16 táleres", unit: "week", fulfillment: "temporary",
    origin: "adventure-collection-1", source: "Conjunto de Aventuras 1 — Pesquisa para expedições"
  }),

  service("explorer-license-individual-year", "Licença de Explorador — individual anual", {
    description: "Licença anual para uma pessoa. Adicionais de coleta, extração, exploração, carroças, inexperiência e intenções são cobrados separadamente.",
    category: "permits", cost: "9 táleres", unit: "year", fulfillment: "temporary", source: CORE_LICENSE
  }),
  service("explorer-license-2-5-month", "Licença de Explorador — 2 a 5 pessoas, mensal", {
    description: "Licença coletiva mensal para um grupo de duas a cinco pessoas.",
    category: "permits", cost: "10 táleres", unit: "month", fulfillment: "temporary", source: CORE_LICENSE
  }),
  service("explorer-license-2-5-year", "Licença de Explorador — 2 a 5 pessoas, anual", {
    description: "Licença coletiva anual para um grupo de duas a cinco pessoas.",
    category: "permits", cost: "50 táleres", unit: "year", fulfillment: "temporary", source: CORE_LICENSE
  }),
  service("explorer-license-6-8-month", "Licença de Explorador — 6 a 8 pessoas, mensal", {
    description: "Licença coletiva mensal para um grupo de seis a oito pessoas.",
    category: "permits", cost: "25 táleres", unit: "month", fulfillment: "temporary", source: CORE_LICENSE
  }),
  service("explorer-license-6-8-year", "Licença de Explorador — 6 a 8 pessoas, anual", {
    description: "Licença coletiva anual para um grupo de seis a oito pessoas.",
    category: "permits", cost: "90 táleres", unit: "year", fulfillment: "temporary", source: CORE_LICENSE
  }),
  service("explorer-license-9-10-month", "Licença de Explorador — 9 a 10 pessoas, mensal", {
    description: "Licença coletiva mensal para um grupo de nove a dez pessoas.",
    category: "permits", cost: "55 táleres", unit: "month", fulfillment: "temporary", source: CORE_LICENSE
  }),
  service("explorer-license-9-10-year", "Licença de Explorador — 9 a 10 pessoas, anual", {
    description: "Licença coletiva anual para um grupo de nove a dez pessoas.",
    category: "permits", cost: "180 táleres", unit: "year", fulfillment: "temporary", source: CORE_LICENSE
  }),
  service("explorer-license-unlimited-year", "Licença de Explorador — anual sem limite", {
    description: "Licença coletiva anual sem limite de participantes.",
    category: "permits", cost: "450 táleres", unit: "year", fulfillment: "temporary", source: CORE_LICENSE
  }),
  service("explorer-license-gathering", "Adicional da Licença — coleta", {
    description: "Adicional oficial pela coleta de recursos durante a expedição.",
    category: "fees", cost: "3-10 táleres", source: CORE_LICENSE,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("explorer-license-harvesting", "Adicional da Licença — extração", {
    description: "Adicional oficial pela extração de recursos durante a expedição.",
    category: "fees", cost: "5-12 táleres", source: CORE_LICENSE,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("explorer-license-exploration", "Adicional da Licença — exploração", {
    description: "Adicional oficial de exploração, cobrado por participante.",
    category: "fees", cost: "5 táleres", unit: "person", source: CORE_LICENSE,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("explorer-license-wagon", "Adicional da Licença — carroça", {
    description: "Adicional oficial cobrado para cada carroça da expedição.",
    category: "fees", cost: "5 táleres", unit: "wagon", source: CORE_LICENSE,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("explorer-license-incompetence", "Adicional da Licença — inexperiência", {
    description: "Adicional imposto conforme a inexperiência percebida no grupo.",
    category: "fees", cost: "5-15 táleres", source: CORE_LICENSE,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("explorer-license-intentions", "Adicional da Licença — intenções", {
    description: "Adicional imposto conforme os objetivos e as intenções declaradas pela expedição.",
    category: "fees", cost: "5-50 táleres", source: CORE_LICENSE,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("explorer-license-other", "Adicional da Licença — outros encargos", {
    description: "Outros encargos previstos na avaliação da licença.",
    category: "fees", cost: "1-50 táleres", source: CORE_LICENSE,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-hold-trade-tax", "Taxa comercial de entrada em Forte do Cardo", {
    description: "Quem entra em Forte do Cardo para negociar deve declarar os bens e pagar 10% do valor de mercado, além do pedágio por pernas e rodas.",
    category: "fees", cost: "10% do valor de mercado", fulfillment: "instant",
    priceMode: "negotiated",
    pricingNote: "O Mestre calcula 10% do valor de mercado dos bens declarados e informa o total. Esta taxa é separada do pedágio por pernas e rodas.",
    source: "Livro Básico — Forte do Cardo: Ganhando Acesso ao Forte",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),

  service("thistle-exclusive-lodging", "Hospedagem exclusiva em Forte do Cardo", {
    description: "Quarto exclusivo por noite em Forte do Cardo.",
    category: "hospitality", cost: "1 táler", unit: "night", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-good-lodging", "Boa hospedagem em Forte do Cardo", {
    description: "Boa hospedagem: 2 xelins por noite, 1 táler por semana ou 4 táleres por mês.",
    category: "hospitality", cost: "2 xelins", unit: "night", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-good-lodging-week", "Boa hospedagem em Forte do Cardo — semanal", {
    description: "Uma semana de boa hospedagem em Forte do Cardo.",
    category: "hospitality", cost: "1 táler", unit: "week", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-good-lodging-month", "Boa hospedagem em Forte do Cardo — mensal", {
    description: "Um mês de boa hospedagem em Forte do Cardo.",
    category: "hospitality", cost: "4 táleres", unit: "month", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-common-lodging", "Hospedagem comum em Forte do Cardo", {
    description: "Hospedagem comum: 1 xelim por noite, 5 xelins por semana ou 2 táleres por mês.",
    category: "hospitality", cost: "1 xelim", unit: "night", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-common-lodging-week", "Hospedagem comum em Forte do Cardo — semanal", {
    description: "Uma semana de hospedagem comum em Forte do Cardo.",
    category: "hospitality", cost: "5 xelins", unit: "week", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-common-lodging-month", "Hospedagem comum em Forte do Cardo — mensal", {
    description: "Um mês de hospedagem comum em Forte do Cardo.",
    category: "hospitality", cost: "2 táleres", unit: "month", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-simple-lodging", "Hospedagem simples em Forte do Cardo", {
    description: "Hospedagem simples: 5 ortegas por noite, 2 xelins por semana ou 1 táler por mês.",
    category: "hospitality", cost: "5 ortegas", unit: "night", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-simple-lodging-week", "Hospedagem simples em Forte do Cardo — semanal", {
    description: "Uma semana de hospedagem simples em Forte do Cardo.",
    category: "hospitality", cost: "2 xelins", unit: "week", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-simple-lodging-month", "Hospedagem simples em Forte do Cardo — mensal", {
    description: "Um mês de hospedagem simples em Forte do Cardo.",
    category: "hospitality", cost: "1 táler", unit: "month", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-rent-pleasant", "Aluguel agradável na Praça Antiga", {
    description: "Aluguel de três cômodos: 2 táleres por semana ou 10 táleres por mês.",
    category: "hospitality", cost: "10 táleres", unit: "month", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-rent-pleasant-week", "Aluguel agradável na Praça Antiga — semanal", {
    description: "Uma semana de aluguel de três aposentos na Praça Antiga.",
    category: "hospitality", cost: "2 táleres", unit: "week", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-rent-common", "Aluguel comum no Portão Oeste", {
    description: "Aluguel comum: 1 táler por semana ou 4 táleres por mês.",
    category: "hospitality", cost: "4 táleres", unit: "month", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-rent-common-week", "Aluguel comum no Portão Oeste — semanal", {
    description: "Uma semana de aluguel comum de três aposentos no Portão Oeste.",
    category: "hospitality", cost: "1 táler", unit: "week", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-rent-simple", "Aluguel simples próximo à Praça do Sapo", {
    description: "Aluguel simples de um cômodo: 5 xelins por semana ou 2 táleres por mês.",
    category: "hospitality", cost: "2 táleres", unit: "month", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("thistle-rent-simple-week", "Aluguel simples próximo à Praça do Sapo — semanal", {
    description: "Uma semana de aluguel simples de um aposento a leste da Praça do Sapo.",
    category: "hospitality", cost: "5 xelins", unit: "week", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: WARDEN_PRICES,
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("abomitorium-ticket", "Ingresso antecipado para o Abomitorium", {
    description: "Ingresso antecipado; o valor depende do assento escolhido.",
    category: "other", cost: "3-10 táleres", unit: "person", fulfillment: "consumable",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — Abomitorium"
  }),
  service("artifact-authentication", "Certificado de autenticidade — artefato", {
    description: "Certificado de autenticidade emitido pelo Tesouro para um artefato.",
    category: "professionals", cost: "25 táleres", fulfillment: "consumable",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — O Tesouro"
  }),
  service("curiosity-authentication", "Certificado de autenticidade — curiosidade", {
    description: "Certificado de autenticidade emitido pelo Tesouro para uma curiosidade ou obra.",
    category: "professionals", cost: "5 táleres", fulfillment: "consumable",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — O Tesouro"
  }),
  service("treasury-sale-commission", "Comissão de venda do Tesouro", {
    description: "O Tesouro intermedeia a venda de um achado e retém uma comissão que pode chegar a 25% do valor da venda.",
    category: "fees", cost: "Até 25% do valor da venda", fulfillment: "instant",
    priceMode: "negotiated",
    pricingNote: "O Mestre calcula a comissão sobre o valor efetivo da venda e informa o total acordado em moeda. Esta oferta registra somente a taxa; ela não executa a venda do tesouro.",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — O Tesouro",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("ordo-analysis", "Tradução, análise ou iluminação da Ordo Magica", {
    description: "Tradução, análise de artefato ou ritual de iluminação; o preço varia de 5 xelins a 5 táleres conforme o tempo exigido.",
    category: "professionals", cost: "5-50 xelins", fulfillment: "consumable",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — Ordo Magica"
  }),
  service("ordo-archive-access", "Acesso ao arquivo da Ordo Magica", {
    description: "Acesso a uma sessão de consulta nos arquivos da Ordo Magica, em Forte do Cardo.",
    category: "information", cost: "1 táler", unit: "session", fulfillment: "consumable",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — Ordo Magica"
  }),
  service("ordo-master-audience", "Audiência com um Mestre da Ordo Magica", {
    description: "Audiência sem contato prévio ou informação de importância suficiente.",
    category: "information", cost: "10 táleres", fulfillment: "consumable",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — Ordo Magica"
  }),
  service("queen-legation-archive", "Pesquisa no arquivo da Legação da Rainha", {
    description: "Busca nos arquivos da Legação; um testemunho valioso pode ser aceito em lugar do pagamento.",
    category: "information", cost: "1 táler", unit: "hour", fulfillment: "temporary",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — Legação da Rainha"
  }),
  service("queen-legation-archive-testimony", "Acesso à Legação em troca de testemunho", {
    description: "Alternativa ao pagamento pelo arquivo da Legação da Rainha: um testemunho considerado valioso pode ser aceito como contrapartida.",
    category: "information", cost: "Testemunho valioso", unit: "hour", fulfillment: "temporary",
    priceMode: "negotiated",
    pricingNote: "Somente o Mestre confirma que o testemunho é suficiente. Informe 0 em moedas para registrar a contrapartida narrativa.",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — Legação da Rainha"
  }),
  service("agdala-divination", "Adivinhação de Agdala", {
    description: "Agdala oferece uma leitura do futuro em troca de favores, comida, afeto ou uma quantia negociada em xelins.",
    category: "information", cost: "Favores, comida, afeto ou xelins", fulfillment: "consumable",
    priceMode: "negotiated",
    pricingNote: "Somente o Mestre confirma a contrapartida. Informe 0 em moedas para registrar uma permuta ou favor já acordado.",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — Agdala"
  }),
  service("dodramos-oracle", "Oráculo de Dodramos", {
    description: "Dodramos responde como oráculo em troca de favores, comida, afeto ou uma quantia negociada em xelins.",
    category: "information", cost: "Favores, comida, afeto ou xelins", fulfillment: "consumable",
    priceMode: "negotiated",
    pricingNote: "Somente o Mestre confirma a contrapartida. Informe 0 em moedas para registrar uma permuta ou favor já acordado.",
    origin: "wrath-of-the-warden", source: "A Fúria do Guardião — Dodramos"
  }),

  service("karvosti-pilgrim-camp", "Campo dos peregrinos em Karvosti", {
    description: "Espaço de acampamento: 3 ortegas por noite, 1 xelim por semana ou 4 xelins por mês.",
    category: "hospitality", cost: "3 ortegas", unit: "night", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-pilgrim-camp-week", "Campo dos peregrinos em Karvosti — semanal", {
    description: "Uma semana de espaço de acampamento no campo dos peregrinos.",
    category: "hospitality", cost: "1 xelim", unit: "week", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-pilgrim-camp-month", "Campo dos peregrinos em Karvosti — mensal", {
    description: "Um mês de espaço de acampamento no campo dos peregrinos.",
    category: "hospitality", cost: "4 xelins", unit: "month", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-market-space", "Espaço no mercado de Karvosti", {
    description: "Espaço para tenda ou caravana: 5 ortegas por noite, 2 xelins por semana ou 8 xelins por mês.",
    category: "hospitality", cost: "5 ortegas", unit: "night", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-market-space-week", "Espaço no mercado de Karvosti — semanal", {
    description: "Uma semana de espaço para tenda ou caravana no mercado de Karvosti.",
    category: "hospitality", cost: "2 xelins", unit: "week", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-market-space-month", "Espaço no mercado de Karvosti — mensal", {
    description: "Um mês de espaço para tenda ou caravana no mercado de Karvosti.",
    category: "hospitality", cost: "8 xelins", unit: "month", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-victorious-hawk", "Hospedagem no Falcão Vitorioso", {
    description: "Dormitório ou quarto para dois: 1 táler por noite, 5 por semana ou 15 por mês.",
    category: "hospitality", cost: "1 táler", unit: "night", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-victorious-hawk-week", "Hospedagem no Falcão Vitorioso — semanal", {
    description: "Uma semana em dormitório ou quarto para duas pessoas no Falcão Vitorioso.",
    category: "hospitality", cost: "5 táleres", unit: "week", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-victorious-hawk-month", "Hospedagem no Falcão Vitorioso — mensal", {
    description: "Um mês em dormitório ou quarto para duas pessoas no Falcão Vitorioso.",
    category: "hospitality", cost: "15 táleres", unit: "month", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-fortress-room", "Quarto na Fortaleza de Karvosti", {
    description: "Quarto para duas ou quatro pessoas; o preço varia conforme as acomodações.",
    category: "hospitality", cost: "2-9 xelins", unit: "night", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-fortress-room-week", "Quarto na Fortaleza de Karvosti — semanal", {
    description: "Uma semana em quarto para duas ou quatro pessoas; o preço varia conforme as acomodações.",
    category: "hospitality", cost: "1-6 táleres", unit: "week", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-fortress-room-month", "Quarto na Fortaleza de Karvosti — mensal", {
    description: "Um mês em quarto para duas ou quatro pessoas; o preço varia conforme as acomodações.",
    category: "hospitality", cost: "4-15 táleres", unit: "month", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-cave-lodging", "Hospedagem na Caverna de Karvosti", {
    description: "Pele no chão, vigília e duas tigelas de mingau por dia.",
    category: "hospitality", cost: "1 xelim", unit: "night", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-braddokkugru", "Lugar em cabana Braddokkugru", {
    description: "Lugar em uma cabana. Comida, arma ou objeto brilhante também podem ser aceitos em troca.",
    category: "hospitality", cost: "2-5 ortegas", unit: "night", fulfillment: "temporary",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-braddokkugru-barter", "Lugar em cabana Braddokkugru — troca", {
    description: "Hospedagem em cabana Braddokkugru paga com comida, uma arma ou um objeto brilhante, em vez de ortegas.",
    category: "hospitality", cost: "Comida, arma ou objeto brilhante", unit: "night", fulfillment: "temporary",
    priceMode: "negotiated",
    pricingNote: "Somente o Mestre confirma a troca. Informe 0 em moedas para registrar a contrapartida aceita.",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Tabela 1",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-baiaga-communal-meal", "Refeição comunitária Baiaga", {
    description: "Participação em uma refeição comunitária Baiaga. O preço oficial é 3 xelins, mas uma troca equivalente também pode ser aceita.",
    category: "hospitality", cost: "3 xelins", unit: "person", fulfillment: "consumable",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Baiaga",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-baiaga-communal-barter", "Refeição comunitária Baiaga — troca", {
    description: "Participação na refeição comunitária Baiaga mediante uma troca equivalente, em vez dos 3 xelins usuais.",
    category: "hospitality", cost: "Troca equivalente", unit: "person", fulfillment: "consumable",
    priceMode: "negotiated",
    pricingNote: "Somente o Mestre confirma a equivalência da troca. Informe 0 em moedas para registrar a permuta acordada.",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Baiaga",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("karvosti-edrafin-information", "Informação de Edrafin", {
    description: "Informação vendida por Edrafin por 10 táleres; um Teste bem-sucedido de Persuasivo com modificador –1 reduz o preço à metade. Um favor também pode ser aceito.",
    category: "information", cost: "5-10 táleres", fulfillment: "consumable",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti"
  }),
  service("karvosti-edrafin-favor", "Informação de Edrafin — favor", {
    description: "Informação de Edrafin obtida em troca de um favor acordado, como alternativa ao pagamento em táleres.",
    category: "information", cost: "Favor", fulfillment: "consumable",
    priceMode: "negotiated",
    pricingNote: "Somente o Mestre confirma o favor exigido. Informe 0 em moedas para registrar o acordo narrativo.",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti"
  }),
  service("karvosti-jorlamar-forge", "Forja ou reparo de Jorlamar", {
    description: "Jorlamar forja ou repara equipamento pelo preço normal do trabalho ou item, acrescido de 20%.",
    category: "professionals", cost: "Preço normal +20%", fulfillment: "consumable",
    priceMode: "negotiated",
    pricingNote: "O Mestre determina o preço normal do trabalho ou item, aplica o acréscimo oficial de 20% e informa aqui o total final.",
    origin: "adventure-locations", source: "O Martelo da Bruxa — Karvosti, Jorlamar"
  }),

  service("salindra-prospecting-claim", "Direito de prospecção em Esperança de Salindra", {
    description: "Direito de prospecção; um Teste bem-sucedido de Persuasivo com modificador –5 reduz o preço a 7 táleres.",
    category: "permits", cost: "7-10 táleres", fulfillment: "permanent",
    origin: "adventure-pack-2", source: "Pacote de Aventuras 2 — A Febre da Caçada"
  }),
  service("spear-shaft-replacement", "Substituição de cabo de lança", {
    description: "Um artesão substitui ou refaz o cabo da lança; o trabalho leva um dia.",
    category: "professionals", cost: "1 táler", unit: "day", fulfillment: "temporary",
    origin: "adventure-pack-2", source: "Pacote de Aventuras 2 — A Febre da Caçada"
  }),
  service("local-courier", "Mensageiro local", {
    description: "Entrega curta por mensageiro; o texto oficial usa uma gorjeta entre 1 ortega e 1 xelim.",
    category: "contracts", cost: "1-10 ortegas", fulfillment: "consumable",
    origin: "adventure-collection-1", source: "Conjunto de Aventuras 1 — A Coroa de Cobre"
  }),
  service("prios-pass-ferry-person", "Balsa do Passo de Prios — pessoa", {
    description: "Travessia do rio Veloma por pessoa.",
    category: "travel", cost: "1 xelim", unit: "person", fulfillment: "consumable",
    origin: "adventure-collection-1", source: "Coletânea de Aventuras — Passo de Prios"
  }),
  service("prios-pass-ferry-horse", "Balsa do Passo de Prios — cavalo", {
    description: "Travessia do rio Veloma para um cavalo ou criatura de porte semelhante.",
    category: "travel", cost: "2 xelins", unit: "creature", fulfillment: "consumable",
    origin: "adventure-collection-1", source: "Coletânea de Aventuras — Passo de Prios"
  }),
  service("prios-pass-ferry-wagon", "Balsa do Passo de Prios — carroça ou vagão", {
    description: "Travessia do rio Veloma para uma carroça ou vagão.",
    category: "travel", cost: "4 xelins", unit: "wagon", fulfillment: "consumable",
    origin: "adventure-collection-1", source: "Coletânea de Aventuras — Passo de Prios"
  }),
  service("ravenia-ferry-creature", "Balsa de Ravenia — criatura", {
    description: "Travessia por pessoa ou animal.",
    category: "travel", cost: "1 ortega", unit: "creature", fulfillment: "consumable",
    origin: "adventure-collection-1", source: "Coletânea de Aventuras — Ravenia"
  }),
  service("ravenia-ferry-wagon", "Balsa de Ravenia — carroça ou vagão", {
    description: "Adicional para uma carroça ou vagão de qualquer tamanho.",
    category: "travel", cost: "1 xelim", unit: "wagon", fulfillment: "consumable",
    origin: "adventure-collection-1", source: "Coletânea de Aventuras — Ravenia"
  }),
  service("barbarity-inn", "Hospedagem na Estalagem Barbaridade", {
    description: "Dormitório ou quarto para quatro, com mingau no café da manhã. O preço é cobrado por pessoa e por noite.",
    category: "hospitality", cost: "2 xelins", unit: "night", fulfillment: "temporary",
    origin: "adventure-collection-1", source: "Coletânea de Aventuras — Ravenia",
    itemCategories: EXPENSE_ITEM_CATEGORIES
  }),
  service("toreo-ritual", "Ritual do mestre Toreo", {
    description: "Execução de Convocação ou Trilha do Herege pelo mestre Toreo.",
    category: "professionals", cost: "12 táleres", fulfillment: "consumable",
    origin: "adventure-collection-1", source: "Coletânea de Aventuras — Passo de Prios"
  }),
  service("heroic-story-song", "História ou canção heroica", {
    description: "Uma apresentação profissional que concede +1 de Reputação, no máximo uma vez por este meio. Personagens com a dádiva Músico ou Narrador podem produzir o efeito gratuitamente.",
    category: "professionals", cost: "10 táleres", fulfillment: "consumable",
    origin: "advanced-players-guide", source: "Guia Avançado do Jogador — Reputação, Tabela 11"
  })
]);
