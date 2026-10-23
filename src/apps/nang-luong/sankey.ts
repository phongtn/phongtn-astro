import { power } from "./format";
import type { BodyBudget } from "./physics";

const MAX_WATTS = 700;
const MAX_BAND = 160;
const GAP = 26;

/** One band from a vertical segment on the left to one on the right. */
function band(x1: number, a1: number, b1: number, x2: number, a2: number, b2: number) {
	const m = (x1 + x2) / 2;
	return `M${x1} ${a1}C${m} ${a1} ${m} ${a2} ${x2} ${a2}L${x2} ${b2}C${m} ${b2} ${m} ${b1} ${x1} ${b1}Z`;
}

function centre(x1: number, y1: number, x2: number, y2: number) {
	const m = (x1 + x2) / 2;
	return `M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}`;
}

/**
 * Energy flow per second through the body: chemical → (resting heat) + (muscles → work + heat).
 * Band thickness is power on a fixed scale, so switching activities shows how much more flows.
 */
export function sankeySvg(width: number, b: BodyBudget, workLabel: string): string {
	const s = Math.min(MAX_BAND / MAX_WATTS, MAX_BAND / Math.max(b.metabolicPower, 1));
	// On narrow screens the work label takes its own row above the muscle label.
	const narrow = width < 560;
	const top = narrow ? 52 : 34;
	const node = 10;
	const x0 = 0;
	const x1 = Math.round(width * 0.42);
	const x2 = width - node;
	const hRest = b.restPower * s;
	const hEx = b.exercisePower * s;
	const hWork = b.workPower * s;
	const hMuscleHeat = hEx - hWork;
	const hHeat = hMuscleHeat + hRest;
	const heatTop = top + hWork + (hWork > 0 ? GAP : 0);
	const restTop = top + hEx;
	const restTo = heatTop + hMuscleHeat;
	const exercising = hEx > 0.5;
	const height = top + MAX_BAND + GAP + 30;

	const parts: string[] = [
		`<defs>
			<linearGradient id="g-heat" x1="0" x2="1"><stop offset="0" stop-color="var(--chemical)"/><stop offset="1" stop-color="var(--brake)"/></linearGradient>
			<linearGradient id="g-work" x1="0" x2="1"><stop offset="0" stop-color="var(--chemical)"/><stop offset="1" stop-color="var(--kinetic)"/></linearGradient>
		</defs>`,
		`<path d="${band(x0 + node, restTop, restTop + hRest, x2, restTo, restTo + hRest)}" fill="url(#g-heat)" opacity=".55"/>`,
		`<path class="flow" d="${centre(x0 + node, restTop + hRest / 2, x2, restTo + hRest / 2)}"/>`,
	];
	if (exercising) {
		parts.push(
			`<path d="${band(x0 + node, top, top + hEx, x1, top, top + hEx)}" fill="var(--chemical)" opacity=".55"/>`,
			`<path class="flow" d="${centre(x0 + node, top + hEx / 2, x1, top + hEx / 2)}"/>`,
			`<path d="${band(x1 + node, top + hWork, top + hEx, x2, heatTop, heatTop + hMuscleHeat)}" fill="url(#g-heat)" opacity=".55"/>`,
			`<path class="flow" d="${centre(x1 + node, top + hWork + hMuscleHeat / 2, x2, heatTop + hMuscleHeat / 2)}"/>`,
			`<path d="${band(x1 + node, top, top + hWork, x2, top, top + hWork)}" fill="url(#g-work)" opacity=".6"/>`,
			`<path class="flow" d="${centre(x1 + node, top + hWork / 2, x2, top + hWork / 2)}"/>`,
			`<rect x="${x1}" y="${top}" width="${node}" height="${hEx}" rx="2" fill="var(--chemical)"/>`,
			`<rect x="${x2}" y="${top}" width="${node}" height="${hWork}" rx="2" fill="var(--kinetic)"/>`,
			`<text x="${x1}" y="${top - 10}">Cơ bắp đốt ${power(b.exercisePower)}</text>`,
			`<text x="${x2 + node}" y="${narrow ? 16 : top - 10}" text-anchor="end" class="strong">${workLabel} ${power(b.workPower)}</text>`,
		);
	}
	parts.push(
		`<rect x="${x0}" y="${top}" width="${node}" height="${hEx + hRest}" rx="2" fill="var(--chemical)"/>`,
		`<rect x="${x2}" y="${heatTop}" width="${node}" height="${hHeat}" rx="2" fill="var(--brake)"/>`,
		`<text x="${x0}" y="${top - 10}" class="strong">Hóa năng ${power(b.metabolicPower)}</text>`,
		`<text x="${x0 + node + 6}" y="${restTop + hRest + 16}">duy trì sống ${power(b.restPower)}</text>`,
		`<text x="${x2 + node}" y="${heatTop + hHeat + 18}" text-anchor="end" class="strong">Nhiệt năng ${power(b.heatPower)}</text>`,
	);
	return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Dòng năng lượng trong cơ thể mỗi giây">${parts.join("")}</svg>`;
}
