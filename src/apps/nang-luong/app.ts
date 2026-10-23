import { duration, energy, kcal, num, percent, power } from "./format";
import {
	type BrakeSetup,
	type BrakeSummary,
	PETROL_ENERGY,
	type Person,
	bodyBudget,
	brakeStateAt,
	brakeSummary,
	chemicalCost,
	foodDuration,
	foodLiftHeight,
	fromKmh,
	toKmh,
} from "./physics";
import { ACTIVITIES, DEFAULT_PERSON, FLOOR_HEIGHT, FOODS, ROADS, VEHICLES } from "./presets";
import { sankeySvg } from "./sankey";
import {
	type Palette,
	type Sample,
	drawPowerChart,
	drawScene,
	readPalette,
	sampleStop,
} from "./scene";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Builds one button per option; returns a function that marks the selected one. */
function segmented<T extends { id: string; label: string }>(
	container: HTMLElement,
	options: readonly T[],
	onPick: (option: T) => void,
) {
	const buttons = options.map((option) => {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = option.label;
		button.addEventListener("click", () => onPick(option));
		container.append(button);
		return button;
	});
	return (selected: T) =>
		buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(options[i] === selected)));
}

function stat(label: string, value: string, formula = "") {
	return `<div class="stat"><span>${label}</span><strong>${value}</strong>${formula ? `<small>${formula}</small>` : ""}</div>`;
}

let palette: Palette = readPalette(document.body);

/* ---------- Braking ---------- */

const brake = {
	preset: VEHICLES[1] ?? VEHICLES[0],
	road: ROADS[0],
	speed: 40,
	level: 0.8,
	locked: false,
	t: 0,
};
let setup: BrakeSetup;
let summary: BrakeSummary;
let samples: Sample[] = [];
let raf = 0;
let lastFrame = 0;

const sceneCanvas = $<HTMLCanvasElement>("scene");
const chartCanvas = $<HTMLCanvasElement>("power-chart");
const speedInput = $<HTMLInputElement>("speed");
const levelInput = $<HTMLInputElement>("brake");
const lockedInput = $<HTMLInputElement>("locked");
const timeInput = $<HTMLInputElement>("time");
const playButton = $<HTMLButtonElement>("play");

const markVehicle = segmented($("vehicle"), VEHICLES, (preset) => {
	brake.preset = preset;
	brake.speed = preset.speed;
	syncBrakeInputs();
	updateBrakeModel();
	play();
});
const markRoad = segmented($("road"), ROADS, (road) => {
	brake.road = road;
	syncBrakeInputs();
	updateBrakeModel();
	play();
});

function syncBrakeInputs() {
	const { preset, road } = brake;
	if (!preset || !road) return;
	markVehicle(preset);
	markRoad(road);
	speedInput.max = String(preset.maxSpeed);
	speedInput.value = String(brake.speed);
	levelInput.value = String(Math.round(brake.level * 100));
	levelInput.disabled = brake.locked;
	lockedInput.checked = brake.locked;
	$("speed-out").textContent = `${brake.speed} km/h`;
	$("brake-out").textContent = brake.locked ? "khóa bánh" : `${Math.round(brake.level * 100)}%`;
}

function updateBrakeModel() {
	const { preset, road } = brake;
	if (!preset || !road) return;
	setup = {
		vehicle: preset.vehicle,
		speed: fromKmh(brake.speed),
		grip: road.grip,
		brake: brake.level,
		locked: brake.locked,
	};
	summary = brakeSummary(setup);
	samples = sampleStop(setup, summary);
	const rate = playbackRate();
	$("slowmo").textContent =
		rate < 0.95
			? `Cú phanh chỉ kéo dài ${num(summary.time, 2)} giây, nên được phát chậm ${num(1 / rate, 1)} lần.`
			: "";
	renderOrigin();
}

/** Slow short stops down so the animation lasts at least three seconds. */
const playbackRate = () => Math.min(1, summary.time / 3);

function play() {
	cancelAnimationFrame(raf);
	if (reduceMotion.matches) {
		brake.t = summary.time;
		renderBrake();
		return;
	}
	brake.t = 0;
	lastFrame = performance.now();
	playButton.textContent = "Đang phanh…";
	raf = requestAnimationFrame(tick);
}

function tick(now: number) {
	const dt = Math.min(0.1, (now - lastFrame) / 1000);
	lastFrame = now;
	brake.t = Math.min(summary.time, brake.t + dt * playbackRate());
	renderBrake();
	if (brake.t < summary.time) raf = requestAnimationFrame(tick);
	else playButton.textContent = "▶ Phanh lại";
}

/** Jump to the end of the stop (while a slider is being dragged). */
function showEnd() {
	cancelAnimationFrame(raf);
	brake.t = summary.time;
	playButton.textContent = "▶ Phanh lại";
	renderBrake();
}

function renderBrake() {
	const { preset } = brake;
	if (!preset || $("panel-phanh").hidden) return;
	const state = brakeStateAt(setup, brake.t);
	const total = summary.energy;
	drawScene(sceneCanvas, { vehicleId: preset.id, setup, summary, state, palette });
	drawPowerChart(chartCanvas, samples, summary, state.t, setup.speed, palette);

	timeInput.value = String(summary.time > 0 ? Math.round((1000 * state.t) / summary.time) : 0);
	$("time-out").textContent = `t = ${num(state.t, 2)} s`;

	const parts = [
		["kinetic", "Động năng còn lại", state.kinetic],
		["brake", `Nhiệt ở phanh (${preset.brakeLabel})`, state.heatBrake],
		[
			"tires",
			brake.locked ? "Nhiệt ở lốp trượt và mặt đường" : "Nhiệt ở lốp (lực cản lăn)",
			state.heatTires,
		],
		["air", "Nhiệt vào không khí (lực cản gió)", state.heatAir],
	] as const;
	const bar = $("energy-bar");
	for (const [key, , value] of parts) {
		const seg = bar.querySelector<HTMLElement>(`.${key}`);
		if (seg) seg.style.width = `${total > 0 ? (100 * value) / total : 0}%`;
	}
	$("energy-legend").innerHTML = parts
		.map(
			([key, label, value]) =>
				`<li><i class="${key}"></i><span>${label}</span><strong>${energy(value)}</strong><em>${percent(value, total)}</em></li>`,
		)
		.join("");
	const sum = state.kinetic + state.heatBrake + state.heatTires + state.heatAir;
	const m = setup.vehicle.mass;
	$("energy-sum").innerHTML =
		`Tổng luôn bằng <strong>${energy(sum)}</strong>, đúng bằng động năng lúc bắt đầu phanh: ½·m·v₀² = ½ × ${num(m)} kg × (${num(setup.speed, 2)} m/s)². Không mất đi chút nào, chỉ đổi dạng.`;

	const { forces } = summary;
	const friction = brake.locked ? forces.slide : forces.brake;
	const frictionWork = friction * state.x;
	const instant = state.powerBrake + state.powerTires + state.powerAir;
	const rise = state.heatBrake / (setup.vehicle.brakeMass * setup.vehicle.brakeSpecificHeat);
	$("brake-stats").innerHTML = [
		stat("Tốc độ", `${num(toKmh(state.v), 1)} km/h`, `${num(state.v, 2)} m/s`),
		stat("Quãng đường đã đi", `${num(state.x, 2)} m`, `dừng sau ${num(summary.distance, 2)} m`),
		stat(
			brake.locked ? "Lực ma sát trượt" : "Lực phanh",
			`${num(friction)} N`,
			brake.locked ? "F = 0,75·μ·m·g" : `F = ${Math.round(brake.level * 100)}%·μ·m·g`,
		),
		stat(
			"Công của lực đó",
			energy(frictionWork),
			`A = F·s = ${num(friction)} N × ${num(state.x, 2)} m`,
		),
		stat("Công suất lúc này", power(instant), "P = F·v, giảm dần theo tốc độ"),
		stat(
			"Công suất trung bình",
			power(summary.averagePower),
			`P = A / t = ${energy(total)} / ${num(summary.time, 2)} s`,
		),
		stat(
			"Thời gian phanh",
			`${num(summary.time, 2)} s`,
			`a ≈ ${num(setup.speed / summary.time, 1)} m/s²`,
		),
		stat(
			"Phanh nóng thêm",
			`+${num(rise, rise < 10 ? 1 : 0)} °C`,
			`ΔT = Q / (m·c), ${num(setup.vehicle.brakeMass, 1)} kg ${preset.brakeLabel}`,
		),
	].join("");
}

function renderOrigin() {
	const { preset } = brake;
	if (!preset) return;
	const cost = chemicalCost(summary.energy, preset.efficiency);
	const eff = `${Math.round(preset.efficiency * 100)}%`;
	$("brake-origin").innerHTML =
		preset.source === "petrol"
			? `<strong>Động năng này từ đâu ra?</strong> Để lên ${brake.speed} km/h, ${preset.label.toLowerCase()} đã đốt khoảng <strong>${num((cost / PETROL_ENERGY) * 1000, 1)} mL xăng</strong> (${energy(cost)} hóa năng). Động cơ chỉ biến khoảng ${eff} thành động năng, phần còn lại thành nhiệt ngay trong máy. Mỗi lần phanh, nốt phần động năng ấy cũng thành nhiệt, nên đi đều ga và ít phanh gấp thì tiết kiệm xăng.`
			: `<strong>Động năng này từ đâu ra?</strong> Để lên ${brake.speed} km/h, người đạp đã đốt khoảng <strong>${kcal(cost)}</strong> hóa năng từ thức ăn: cơ bắp biến khoảng ${eff} thành động năng, phần còn lại làm người nóng lên. Mỗi lần phanh, động năng ấy thành nhiệt ở vành xe. (Chưa tính phần thắng gió và lực cản lăn khi tăng tốc.)`;
}

speedInput.addEventListener("input", () => {
	brake.speed = Number(speedInput.value);
	syncBrakeInputs();
	updateBrakeModel();
	showEnd();
});
levelInput.addEventListener("input", () => {
	brake.level = Number(levelInput.value) / 100;
	syncBrakeInputs();
	updateBrakeModel();
	showEnd();
});
for (const input of [speedInput, levelInput]) input.addEventListener("change", play);
lockedInput.addEventListener("change", () => {
	brake.locked = lockedInput.checked;
	syncBrakeInputs();
	updateBrakeModel();
	play();
});
timeInput.addEventListener("input", () => {
	cancelAnimationFrame(raf);
	brake.t = (Number(timeInput.value) / 1000) * summary.time;
	playButton.textContent = "▶ Phanh lại";
	renderBrake();
});
playButton.addEventListener("click", play);

/* ---------- Human body ---------- */

const body = {
	person: { ...DEFAULT_PERSON } as Person,
	activity: ACTIVITIES[2] ?? ACTIVITIES[0],
	minutes: 30,
	efficiency: 0.25,
	food: FOODS[4] ?? FOODS[0],
};

const minutesInput = $<HTMLInputElement>("minutes");
const efficiencyInput = $<HTMLInputElement>("efficiency");
const foodSelect = $<HTMLSelectElement>("food");
const sankey = $("sankey");

const markActivity = segmented($("activity"), ACTIVITIES, (activity) => {
	body.activity = activity;
	renderBody();
});

for (const food of FOODS)
	foodSelect.append(new Option(`${food.label} (≈ ${kcal(food.energy)})`, food.id));
foodSelect.value = body.food?.id ?? "";

function readPerson(): Person {
	const value = (id: string, min: number, max: number, fallback: number) => {
		const n = Number($<HTMLInputElement>(id).value);
		return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
	};
	return {
		mass: value("mass", 25, 200, DEFAULT_PERSON.mass),
		height: value("height", 100, 230, DEFAULT_PERSON.height),
		age: value("age", 10, 100, DEFAULT_PERSON.age),
		sex: $<HTMLSelectElement>("sex").value === "female" ? "female" : "male",
	};
}

function renderBody() {
	const { activity, food } = body;
	if (!activity || !food || $("panel-co-the").hidden) return;
	markActivity(activity);
	$("activity-detail").textContent = activity.detail;
	$("minutes-out").textContent = duration(body.minutes * 60);
	$("efficiency-out").textContent = `${Math.round(body.efficiency * 100)}%`;

	const { person } = body;
	const b = bodyBudget(person, {
		power: activity.power(person),
		efficiency: body.efficiency,
		duration: body.minutes * 60,
	});
	sankey.innerHTML = sankeySvg(Math.max(280, sankey.clientWidth), b, "Công cơ học");

	const span = duration(body.minutes * 60);
	$("body-sum").innerHTML =
		`Trong ${span}: hóa năng <strong>${kcal(b.chemical)}</strong> = công <strong>${kcal(b.work)}</strong> + nhiệt <strong>${kcal(b.heat)}</strong>. ${
			b.work > 0
				? `Công ấy (${energy(b.work)}) ${activity.becomes(b.work, person)}.`
				: "Không sinh công: toàn bộ hóa năng thành nhiệt giữ ấm cơ thể."
		}`;

	$("body-stats").innerHTML = [
		stat(
			"Công suất hóa năng",
			power(b.metabolicPower),
			`nghỉ ${power(b.restPower)} + vận động ${power(b.exercisePower)}`,
		),
		stat(
			"Công suất cơ học",
			power(b.workPower),
			b.workPower > 0 ? `P = η × ${power(b.exercisePower)}` : "không sinh công",
		),
		stat("Công suất tỏa nhiệt", power(b.heatPower), "P_nhiệt = P_hóa − P_cơ"),
		stat(
			"Hiệu suất toàn phần",
			percent(b.work, b.chemical, 0),
			"công / hóa năng, tính cả phần duy trì sống",
		),
		stat("Mồ hôi cần bay hơi", `${num(b.sweat, 2)} lít`, "để thải phần nhiệt do vận động sinh ra"),
		stat(
			"Nếu nhiệt không thoát ra",
			`+${num(b.trappedTempRise, 1)} °C`,
			`ΔT = Q / (m·c), sau ${span}`,
		),
	].join("");

	const lift = foodLiftHeight(food.energy, person.mass, body.efficiency);
	const lasts =
		b.workPower > 0
			? `đủ cho <strong>${duration(foodDuration(food.energy, b.exercisePower))} ${activity.label.toLowerCase()}</strong> (chỉ tính phần đốt thêm khi vận động)`
			: `đủ để cơ thể bạn duy trì sống <strong>${duration(foodDuration(food.energy, b.restPower))}</strong>`;
	$("food-out").innerHTML =
		`${food.label} chứa khoảng ${kcal(food.energy)} = ${energy(food.energy)} hóa năng, ${lasts}. ` +
		`Nếu dồn hết vào leo cầu thang với hiệu suất ${Math.round(body.efficiency * 100)}%, nó nâng ${num(person.mass)} kg của bạn lên được <strong>${num(lift)} m</strong>, khoảng ${num(lift / FLOOR_HEIGHT)} tầng nhà (Landmark 81 cao 461 m).`;
}

minutesInput.addEventListener("input", () => {
	body.minutes = Number(minutesInput.value);
	renderBody();
});
efficiencyInput.addEventListener("input", () => {
	body.efficiency = Number(efficiencyInput.value) / 100;
	renderBody();
});
foodSelect.addEventListener("change", () => {
	body.food = FOODS.find((f) => f.id === foodSelect.value) ?? body.food;
	renderBody();
});
$("body-info").addEventListener("input", () => {
	body.person = readPerson();
	renderBody();
});

/* ---------- Tabs, theme, resize ---------- */

const tabs = [...document.querySelectorAll<HTMLButtonElement>("[role=tab]")];
function showTab(id: string) {
	const tab = tabs.find((t) => t.dataset.tab === id) ?? tabs[0];
	if (!tab) return;
	for (const t of tabs) {
		const selected = t === tab;
		t.setAttribute("aria-selected", String(selected));
		t.tabIndex = selected ? 0 : -1;
		$(`panel-${t.dataset.tab}`).hidden = !selected;
	}
	if (tab.dataset.tab === "phanh") play();
	if (tab.dataset.tab === "co-the") renderBody();
}
for (const tab of tabs) {
	tab.addEventListener("click", () => {
		history.replaceState(null, "", `#${tab.dataset.tab}`);
		showTab(tab.dataset.tab ?? "");
	});
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
	palette = readPalette(document.body);
	renderBrake();
});
let resizeTimer = 0;
new ResizeObserver(() => {
	clearTimeout(resizeTimer);
	resizeTimer = window.setTimeout(() => {
		renderBrake();
		renderBody();
	}, 50);
}).observe(document.body);

minutesInput.value = String(body.minutes);
efficiencyInput.value = String(Math.round(body.efficiency * 100));
syncBrakeInputs();
updateBrakeModel();
showTab(location.hash.slice(1) || "phanh");
