import { chartDayAt, drawBeam, drawChart, drawSection } from "./figures";
import {
	AU_MKM,
	CITIES,
	DEFAULT_TILT,
	DEG,
	MILESTONES,
	MONTH_DAYS,
	MONTH_START,
	YEAR,
	dateText,
	dayInfo,
	hoursShort,
	hoursText,
	latText,
	nearestEvent,
	nf,
	seasonOf,
	sunModel,
	todayIndex,
} from "./model";
import { type View, createScene } from "./scene";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TODAY = todayIndex();

const state = {
	day: TODAY,
	tilt: DEFAULT_TILT,
	lat: 21.03,
	city: "hanoi",
	playing: false,
	speed: 20,
};

function $<T extends HTMLElement = HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Thiếu phần tử #${id}`);
	return el as T;
}
const text = (id: string, value: string) => {
	$(id).textContent = value;
};

const daySlider = $<HTMLInputElement>("day");
const latSlider = $<HTMLInputElement>("lat");
const tiltSlider = $<HTMLInputElement>("tilt");
const stage = $("stage");
const cvSection = $<HTMLCanvasElement>("cv-section");
const cvBeam = $<HTMLCanvasElement>("cv-beam");
const cvChart = $<HTMLCanvasElement>("cv-chart");

$("months").innerHTML = MONTH_START.map(
	(s, i) => `<span style="left:${((s + (MONTH_DAYS[i] ?? 30) / 2) / YEAR) * 100}%">T${i + 1}</span>`,
).join("");
$("cities").innerHTML = CITIES.map(
	(c) =>
		`<button type="button" class="chip" data-city="${c.id}" aria-pressed="false">${c.name}</button>`,
).join("");

const scene = createScene(stage, $("tags"), reduced);

const cityName = () => CITIES.find((c) => c.id === state.city)?.name ?? `vĩ độ ${latText(state.lat)}`;

let yearCurve = { key: "", hours: [] as number[] };
function curve() {
	const key = `${state.lat}|${state.tilt}`;
	if (yearCurve.key !== key) {
		const hours: number[] = [];
		for (let d = 0; d <= YEAR; d++) hours.push(dayInfo(state.lat, sunModel(d, state.tilt)).hours);
		yearCurve = { key, hours };
	}
	return yearCurve.hours;
}

function render() {
	const sun = sunModel(state.day, state.tilt);
	const info = dayInfo(state.lat, sun);
	const name = cityName();
	scene.setSun(sun);

	text("o-date", dateText(state.day));
	text("o-event", nearestEvent(state.day));
	const noSeason = state.tilt < 0.5;
	text("o-north", noSeason ? "Không có mùa" : seasonOf(sun.lam, true));
	text("o-south", noSeason ? "Không có mùa" : seasonOf(sun.lam, false));
	text("o-dec", latText(sun.dec / DEG));
	text("o-dist", `${nf(sun.r * AU_MKM)} triệu km`);
	text("o-len", hoursShort(info.hours));
	text("o-alt", info.noonAlt > 0 ? `${nf(info.noonAlt, 0)}°` : "không mọc");
	text("o-q", `${nf(info.insolation, 0)} W/m²`);
	daySlider.setAttribute("aria-valuetext", dateText(state.day));

	const tiltDir =
		sun.dec > 0.002
			? "Bắc bán cầu đang ngả về phía Mặt Trời"
			: sun.dec < -0.002
				? "Nam bán cầu đang ngả về phía Mặt Trời"
				: "Không bán cầu nào ngả về phía Mặt Trời";
	let dayPart: string;
	if (info.hours >= 23.99) dayPart = `${name} nằm trọn trong phía ngày: Mặt Trời không lặn.`;
	else if (info.hours <= 0.01) dayPart = `${name} nằm trọn trong phía đêm: Mặt Trời không mọc.`;
	else
		dayPart = `Vạch cam là phần ngày, vạch xanh là phần đêm của vĩ tuyến ${name}: ngày dài <strong>${hoursText(info.hours)}</strong>.`;
	$("c-section").innerHTML = `${tiltDir}. ${dayPart}`;

	if (info.noonAlt > 0.2) {
		const spread = 1 / Math.sin(info.noonAlt * DEG);
		$("c-beam").innerHTML =
			`Nắng trưa ở ${name} cao <strong>${nf(info.noonAlt, 0)}°</strong>. Chùm nắng trải trên diện tích gấp <strong>${nf(spread, 2)} lần</strong>, nên mỗi mét vuông chỉ nhận <strong>${nf(100 / spread, 0)}%</strong> so với khi chiếu thẳng.`;
	} else {
		$("c-beam").innerHTML =
			`Mặt Trời không lên khỏi đường chân trời ở ${name} hôm nay, mặt đất chỉ tỏa nhiệt mà không được sưởi.`;
	}

	const hours = curve();
	$("c-chart").innerHTML =
		`Tại ${name}, ngày dài nhất <strong>${hoursText(Math.max(...hours))}</strong>, ngắn nhất <strong>${hoursText(Math.min(...hours))}</strong>. Đường đứt là mốc 12 giờ.`;

	drawSection(cvSection, sun.dec, state.lat, state.tilt);
	drawBeam(cvBeam, info.noonAlt);
	drawChart(cvChart, hours, state.day, info.hours);
}

function buildTable() {
	text("tbl-city", cityName());
	$("tbl").innerHTML = MILESTONES.map((m) => {
		const s = sunModel(m.day, state.tilt);
		const i = dayInfo(state.lat, s);
		const alt = i.noonAlt > 0 ? `${nf(i.noonAlt)}°` : "không mọc";
		return `<tr><td>${m.name}</td><td class="num">${dateText(m.day)}</td><td class="num">${latText(s.dec / DEG)}</td><td class="num">${hoursText(i.hours)}</td><td class="num">${alt}</td></tr>`;
	}).join("");
}

let dirty = true;

function setPlaying(p: boolean) {
	state.playing = p;
	$("play").setAttribute("aria-pressed", String(p));
	text("play-label", p ? "Dừng" : "Chạy");
	$("play-icon").setAttribute("d", p ? "M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z" : "M4 2.5v11l9-5.5z");
}
function setDay(d: number) {
	state.day = ((d % YEAR) + YEAR) % YEAR;
	daySlider.value = String(state.day);
	dirty = true;
}
function setLat(lat: number, city: string) {
	state.lat = lat;
	state.city = city;
	latSlider.value = String(lat);
	scene.setLat(lat);
	text("o-lat", latText(lat));
	for (const b of document.querySelectorAll<HTMLElement>("#cities .chip"))
		b.setAttribute("aria-pressed", String(b.dataset.city === city));
	buildTable();
	dirty = true;
}
function setCity(id: string) {
	const c = CITIES.find((x) => x.id === id);
	if (c) setLat(c.lat, c.id);
}
function setTilt(t: number) {
	state.tilt = t;
	tiltSlider.value = String(t);
	scene.setTilt(t);
	text("o-tilt", `${nf(t, 2)}°`);
	buildTable();
	dirty = true;
}
function setView(v: View) {
	for (const b of document.querySelectorAll<HTMLElement>(".views button"))
		b.setAttribute("aria-pressed", String(b.dataset.view === v));
	scene.setView(v);
}
const showStage = () => stage.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });

$("play").addEventListener("click", () => setPlaying(!state.playing));
daySlider.addEventListener("input", () => {
	setPlaying(false);
	setDay(Number(daySlider.value));
});
for (const b of document.querySelectorAll<HTMLElement>(".timebar .chip"))
	b.addEventListener("click", () => {
		setPlaying(false);
		setDay(b.dataset.day === "today" ? TODAY : Number(b.dataset.day));
	});
for (const b of document.querySelectorAll<HTMLElement>(".seg button"))
	b.addEventListener("click", () => {
		state.speed = Number(b.dataset.speed);
		for (const x of document.querySelectorAll(".seg button"))
			x.setAttribute("aria-pressed", String(x === b));
	});
for (const b of document.querySelectorAll<HTMLElement>(".views button"))
	b.addEventListener("click", () => setView(b.dataset.view as View));
for (const b of document.querySelectorAll<HTMLElement>("#cities .chip"))
	b.addEventListener("click", () => setCity(b.dataset.city ?? ""));
latSlider.addEventListener("input", () => {
	const lat = Number(latSlider.value);
	setLat(lat, CITIES.find((c) => Math.abs(c.lat - lat) < 0.06)?.id ?? "custom");
});
tiltSlider.addEventListener("input", () => setTilt(Number(tiltSlider.value)));
$("tilt-reset").addEventListener("click", () => setTilt(DEFAULT_TILT));

let dragging = false;
const pick = (e: PointerEvent) => {
	setPlaying(false);
	setDay(chartDayAt(cvChart, e.clientX));
};
cvChart.addEventListener("pointerdown", (e) => {
	dragging = true;
	cvChart.setPointerCapture(e.pointerId);
	pick(e);
});
cvChart.addEventListener("pointermove", (e) => dragging && pick(e));
cvChart.addEventListener("pointerup", () => {
	dragging = false;
});
cvChart.addEventListener("pointercancel", () => {
	dragging = false;
});

$("t-notilt").addEventListener("click", () => {
	setTilt(0);
	showStage();
});
$("t-polar").addEventListener("click", () => {
	setTilt(DEFAULT_TILT);
	setCity("tromso");
	setPlaying(false);
	setDay(354.8);
	setView("follow");
	showStage();
});
$("t-sydney").addEventListener("click", () => {
	setTilt(DEFAULT_TILT);
	setCity("sydney");
	setPlaying(false);
	setDay(171.4);
	showStage();
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
	dirty = true;
});
document.fonts?.ready.then(() => {
	dirty = true;
});
new ResizeObserver(() => {
	scene.resize();
	dirty = true;
}).observe(stage);

setDay(state.day);
setTilt(state.tilt);
setCity(state.city);
scene.resize();

let last = performance.now();
function frame(t: number) {
	const dt = Math.min(0.1, (t - last) / 1000);
	last = t;
	if (state.playing) setDay(state.day + state.speed * dt);
	if (dirty) {
		dirty = false;
		render();
	}
	scene.frame(dt);
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
