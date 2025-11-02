import { Card } from "../../../interfaces"
import Set from "../Prismatic Evolutions"

const card: Card = {
	dexId: [247],
	set: Set,

	name: {
		en: "Pupitar",
		fr: "Ymphect",
		es: "Pupitar",
		pt: "Pupitar",
		it: "Pupitar",
		de: "Pupitar"
	},

	rarity: "Common",
	category: "Pokemon",
	hp: 90,
	types: ["Fighting"],
	stage: "Stage1",

	attacks: [{
		cost: ["Colorless"],

		name: {
			en: "Sand Spray",
			fr: "Jet Sableux",
			es: "Rociado de Arena",
			pt: "Spray de Areia",
			it: "Silicospruzzo",
			de: "Sandspray"
		},

		damage: 20
	}, {
		cost: ["Colorless", "Colorless", "Colorless"],

		name: {
			en: "Hammer In",
			fr: "Enfoncement",
			es: "Martillear",
			pt: "Martelada",
			it: "Martello",
			de: "Einhämmern"
		},

		damage: 60
	}],

	retreat: 1,
	regulationMark: "H",
	illustrator: "Shigenori Negishi",

	thirdParty: {
		cardmarket: 805437,
		tcgplayer: {
			normal: 610403,
			masterball: 610671,
			pokeball: 610570
		}
	}
}

export default card