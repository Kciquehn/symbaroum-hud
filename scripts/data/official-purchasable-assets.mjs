function asset(id, name, {
  description,
  cost,
  source,
  itemCategories,
  origin = "core-rulebook"
}) {
  return Object.freeze({
    id,
    name,
    img: "icons/svg/coins.svg",
    description,
    category: "assets",
    cost,
    unit: "purchase",
    fulfillment: "permanent",
    origin,
    source,
    official: true,
    offerKind: "asset",
    itemCategories: Object.freeze([...itemCategories])
  });
}

const FARM_ANIMAL_SOURCE = "Livro Básico — Tabela 16: Animais de Fazenda";
const TRANSPORT_SOURCE = "Livro Básico — Tabela 14: Transporte";
const CONSTRUCTION_SOURCE = "Livro Básico — Tabela 13: Construções";

/**
 * Official permanent purchases that should be recorded as owned assets rather
 * than ordinary carried Items in an Actor inventory.
 */
export const OFFICIAL_PURCHASABLE_ASSETS = Object.freeze([
  asset("farm-ox", "Boi", {
    description: "Boi de fazenda, também apropriado para tração e transporte de carga.",
    cost: "4 táleres",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals", "transport"]
  }),
  asset("farm-donkey", "Burro", {
    description: "Burro doméstico, utilizado como animal de fazenda e para transportar carga.",
    cost: "3 táleres",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals", "transport"]
  }),
  asset("farm-dog", "Cachorro", {
    description: "Cachorro doméstico adquirido como animal de fazenda ou companhia.",
    cost: "1 xelim",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals"]
  }),
  asset("farm-hen", "Galinha", {
    description: "Galinha doméstica criada como animal de fazenda.",
    cost: "8 ortegas",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals"]
  }),
  asset("farm-rooster", "Galo", {
    description: "Galo doméstico criado como animal de fazenda.",
    cost: "5 xelins",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals"]
  }),
  asset("farm-sheep", "Ovelha", {
    description: "Ovelha adquirida como animal de fazenda.",
    cost: "15 ortegas",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals"]
  }),
  asset("farm-pig", "Porco", {
    description: "Porco adquirido como animal de fazenda.",
    cost: "1 táler",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals"]
  }),
  asset("farm-bull", "Touro", {
    description: "Touro adquirido como animal de fazenda.",
    cost: "10 táleres",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals"]
  }),
  asset("farm-cow", "Vaca", {
    description: "Vaca adquirida como animal de fazenda.",
    cost: "1 táler",
    source: FARM_ANIMAL_SOURCE,
    itemCategories: ["farm-animals"]
  }),

  asset("transport-rowboat", "Barco a remo", {
    description: "Pequena embarcação movida a remos.",
    cost: "3 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport"]
  }),
  asset("transport-steamboat", "Barco a vapor", {
    description: "Embarcação a vapor adquirida como meio de transporte permanente.",
    cost: "200 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport"]
  }),
  asset("transport-canoe", "Canoa", {
    description: "Canoa leve para deslocamentos por rios e lagos.",
    cost: "2 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport"]
  }),
  asset("transport-cart", "Carroça", {
    description: "Carroça para transporte terrestre de pessoas, suprimentos ou mercadorias.",
    cost: "1 táler",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport"]
  }),
  asset("transport-light-riding-horse", "Cavalo de Montaria Leve", {
    description: "Cavalo leve treinado para montaria.",
    cost: "5 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport", "farm-animals"]
  }),
  asset("transport-heavy-riding-horse", "Cavalo de Montaria Pesado", {
    description: "Cavalo pesado treinado para montaria.",
    cost: "7 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport", "farm-animals"]
  }),
  asset("transport-ship", "Navio", {
    description: "Navio adquirido como embarcação permanente de transporte.",
    cost: "1000 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport"]
  }),
  asset("transport-mule", "Mula", {
    description: "Mula utilizada como animal de carga e transporte.",
    cost: "3 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport", "farm-animals"]
  }),
  asset("transport-sleigh", "Trenó", {
    description: "Trenó para transporte terrestre sobre neve ou gelo.",
    cost: "2 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport"]
  }),
  asset("transport-wagon", "Vagão", {
    description: "Vagão para transporte terrestre de pessoas, carga ou mercadorias.",
    cost: "5 táleres",
    source: TRANSPORT_SOURCE,
    itemCategories: ["transport"]
  }),

  asset("construction-walled-croft", "Campo murado", {
    description: "Pequeno terreno produtivo protegido por uma construção murada.",
    cost: "10 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("construction-farm", "Fazenda", {
    description: "Fazenda adquirida como propriedade permanente.",
    cost: "100 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("construction-wood-watchtower", "Torre de vigia de madeira", {
    description: "Torre de vigia construída em madeira.",
    cost: "100 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("construction-stone-watchtower", "Torre de vigia de pedra", {
    description: "Torre de vigia construída em pedra.",
    cost: "400 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("construction-wood-fort", "Forte de madeira", {
    description: "Forte construído predominantemente em madeira.",
    cost: "500 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("construction-estate", "Propriedade", {
    description: "Propriedade territorial permanente.",
    cost: "1000 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("construction-stone-fort", "Forte de pedra", {
    description: "Forte construído predominantemente em pedra.",
    cost: "2000 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("construction-stronghold", "Fortaleza", {
    description: "Grande fortificação adquirida como propriedade permanente.",
    cost: "5000 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("construction-castle", "Castelo", {
    description: "Castelo adquirido como propriedade permanente; o preço oficial é um valor mínimo.",
    cost: "10000 táleres",
    source: CONSTRUCTION_SOURCE,
    itemCategories: ["constructions"]
  }),
  asset("thistle-property-pleasant", "Imóvel agradável na Praça Antiga", {
    description: "Compra de um imóvel agradável de três cômodos na Praça Antiga, em Forte do Cardo.",
    cost: "500 táleres",
    origin: "wrath-of-the-warden",
    source: "A Fúria do Guardião — Forte do Cardo, Tabela 1",
    itemCategories: ["constructions"]
  }),
  asset("thistle-property-common", "Imóvel comum no Portão Oeste", {
    description: "Compra de um imóvel comum no Portão Oeste, em Forte do Cardo.",
    cost: "300 táleres",
    origin: "wrath-of-the-warden",
    source: "A Fúria do Guardião — Forte do Cardo, Tabela 1",
    itemCategories: ["constructions"]
  }),
  asset("thistle-property-simple", "Imóvel simples próximo à Praça do Sapo", {
    description: "Compra de um imóvel simples de um cômodo próximo à Praça do Sapo, em Forte do Cardo.",
    cost: "100 táleres",
    origin: "wrath-of-the-warden",
    source: "A Fúria do Guardião — Forte do Cardo, Tabela 1",
    itemCategories: ["constructions"]
  })
]);
