// Pure energy model behind /nang-luong. No DOM, no state: every function maps inputs to outputs.
// Units are SI throughout (kg, m, s, N, J, W, K); convert to km/h, kcal, °C only at the UI edge.

export const G = 9.81;
/** Air density at ~25 °C, kg/m³. */
export const AIR_DENSITY = 1.18;
export const KCAL = 4184;
/** Petrol, lower heating value, J per litre. */
export const PETROL_ENERGY = 34.2e6;
/** Heat that evaporates 1 kg of sweat at skin temperature, J/kg. */
export const SWEAT_LATENT_HEAT = 2.43e6;
/** Average specific heat of the human body, J/(kg·K). */
export const BODY_SPECIFIC_HEAT = 3470;
/** Sliding (locked wheel) friction relative to peak grip. */
export const SLIDING_RATIO = 0.75;

export const fromKmh = (kmh: number) => kmh / 3.6;
export const toKmh = (speed: number) => speed * 3.6;
export const kineticEnergy = (mass: number, speed: number) => 0.5 * mass * speed * speed;

/* ---------- Braking: kinetic energy → heat ---------- */

export interface Vehicle {
	/** Vehicle plus rider, kg. */
	mass: number;
	/** Drag coefficient × frontal area (C_d·A), m². */
	dragArea: number;
	/** Rolling resistance coefficient C_rr. */
	rollingCoef: number;
	/** Brake metal (discs, drums or rims) that soaks up the heat of one stop, kg. */
	brakeMass: number;
	/** Specific heat of that metal, J/(kg·K). */
	brakeSpecificHeat: number;
}

export interface BrakeSetup {
	vehicle: Vehicle;
	/** Speed when braking starts, m/s. */
	speed: number;
	/** Peak tire–road friction coefficient μ. */
	grip: number;
	/** Brake force as a fraction of the grip limit μ·m·g, 0..1. */
	brake: number;
	/** Wheels locked (no ABS): the tires slide on the road instead of the pads rubbing the discs. */
	locked: boolean;
}

export interface BrakeForces {
	/** Pads on discs/rims, N. Zero when the wheels are locked. */
	brake: number;
	/** Sliding tires on the road, N. Only when locked. */
	slide: number;
	/** Rolling resistance, N. A sliding tire does not roll. */
	rolling: number;
	/** The speed-independent part F₀ = brake + slide + rolling, N. */
	constant: number;
	/** Air drag is k·v², with k = ½·ρ·C_d·A, kg/m. */
	dragK: number;
}

export function brakeForces({ vehicle, grip, brake, locked }: BrakeSetup): BrakeForces {
	const weight = vehicle.mass * G;
	const pads = locked ? 0 : clamp(brake, 0, 1) * grip * weight;
	const slide = locked ? SLIDING_RATIO * grip * weight : 0;
	const rolling = locked ? 0 : vehicle.rollingCoef * weight;
	return {
		brake: pads,
		slide,
		rolling,
		constant: pads + slide + rolling,
		dragK: 0.5 * AIR_DENSITY * vehicle.dragArea,
	};
}

export interface BrakeState {
	t: number;
	/** Distance since braking started, m. */
	x: number;
	v: number;
	kinetic: number;
	/** Work each force has done so far, J. Friction turns all of it into heat. */
	heatBrake: number;
	heatAir: number;
	/** Rolling resistance or sliding: heat in the tires and the road surface. */
	heatTires: number;
	/** Rate of that work right now (P = F·v), W. */
	powerBrake: number;
	powerAir: number;
	powerTires: number;
}

/**
 * Newton's second law while braking: m·dv/dt = −(F₀ + k·v²).
 * With θ₀ = atan(v₀·√(k/F₀)) and ω = √(F₀·k)/m it solves exactly to
 *   v(t) = √(F₀/k)·tan(θ₀ − ω·t),  x(t) = (m/k)·ln(cos(θ₀ − ω·t) / cos θ₀),  stop at t = θ₀/ω.
 * Without drag (k = 0) it is plain constant deceleration a = F₀/m.
 */
export function stopTime(setup: BrakeSetup): number {
	const { constant: f0, dragK: k } = brakeForces(setup);
	const m = setup.vehicle.mass;
	const v0 = setup.speed;
	if (k <= 0) return (m * v0) / f0;
	return Math.atan(v0 * Math.sqrt(k / f0)) / (Math.sqrt(f0 * k) / m);
}

export function brakeStateAt(setup: BrakeSetup, time: number): BrakeState {
	const forces = brakeForces(setup);
	const { constant: f0, dragK: k } = forces;
	const m = setup.vehicle.mass;
	const v0 = setup.speed;
	const t = clamp(time, 0, stopTime(setup));

	let v: number;
	let x: number;
	let heatAir: number;
	if (k <= 0) {
		const a = f0 / m;
		v = Math.max(0, v0 - a * t);
		x = v0 * t - 0.5 * a * t * t;
		heatAir = 0;
	} else {
		const omega = Math.sqrt(f0 * k) / m;
		const theta0 = Math.atan(v0 * Math.sqrt(k / f0));
		const theta = Math.max(0, theta0 - omega * t);
		v = Math.sqrt(f0 / k) * Math.tan(theta);
		x = (m / k) * Math.log(Math.cos(theta) / Math.cos(theta0));
		// Drag work ∫k·v² dx, using k·v(x)² = (F₀ + k·v₀²)·e^(−2kx/m) − F₀ (from m·v·dv/dx = −F₀ − k·v²).
		heatAir = ((f0 + k * v0 * v0) * m * -Math.expm1((-2 * k * x) / m)) / (2 * k) - f0 * x;
	}

	return {
		t,
		x,
		v,
		kinetic: kineticEnergy(m, v),
		heatBrake: forces.brake * x,
		heatAir,
		heatTires: (forces.slide + forces.rolling) * x,
		powerBrake: forces.brake * v,
		powerAir: k * v * v * v,
		powerTires: (forces.slide + forces.rolling) * v,
	};
}

export interface BrakeSummary {
	forces: BrakeForces;
	/** Kinetic energy when braking starts, J. Equals the total heat at the stop. */
	energy: number;
	time: number;
	distance: number;
	end: BrakeState;
	/** Average power over the stop, W. */
	averagePower: number;
	/** Power at the first instant, the highest of the stop, W. */
	peakPower: number;
	/** How much the brake metal warms up, assuming the stop is too short for it to cool, K. */
	brakeTempRise: number;
}

export function brakeSummary(setup: BrakeSetup): BrakeSummary {
	const time = stopTime(setup);
	const start = brakeStateAt(setup, 0);
	const end = brakeStateAt(setup, time);
	const { brakeMass, brakeSpecificHeat } = setup.vehicle;
	return {
		forces: brakeForces(setup),
		energy: start.kinetic,
		time,
		distance: end.x,
		end,
		averagePower: time > 0 ? start.kinetic / time : 0,
		peakPower: start.powerBrake + start.powerAir + start.powerTires,
		brakeTempRise: end.heatBrake / (brakeMass * brakeSpecificHeat),
	};
}

/** Chemical energy (food or fuel) burned to give a body this kinetic energy at a given efficiency, J. */
export const chemicalCost = (kinetic: number, efficiency: number) => kinetic / efficiency;

/** Power to hold a steady speed on the flat, against rolling resistance and air drag: P = F·v, W. */
export function cruisePower(vehicle: Vehicle, speed: number): number {
	const force =
		vehicle.rollingCoef * vehicle.mass * G + 0.5 * AIR_DENSITY * vehicle.dragArea * speed ** 2;
	return force * speed;
}

/* ---------- Human body: chemical energy → work + heat ---------- */

export interface Person {
	mass: number;
	/** cm */
	height: number;
	/** years */
	age: number;
	sex: "male" | "female";
}

/** Resting metabolic rate (Mifflin–St Jeor), W. It keeps us alive and all of it leaves as body heat. */
export function restingPower({ mass, height, age, sex }: Person): number {
	const kcalPerDay = 10 * mass + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
	return (kcalPerDay * KCAL) / 86_400;
}

/** Mechanical power to lift a body at a steady vertical speed (stairs): P = m·g·v, W. */
export const climbPower = (mass: number, verticalSpeed: number) => mass * G * verticalSpeed;

export interface Exercise {
	/** Mechanical power the muscles deliver, W. */
	power: number;
	/** Share of the extra (above resting) chemical energy that becomes work, ≈ 0.25. */
	efficiency: number;
	/** s */
	duration: number;
}

export interface BodyBudget {
	restPower: number;
	/** Extra chemical power the exercise burns on top of resting, W. */
	exercisePower: number;
	/** Total chemical power, resting + exercise, W. */
	metabolicPower: number;
	/** Mechanical power out, W. */
	workPower: number;
	/** Everything that is not work leaves as heat, W. */
	heatPower: number;
	/** Over the whole duration, J. chemical = work + heat. */
	chemical: number;
	work: number;
	heat: number;
	/** Sweat that must evaporate to shed the exercise heat (the resting heat leaves by radiation and convection), kg ≈ litres. */
	sweat: number;
	/** Body temperature rise if none of the heat could leave, K. */
	trappedTempRise: number;
}

export function bodyBudget(person: Person, exercise: Exercise): BodyBudget {
	const restPower = restingPower(person);
	const workPower = exercise.power;
	const exercisePower = workPower / exercise.efficiency;
	const metabolicPower = restPower + exercisePower;
	const heatPower = metabolicPower - workPower;
	const { duration } = exercise;
	return {
		restPower,
		exercisePower,
		metabolicPower,
		workPower,
		heatPower,
		chemical: metabolicPower * duration,
		work: workPower * duration,
		heat: heatPower * duration,
		sweat: ((exercisePower - workPower) * duration) / SWEAT_LATENT_HEAT,
		trappedTempRise: (heatPower * duration) / (person.mass * BODY_SPECIFIC_HEAT),
	};
}

/** How long a food's energy lasts at a given extra chemical power, s. */
export const foodDuration = (foodEnergy: number, exercisePower: number) =>
	exercisePower > 0 ? foodEnergy / exercisePower : Number.POSITIVE_INFINITY;

/** Height a food's energy could lift this body, if muscles turn `efficiency` of it into work, m. */
export const foodLiftHeight = (foodEnergy: number, mass: number, efficiency: number) =>
	(foodEnergy * efficiency) / (mass * G);

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
