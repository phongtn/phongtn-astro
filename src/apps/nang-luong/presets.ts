import { num } from "./format";
import { G, KCAL, type Person, type Vehicle, climbPower, cruisePower, fromKmh } from "./physics";

export interface VehiclePreset {
	id: string;
	label: string;
	vehicle: Vehicle;
	/** km/h */
	speed: number;
	maxSpeed: number;
	/** Where its kinetic energy came from before the brakes threw it away. */
	source: "food" | "petrol";
	/** Share of that chemical energy that became motion. */
	efficiency: number;
	brakeLabel: string;
}

const BIKE_MASS = 13;

export const VEHICLES: VehiclePreset[] = [
	{
		id: "xe-dap",
		label: "Xe đạp",
		vehicle: {
			mass: BIKE_MASS + 62,
			dragArea: 0.5,
			rollingCoef: 0.006,
			brakeMass: 0.5,
			brakeSpecificHeat: 900,
		},
		speed: 20,
		maxSpeed: 40,
		source: "food",
		efficiency: 0.25,
		brakeLabel: "vành nhôm",
	},
	{
		id: "xe-may",
		label: "Xe máy",
		vehicle: {
			mass: 105 + 65,
			dragArea: 0.6,
			rollingCoef: 0.015,
			brakeMass: 2,
			brakeSpecificHeat: 460,
		},
		speed: 40,
		maxSpeed: 90,
		source: "petrol",
		efficiency: 0.2,
		brakeLabel: "đĩa và tang trống thép",
	},
	{
		id: "o-to",
		label: "Ô tô",
		vehicle: {
			mass: 1400,
			dragArea: 0.65,
			rollingCoef: 0.012,
			brakeMass: 30,
			brakeSpecificHeat: 460,
		},
		speed: 60,
		maxSpeed: 120,
		source: "petrol",
		efficiency: 0.25,
		brakeLabel: "4 đĩa gang",
	},
];

export const ROADS = [
	{ id: "kho", label: "Nhựa khô", grip: 0.8 },
	{ id: "uot", label: "Nhựa ướt", grip: 0.5 },
	{ id: "soi", label: "Sỏi, cát", grip: 0.35 },
];

export interface Activity {
	id: string;
	label: string;
	detail: string;
	/** Where `work` joules of this activity end up. */
	becomes: (work: number, person: Person) => string;
	/** Mechanical power for this person, W. */
	power: (person: Person) => number;
}

/** m */
export const FLOOR_HEIGHT = 3;

const CYCLING_WORK =
	"đẩy xe thắng lực cản lăn và lực cản gió, nên cuối cùng cũng thành nhiệt trong lốp và không khí";

const bikeFor = (person: Person): Vehicle => ({
	...(VEHICLES[0] as VehiclePreset).vehicle,
	mass: person.mass + BIKE_MASS,
});

export const ACTIVITIES: Activity[] = [
	{
		id: "nghi",
		label: "Ngồi nghỉ",
		detail: "Chỉ duy trì sự sống: tim đập, thở, giữ thân nhiệt 37 °C.",
		becomes: () => "",
		power: () => 0,
	},
	{
		id: "dap-15",
		label: "Đạp xe 15 km/h",
		detail: "Đường bằng, lặng gió, xe đạp phổ thông 13 kg.",
		becomes: () => CYCLING_WORK,
		power: (p) => cruisePower(bikeFor(p), fromKmh(15)),
	},
	{
		id: "dap-25",
		label: "Đạp xe 25 km/h",
		detail: "Đường bằng, lặng gió. Lực cản gió tăng theo v², công suất theo v³.",
		becomes: () => CYCLING_WORK,
		power: (p) => cruisePower(bikeFor(p), fromKmh(25)),
	},
	{
		id: "cau-thang",
		label: "Leo cầu thang",
		detail: "1 tầng (3 m) mỗi 15 giây, tức nâng cơ thể lên 0,2 m mỗi giây.",
		becomes: (work, p) => {
			const height = work / (p.mass * G);
			return `nâng bạn lên ${num(height)} m, khoảng ${num(height / FLOOR_HEIGHT)} tầng: nó được cất lại dưới dạng thế năng`;
		},
		power: (p) => climbPower(p.mass, FLOOR_HEIGHT / 15),
	},
];

/** Typical servings; real portions vary by ±20%. */
export const FOODS = [
	{ id: "chuoi", label: "1 quả chuối", energy: 105 * KCAL },
	{ id: "com", label: "1 bát cơm trắng", energy: 200 * KCAL },
	{ id: "tra-sua", label: "1 cốc trà sữa trân châu", energy: 350 * KCAL },
	{ id: "banh-mi", label: "1 ổ bánh mì thịt", energy: 400 * KCAL },
	{ id: "pho", label: "1 bát phở bò", energy: 450 * KCAL },
];

export const DEFAULT_PERSON: Person = { mass: 65, height: 168, age: 30, sex: "male" };
