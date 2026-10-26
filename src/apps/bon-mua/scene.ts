import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
	APHELION,
	DEFAULT_TILT,
	DEG,
	ECC,
	MILESTONES,
	PERIHELION,
	type Sun,
	dateShort,
	sunModel,
} from "./model";

export type View = "overview" | "side" | "follow";

const ORBIT = 16;
const R_EARTH = 1.15;
const UP = new THREE.Vector3(0, 1, 0);

function orbitPoint(lam: number, r: number) {
	const L = lam + Math.PI;
	return new THREE.Vector3(Math.cos(L) * r * ORBIT, 0, -Math.sin(L) * r * ORBIT);
}

/** Trục quay cố định trong không gian; Bắc bán cầu ngả về phía Mặt Trời vào Hạ chí. */
const axisVec = (tilt: number) => new THREE.Vector3(0, Math.cos(tilt * DEG), -Math.sin(tilt * DEG));

function canvasTexture(c: HTMLCanvasElement) {
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

function line(points: THREE.Vector3[], color: number, opacity = 1) {
	return new THREE.Line(
		new THREE.BufferGeometry().setFromPoints(points),
		new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
	);
}

/** Lưới kinh vĩ tuyến, xích đạo, hai chí tuyến và hai vòng cực theo góc nghiêng hiện tại. */
function earthTexture(tilt: number) {
	const c = document.createElement("canvas");
	c.width = 1024;
	c.height = 512;
	const x = c.getContext("2d");
	if (!x) return canvasTexture(c);
	const g = x.createLinearGradient(0, 0, 0, 512);
	for (const [at, col] of [
		[0, "#e6eef8"],
		[0.09, "#9cc0e6"],
		[0.16, "#2f6fb4"],
		[0.5, "#1f5ca3"],
		[0.84, "#2f6fb4"],
		[0.91, "#9cc0e6"],
		[1, "#e6eef8"],
	] as const)
		g.addColorStop(at, col);
	x.fillStyle = g;
	x.fillRect(0, 0, 1024, 512);
	const yOf = (lat: number) => ((90 - lat) / 180) * 512;
	const hline = (lat: number) => {
		x.beginPath();
		x.moveTo(0, yOf(lat));
		x.lineTo(1024, yOf(lat));
		x.stroke();
	};
	x.strokeStyle = "rgba(255,255,255,0.18)";
	x.lineWidth = 1.5;
	for (let lon = 0; lon < 360; lon += 30) {
		const X = (lon / 360) * 1024;
		x.beginPath();
		x.moveTo(X, 0);
		x.lineTo(X, 512);
		x.stroke();
	}
	for (const lat of [-60, -30, 30, 60]) hline(lat);
	// một kinh tuyến đậm để thấy rõ Trái Đất tự quay
	x.strokeStyle = "rgba(255,255,255,0.55)";
	x.lineWidth = 3;
	x.beginPath();
	x.moveTo(512, 0);
	x.lineTo(512, 512);
	x.stroke();
	x.strokeStyle = "rgba(255,206,110,0.95)";
	hline(0);
	x.setLineDash([10, 8]);
	x.lineWidth = 2;
	x.strokeStyle = "rgba(255,206,110,0.75)";
	hline(tilt);
	hline(-tilt);
	x.strokeStyle = "rgba(220,235,255,0.85)";
	hline(90 - tilt);
	hline(tilt - 90);
	const t = canvasTexture(c);
	t.anisotropy = 4;
	return t;
}

export function createScene(stage: HTMLElement, tagsEl: HTMLElement, reduced: boolean) {
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
	renderer.setClearColor(0x070b18, 1);
	stage.prepend(renderer.domElement);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
	camera.position.set(0, 21, 31);
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.minDistance = 3;
	controls.maxDistance = 90;
	controls.enablePan = false;
	let userMoved = false;
	controls.addEventListener("start", () => {
		userMoved = true;
	});

	// sao nền
	{
		const n = 1600;
		const pos = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) {
			const u = Math.random() * 2 - 1;
			const t = Math.random() * Math.PI * 2;
			const rr = 500 + Math.random() * 300;
			const s = Math.sqrt(1 - u * u);
			pos.set([rr * s * Math.cos(t), rr * u, rr * s * Math.sin(t)], i * 3);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		scene.add(
			new THREE.Points(
				g,
				new THREE.PointsMaterial({
					color: 0xc9d4f0,
					size: 1.4,
					sizeAttenuation: false,
					transparent: true,
					opacity: 0.75,
				}),
			),
		);
	}

	// Mặt Trời
	scene.add(
		new THREE.Mesh(new THREE.SphereGeometry(2.3, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffc457 })),
	);
	{
		const c = document.createElement("canvas");
		c.width = c.height = 256;
		const x = c.getContext("2d");
		if (x) {
			const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
			g.addColorStop(0, "rgba(255,214,120,0.95)");
			g.addColorStop(0.25, "rgba(255,170,60,0.45)");
			g.addColorStop(0.6, "rgba(255,140,40,0.08)");
			g.addColorStop(1, "rgba(255,120,30,0)");
			x.fillStyle = g;
			x.fillRect(0, 0, 256, 256);
		}
		const glow = new THREE.Sprite(
			new THREE.SpriteMaterial({
				map: canvasTexture(c),
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				transparent: true,
			}),
		);
		glow.scale.set(15, 15, 1);
		scene.add(glow);
	}
	scene.add(new THREE.PointLight(0xffffff, 4.8, 0, 0));
	scene.add(new THREE.AmbientLight(0x3a4a70, 1));

	// quỹ đạo theo đúng độ dẹt thật + mặt phẳng quỹ đạo
	{
		const pts: THREE.Vector3[] = [];
		for (let i = 0; i <= 360; i++) {
			const M = (i / 360) * Math.PI * 2;
			pts.push(orbitPoint(M + 2 * ECC * Math.sin(M) + 283 * DEG, 1 - ECC * Math.cos(M)));
		}
		scene.add(line(pts, 0x8ea3d6, 0.45));
		const disc = new THREE.Mesh(
			new THREE.CircleGeometry(ORBIT * 1.02, 96),
			new THREE.MeshBasicMaterial({
				color: 0x5f78b8,
				transparent: true,
				opacity: 0.05,
				side: THREE.DoubleSide,
				depthWrite: false,
			}),
		);
		disc.rotation.x = -Math.PI / 2;
		scene.add(disc);
	}

	// Trái Đất: pivot (vị trí) → tilt (trục nghiêng) → spin (tự quay)
	const earthPivot = new THREE.Group();
	const tiltGroup = new THREE.Group();
	const spinGroup = new THREE.Group();
	scene.add(earthPivot);
	earthPivot.add(tiltGroup);
	tiltGroup.add(spinGroup);
	const earthMat = new THREE.MeshPhongMaterial({
		map: earthTexture(DEFAULT_TILT),
		shininess: 8,
		specular: 0x222222,
	});
	spinGroup.add(new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 64, 40), earthMat));
	tiltGroup.add(
		line([new THREE.Vector3(0, -R_EARTH * 1.7, 0), new THREE.Vector3(0, R_EARTH * 1.7, 0)], 0xffffff),
	);
	const northTip = new THREE.Mesh(
		new THREE.ConeGeometry(0.09, 0.28, 12),
		new THREE.MeshBasicMaterial({ color: 0xffffff }),
	);
	northTip.position.y = R_EARTH * 1.7;
	tiltGroup.add(northTip);

	// vòng vĩ độ nơi quan sát và điểm đánh dấu quay theo Trái Đất
	const latRing = new THREE.LineLoop(
		new THREE.BufferGeometry().setFromPoints(
			Array.from({ length: 96 }, (_, i) => {
				const a = (i / 96) * Math.PI * 2;
				return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
			}),
		),
		new THREE.LineBasicMaterial({ color: 0xff8a4c }),
	);
	tiltGroup.add(latRing);
	const cityDot = new THREE.Mesh(
		new THREE.SphereGeometry(0.075, 16, 12),
		new THREE.MeshBasicMaterial({ color: 0xff8a4c }),
	);
	spinGroup.add(cityDot);

	// điểm Mặt Trời đứng bóng + tia nắng
	const subsolar = new THREE.Mesh(
		new THREE.SphereGeometry(0.07, 16, 12),
		new THREE.MeshBasicMaterial({ color: 0xffe08a }),
	);
	scene.add(subsolar);
	const ray = line([new THREE.Vector3(), new THREE.Vector3()], 0xffc457, 0.55);
	scene.add(ray);

	// Trái Đất mờ ở bốn mốc: trục của chúng luôn song song
	const ghosts = MILESTONES.map((m) => {
		const s = sunModel(m.day, DEFAULT_TILT);
		const group = new THREE.Group();
		group.position.copy(orbitPoint(s.lam, s.r));
		const inner = new THREE.Group();
		group.add(inner);
		inner.add(
			new THREE.Mesh(
				new THREE.SphereGeometry(0.42, 24, 16),
				new THREE.MeshPhongMaterial({
					color: 0x5c86c8,
					transparent: true,
					opacity: 0.35,
					depthWrite: false,
				}),
			),
		);
		inner.add(line([new THREE.Vector3(0, -0.8, 0), new THREE.Vector3(0, 0.8, 0)], 0xc8d6f5, 0.7));
		scene.add(group);
		return { ...m, group, inner };
	});
	const apsides = [PERIHELION, APHELION].map((m) => {
		const s = sunModel(m.day, DEFAULT_TILT);
		const dot = new THREE.Mesh(
			new THREE.SphereGeometry(0.1, 12, 8),
			new THREE.MeshBasicMaterial({ color: 0x8ea3d6 }),
		);
		dot.position.copy(orbitPoint(s.lam, s.r));
		scene.add(dot);
		return { ...m, pos: dot.position.clone() };
	});

	// nhãn HTML gắn theo vị trí 3D
	type Tag = { el: HTMLElement; pos: () => THREE.Vector3; below?: boolean };
	const makeTag = (html: string, cls = "") => {
		const el = document.createElement("div");
		el.className = `tag ${cls}`;
		el.innerHTML = html;
		tagsEl.append(el);
		return el;
	};
	const lift = (v: THREE.Vector3, y: number) => v.clone().add(new THREE.Vector3(0, y, 0));
	const tags: Tag[] = [
		{ el: makeTag("<b>Mặt Trời</b>", "sun"), pos: () => new THREE.Vector3(0, 3.1, 0) },
		{ el: makeTag("<b>Trái Đất</b>", "earth"), pos: () => lift(earthPivot.position, 2.4) },
		...ghosts.map((g) => ({
			el: makeTag(`<b>${g.name}</b>${dateShort(g.day)}`),
			pos: () => lift(g.group.position, 1.05),
		})),
		...apsides.map((m) => ({
			el: makeTag(`${m.name} ${dateShort(m.day)}`),
			pos: () => lift(m.pos, -0.35).multiplyScalar(1.07),
			below: true,
		})),
	];
	const tmp = new THREE.Vector3();
	let width = 1;
	let height = 1;
	function placeTags() {
		for (const t of tags) {
			tmp.copy(t.pos()).project(camera);
			const visible = tmp.z > -1 && tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
			t.el.hidden = !visible;
			if (visible) {
				const x = (tmp.x * 0.5 + 0.5) * width;
				const y = (-tmp.y * 0.5 + 0.5) * height;
				t.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${t.below ? "0" : "-100%"})`;
			}
		}
	}

	// ---------- góc nhìn ----------
	let view: View = "overview";
	let tween: {
		t: number;
		p0: THREE.Vector3;
		p1: THREE.Vector3;
		q0: THREE.Vector3;
		q1: THREE.Vector3;
	} | null = null;
	const prevEarth = new THREE.Vector3();
	// màn hình hẹp cần lùi máy quay ra xa để thấy trọn quỹ đạo
	const fitScale = () => Math.max(1, 1.45 / Math.max(0.3, camera.aspect));
	const viewPos = (v: Exclude<View, "follow">) =>
		(v === "side" ? new THREE.Vector3(0, 1.6, 36) : new THREE.Vector3(0, 21, 31)).multiplyScalar(
			fitScale(),
		);

	function setView(v: View) {
		view = v;
		const e = earthPivot.position;
		let pos: THREE.Vector3;
		let target: THREE.Vector3;
		if (v === "follow") {
			const out = e.clone().normalize();
			const side = new THREE.Vector3().crossVectors(UP, out).normalize();
			pos = e
				.clone()
				.add(out.multiplyScalar(2.2))
				.add(side.multiplyScalar(5.2))
				.add(new THREE.Vector3(0, 1.8, 0));
			target = e.clone();
		} else {
			pos = viewPos(v);
			target = new THREE.Vector3();
		}
		tween = { t: reduced ? 1 : 0, p0: camera.position.clone(), p1: pos, q0: controls.target.clone(), q1: target };
	}

	function updateCamera(dt: number) {
		const e = earthPivot.position;
		const moved = e.clone().sub(prevEarth);
		if (tween) {
			tween.t = Math.min(1, tween.t + dt / 0.9);
			const k = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - (-2 * tween.t + 2) ** 2 / 2;
			if (view === "follow") {
				tween.p1.add(moved);
				tween.q1.copy(e);
			}
			camera.position.lerpVectors(tween.p0, tween.p1, k);
			controls.target.lerpVectors(tween.q0, tween.q1, k);
			if (tween.t >= 1) tween = null;
		} else if (view === "follow") {
			camera.position.add(moved);
			controls.target.copy(e);
		}
		prevEarth.copy(e);
	}

	function resize() {
		width = stage.clientWidth;
		height = stage.clientHeight;
		renderer.setSize(width, height, false);
		camera.aspect = width / Math.max(1, height);
		camera.updateProjectionMatrix();
		if (!tween && !userMoved && view !== "follow") camera.position.copy(viewPos(view));
	}

	return {
		resize,
		setView,
		setSun(sun: Sun) {
			const p = orbitPoint(sun.lam, sun.r);
			earthPivot.position.copy(p);
			const toSun = p.clone().negate().normalize();
			subsolar.position.copy(p).addScaledVector(toSun, R_EARTH * 1.01);
			const a = ray.geometry.attributes.position;
			if (a) {
				a.setXYZ(0, -toSun.x * 2.4, 0, -toSun.z * 2.4);
				a.setXYZ(1, subsolar.position.x, subsolar.position.y, subsolar.position.z);
				a.needsUpdate = true;
			}
			if (prevEarth.lengthSq() === 0) prevEarth.copy(p);
		},
		setTilt(tilt: number) {
			const q = new THREE.Quaternion().setFromUnitVectors(UP, axisVec(tilt));
			tiltGroup.quaternion.copy(q);
			for (const g of ghosts) g.inner.quaternion.copy(q);
			earthMat.map?.dispose();
			earthMat.map = earthTexture(tilt);
			earthMat.needsUpdate = true;
		},
		setLat(lat: number) {
			const phi = lat * DEG;
			const r = R_EARTH * 1.006 * Math.cos(phi) + 0.0001;
			latRing.scale.set(r, 1, r);
			latRing.position.y = R_EARTH * 1.006 * Math.sin(phi);
			cityDot.position.set(R_EARTH * Math.cos(phi), R_EARTH * Math.sin(phi), 0);
		},
		frame(dt: number) {
			spinGroup.rotation.y += dt * (reduced ? 0.15 : 0.9);
			updateCamera(dt);
			controls.update();
			renderer.render(scene, camera);
			placeTags();
		},
	};
}
