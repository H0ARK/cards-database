import { Card } from "../../../interfaces"
import Set from "../Prismatic Evolutions"

const card: Card = {
	dexId: [449],
	set: Set,

	name: {
		en: "Hippopotas",
		fr: "Hippopotas",
		es: "Hippopotas",
		pt: "Hippopotas",
		it: "Hippopotas",
		de: "Hippopotas"
	},

	rarity: "Common",
	category: "Pokemon",
	hp: 90,
	types: ["Fighting"],
	stage: "Basic",

	attacks: [{
		cost: ["Colorless", "Colorless", "Colorless"],

		name: {
			en: "Tackle",
			fr: "Charge",
			es: "Placaje",
			pt: "Investida",
			it: "Azione",
			de: "Tackle"
		},

		damage: 70
	}],

	retreat: 3,
	regulationMark: "H",
	illustrator: "HYOGONOSUKE",

	thirdParty: {
		cardmarket: 805441,
		tcgplayer: {
			normal: 610407,
			masterball: 610674,
			pokeball: 610573
		}
	}
}

export default card