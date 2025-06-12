import WindowManager from './WindowManager.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const t = THREE;
const textureLoader = new t.TextureLoader();

// Textures
const earthTexture = textureLoader.load('textures/8k_earth_daymap.jpg');
const mercuryTexture = textureLoader.load('textures/8k_mercury.jpg');
const venusTexture = textureLoader.load('textures/8k_venus_surface.jpg');
const uranusTexture = textureLoader.load('textures/2k_uranus.jpg');
const neptuneTexture = textureLoader.load('textures/2k_neptune.jpg');
const starTexture = textureLoader.load('textures/8k_stars_milky_way.jpg');
const jupiterTexture = textureLoader.load('textures/8k_jupiter.jpg');
const marsTexture = textureLoader.load('textures/8k_mars.jpg');
const saturnTexture = textureLoader.load('textures/8k_saturn.jpg');
const saturnRingTexture = textureLoader.load('textures/8k_saturn_ring_alpha.png');
const sunTexture = textureLoader.load('textures/8k_sun.jpg');
const moonTexture = textureLoader.load('textures/8k_moon.jpg');

const allTextures = [
	earthTexture, mercuryTexture, venusTexture, uranusTexture, neptuneTexture,
	jupiterTexture, marsTexture, saturnTexture, saturnRingTexture, sunTexture, moonTexture
];

let camera, scene, renderer, world, composer, sun;
let activeExplosions = [];
let heatingObjects = [];
let laserMode = 'none'; // 'none' or 'hot'
let isSunExploding = false;
let sunExplosionTime = 0;
const originalBloomStrength = 0.45;
let extinctionText;

// --- MODIFIED: Laser Variables for Visual Effect ---
let laserCore = null; // 밝은 중심부
let laserGlow = null; // 외부 광선
// ---
let heatingTarget = null;

let pixR = window.devicePixelRatio ? window.devicePixelRatio : 1;
let cubes = [];
let sceneOffsetTarget = {x: 0, y: 0};
let sceneOffset = {x: 0, y: 0};

let mouseX = 0;
let mouseY = 0;
let fixedTheta = null;
let fixedPhi = null;
let isMouseDown = false;
let isControlDown = false;

let selectedTarget = new t.Vector3(0, 0, 0);
const storedCameraState = JSON.parse(localStorage.getItem("cameraState"));
if (storedCameraState) {
	selectedTarget = new t.Vector3(...storedCameraState.target);
	fixedTheta = storedCameraState.theta;
	fixedPhi = storedCameraState.phi;
}
const raycaster = new t.Raycaster();
const mouse = new t.Vector2();

let today = new Date();
today.setHours(0);
today.setMinutes(0);
today.setSeconds(0);
today.setMilliseconds(0);
today = today.getTime();

let windowManager;
let initialized = false;
const clock = new THREE.Clock();

const vertexShader = `
varying vec3 vNormal;
void main() {
    vNormal = normalize( normalMatrix * normal );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const fragmentShader = `
uniform vec3 c;
uniform float p;
varying vec3 vNormal;
void main() {
    float intensity = pow( 0.6 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) ), p ); 
    gl_FragColor = vec4( c * intensity, 1.0 * intensity );
}`;

if (new URLSearchParams(window.location.search).get("clear"))
{
	localStorage.clear();
}
else
{
	document.addEventListener("visibilitychange", () =>
	{
		if (document.visibilityState != 'hidden' && !initialized)
		{
			init();
		}
	});

	window.onload = () => {
		if (document.visibilityState != 'hidden')
		{
			init();
		}
	};

	function init ()
	{
		initialized = true;

		createLaserUI();
		createExtinctionText();

		window.addEventListener("storage", (event) => {
			if (event.key === "cameraState") {
				const state = JSON.parse(event.newValue);
				if (state) {
					selectedTarget = new t.Vector3(...state.target);
					fixedTheta = state.theta;
					fixedPhi = state.phi;
				}
			}
		});

		document.addEventListener('mousemove', (event) => {
			mouseX = (event.clientX / window.innerWidth) * 2 - 1;
			mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
		});

		document.addEventListener('mousedown', (event) => {
			if (event.target.closest('.laser-controls')) return;
			isMouseDown = true;
		});

		document.addEventListener('mouseup', () => {
			isMouseDown = false;
		});

		document.addEventListener('wheel', (event) => {
			const minZoom = 200;
			const maxZoom = 2000;
			camera.position.z = Math.max(minZoom, Math.min(maxZoom, camera.position.z + event.deltaY * 0.5));
		});

		document.addEventListener('keydown', (e) => {
			if (e.key === 'Control') isControlDown = true;
			if (e.key === 'r') resetScene();
		});

		document.addEventListener('keyup', (e) => {
			if (e.key === 'Control') isControlDown = false;
		});

		document.addEventListener('click', (event) => {
			if (event.target.closest('.laser-controls') || laserMode === 'hot') return;

			mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
			mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
			raycaster.setFromCamera(mouse, camera);

			const intersects = raycaster.intersectObjects(cubes);
			for (const cube of cubes) {
				if (cube.userData) cube.userData.follow = false;
			}

			if (intersects.length > 0) {
				const clickedObject = intersects[0].object;
				if (clickedObject.userData && clickedObject.userData.radius !== undefined) {
					const planet = clickedObject;
					selectedTarget.copy(planet.position);
					fixedTheta = planet.userData.angle;
					fixedPhi = Math.PI / 2.5;
					planet.userData.follow = true;
				} else {
					selectedTarget.set(0, 0, 0);
					fixedTheta = Math.PI / 4;
					fixedPhi = Math.PI / 2.5;
				}
			} else {
				selectedTarget.set(0, 0, 0);
				fixedTheta = Math.PI / 4;
				fixedPhi = Math.PI / 2.5;
			}
			localStorage.setItem("cameraState", JSON.stringify({ target: selectedTarget.toArray(), theta: fixedTheta, phi: fixedPhi }));
		});

		setTimeout(() => {
			setupScene();
			setupWindowManager();
			resize();
			updateWindowShape(false);
			render();
			window.addEventListener('resize', resize);
		}, 500);
	}

	function setupScene ()
	{
		camera = new t.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
		camera.position.set(0, 0, 800);
		sceneOffsetTarget = { x: -window.screenX, y: -window.screenY };
		sceneOffset = { x: -window.screenX, y: -window.screenY };
		fixedTheta = Math.PI / 4;
		fixedPhi = Math.PI / 2.5;
		selectedTarget = new t.Vector3(0, 0, 0);

		scene = new t.Scene();
		scene.background = starTexture;
		scene.add( camera );

		renderer = new t.WebGLRenderer({antialias: true, depthBuffer: true});
		renderer.setPixelRatio(pixR);
		renderer.domElement.setAttribute("id", "scene");
		document.body.appendChild( renderer.domElement );

		const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
		allTextures.forEach(texture => {
			texture.anisotropy = maxAnisotropy;
			texture.needsUpdate = true;
		});

		const ambientLight = new t.AmbientLight(0x888888);
		scene.add(ambientLight);

		const pointLight = new t.PointLight(0xffffff, 2.0, 0);
		pointLight.position.set(0, 0, 0);
		scene.add(pointLight);

		world = new t.Object3D();
		scene.add(world);

		// --- MODIFIED: Create a composite laser beam (core + glow) ---
		const laserGeometry = new THREE.CylinderGeometry(1, 1, 1, 32);
		laserGeometry.translate(0, 0.5, 0);

		// 1. 외부 광선 (Glow)
		const glowMaterial = new THREE.MeshBasicMaterial({
			color: 0xff4500,
			transparent: true,
			opacity: 0.4,
			blending: THREE.AdditiveBlending // 빛이 섞이는 느낌을 강화
		});
		laserGlow = new THREE.Mesh(laserGeometry, glowMaterial);
		laserGlow.scale.set(0.8, 1, 0.8); // 더 넓게 퍼지도록 설정
		laserGlow.visible = false;
		scene.add(laserGlow);

		// 2. 밝은 중심부 (Core)
		const coreMaterial = new THREE.MeshBasicMaterial({
			color: 0xffe6bf // 흰색에 가까운 밝은 주황색
		});
		laserCore = new THREE.Mesh(laserGeometry, coreMaterial);
		laserCore.scale.set(0.2, 1, 0.2); // 가늘게 설정
		laserCore.visible = false;
		scene.add(laserCore);
		// --- END Laser Creation ---

		const renderScene = new RenderPass(scene, camera);
		const bloomPass = new UnrealBloomPass( new t.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85 );
		bloomPass.threshold = 0.9;
		bloomPass.strength = originalBloomStrength;
		bloomPass.radius = 0.5;
		const outputPass = new OutputPass();

		composer = new EffectComposer(renderer);
		composer.addPass(renderScene);
		composer.addPass(bloomPass);
		composer.addPass(outputPass);
	}

	function createExtinctionText() {
		extinctionText = document.createElement('div');
		extinctionText.innerText = '멸종';
		extinctionText.style.position = 'absolute';
		extinctionText.style.top = '50%';
		extinctionText.style.left = '50%';
		extinctionText.style.transform = 'translate(-50%, -50%)';
		extinctionText.style.color = 'red';
		extinctionText.style.fontFamily = `'Malgun Gothic', 'Arial Black', sans-serif`;
		extinctionText.style.fontSize = '15vw';
		extinctionText.style.fontWeight = '900';
		extinctionText.style.textShadow = '0 0 10px white, 0 0 20px red';
		extinctionText.style.zIndex = '200';
		extinctionText.style.opacity = '0';
		extinctionText.style.transition = 'opacity 1s ease-in-out';
		extinctionText.style.pointerEvents = 'none';
		extinctionText.style.letterSpacing = '0.3em';
		document.body.appendChild(extinctionText);
	}

	function createLaserUI() {
		const controls = document.createElement('div');
		controls.className = 'laser-controls';
		controls.style.cssText = 'position: absolute; top: 20px; left: 20px; z-index: 100;';

		const coldButton = document.createElement('button');
		coldButton.id = 'cold-laser-button';
		coldButton.innerText = '일반 모드';
		coldButton.onclick = () => setLaserMode('none');
		styleLaserButton(coldButton, '#77c3ec');

		const hotButton = document.createElement('button');
		hotButton.id = 'hot-laser-button';
		hotButton.innerText = '공격 모드';
		hotButton.onclick = () => setLaserMode('hot');
		styleLaserButton(hotButton, '#f56c42');

		controls.appendChild(coldButton);
		controls.appendChild(hotButton);
		document.body.appendChild(controls);
	}

	function setLaserMode(mode) {
		laserMode = mode;
		document.getElementById('hot-laser-button').style.boxShadow = (mode === 'hot') ? '0 0 15px #f56c42' : 'none';
		document.body.style.cursor = (mode === 'hot') ? 'crosshair' : 'default';
	}

	function styleLaserButton(button, color) {
		button.style.display = 'block';
		button.style.padding = '10px 15px';
		button.style.border = '2px solid ' + color;
		button.style.backgroundColor = 'rgba(0,0,0,0.5)';
		button.style.color = color;
		button.style.fontFamily = `'Malgun Gothic', sans-serif`;
		button.style.fontWeight = 'bold';
		button.style.cursor = 'pointer';
		button.style.borderRadius = '5px';
		button.style.marginBottom = '10px';
		button.style.transition = 'all 0.2s';
		button.onmouseover = () => { button.style.backgroundColor = color; button.style.color = 'black'; };
		button.onmouseout = () => { button.style.backgroundColor = 'rgba(0,0,0,0.5)'; button.style.color = color; };
	}

	// --- MODIFIED: Update both laser components ---
	function updateLaserBeam(targetPoint) {
		if (!targetPoint) return;
		laserCore.visible = true;
		laserGlow.visible = true;

		const startPoint = camera.position.clone();
		const distance = startPoint.distanceTo(targetPoint);

		// Update both core and glow beams
		[laserCore, laserGlow].forEach(beam => {
			beam.position.copy(startPoint);
			beam.lookAt(targetPoint);
			// beam.scale.y is now used for length
			beam.scale.y = distance;
		});
	}

	function hideLaserBeam() {
		if (laserCore) laserCore.visible = false;
		if (laserGlow) laserGlow.visible = false;
	}
	// ---

	function startObjectHeating(object) {
		if (heatingObjects.some(p => p.object === object)) return;

		heatingTarget = object;
		heatingObjects.push({
			object: object,
			startTime: clock.getElapsedTime(),
			originalEmissive: object.material.emissiveIntensity,
			originalColor: object.material.emissive.clone(),
		});
	}

	function stopHeating(object) {
		const heatingIndex = heatingObjects.findIndex(p => p.object === object);
		if (heatingIndex > -1) {
			const heating = heatingObjects[heatingIndex];
			heating.object.material.emissiveIntensity = heating.originalEmissive;
			heating.object.material.emissive.copy(heating.originalColor);
			heatingObjects.splice(heatingIndex, 1);
		}
		if (heatingTarget === object) {
			heatingTarget = null;
		}
	}

	function updateHeatingObjects(deltaTime) {
		// 가열 시간을 2초에서 1초로 줄여 난이도 하향 조정
		const heatingDuration = 1.0;
		const explosionDelay = 0.5;

		for (let i = heatingObjects.length - 1; i >= 0; i--) {
			const heating = heatingObjects[i];
			const { object, startTime, originalEmissive, originalColor } = heating;
			const elapsedTime = clock.getElapsedTime() - startTime;

			if (elapsedTime < heatingDuration) {
				const heatIntensity = Math.abs(Math.sin(elapsedTime * 8));
				object.material.emissiveIntensity = originalEmissive + heatIntensity * 2.5;
				object.material.emissive.lerpColors(originalColor, new THREE.Color(0xff0000), elapsedTime / heatingDuration);
			} else if (elapsedTime < heatingDuration + explosionDelay) {
				object.material.emissiveIntensity = originalEmissive + 2.5;
				object.material.emissive.setHex(0xffffff);
			} else {
				if (object === sun) {
					triggerSunExplosion();
				} else {
					triggerPlanetExplosion(object);
				}
				heatingObjects.splice(i, 1);
				if (heatingTarget === object) heatingTarget = null;
			}
		}
	}

	function triggerSunExplosion() {
		if (isSunExploding) return;
		isSunExploding = true;
		sunExplosionTime = 0;
		extinctionText.style.opacity = '1';
		setLaserMode('none');
		cubes.forEach(c => { if(c !== sun) c.visible = false; });
		createExplosionParticles(sun, 20000, 2.5);
	}

	function triggerPlanetExplosion(planet) {
		planet.visible = false;
		if (planet.userData.moon) planet.userData.moon.visible = false;
		const orbit = cubes.find(c => c.userData.isOrbitFor === planet);
		if(orbit) orbit.visible = false;
		createExplosionParticles(planet, 5000, 1.5);
	}

	function createExplosionParticles(targetObject, count, size) {
		const particleCount = count;
		const positions = new Float32Array(particleCount * 3);
		const objectPosition = targetObject.getWorldPosition(new THREE.Vector3());

		for (let i = 0; i < particleCount; i++) {
			const i3 = i * 3;
			positions[i3] = objectPosition.x;
			positions[i3 + 1] = objectPosition.y;
			positions[i3 + 2] = objectPosition.z;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const material = new THREE.PointsMaterial({
			color: 0xffffff,
			size: size,
			blending: THREE.AdditiveBlending,
			transparent: true,
		});

		const particles = new THREE.Points(geometry, material);
		const velocities = [];
		for (let i = 0; i < particleCount; i++) {
			velocities.push(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 15 + (targetObject === sun ? 5 : 0)));
		}

		activeExplosions.push({ particles, velocities, startTime: clock.getElapsedTime() });
		scene.add(particles);
	}

	function updateActiveExplosions(deltaTime) {
		for (let i = activeExplosions.length - 1; i >= 0; i--) {
			const explosion = activeExplosions[i];
			const elapsedTime = clock.getElapsedTime() - explosion.startTime;
			const duration = 3.0;

			if (elapsedTime > duration) {
				scene.remove(explosion.particles);
				explosion.particles.geometry.dispose();
				explosion.particles.material.dispose();
				activeExplosions.splice(i, 1);
				continue;
			}

			const positions = explosion.particles.geometry.attributes.position.array;
			for (let j = 0; j < positions.length / 3; j++) {
				const j3 = j * 3;
				positions[j3] += explosion.velocities[j].x * deltaTime;
				positions[j3 + 1] += explosion.velocities[j].y * deltaTime;
				positions[j3 + 2] += explosion.velocities[j].z * deltaTime;
			}
			explosion.particles.geometry.attributes.position.needsUpdate = true;
			explosion.particles.material.opacity = 1.0 - (elapsedTime / duration);
		}
	}

	function resetScene() {
		isSunExploding = false;
		sunExplosionTime = 0;
		composer.passes[1].strength = originalBloomStrength;
		extinctionText.style.opacity = '0';
		activeExplosions.forEach(e => {
			scene.remove(e.particles);
			e.particles.geometry.dispose();
			e.particles.material.dispose();
		});
		activeExplosions = [];
		heatingObjects = [];
		heatingTarget = null;
		hideLaserBeam();
		updateNumberOfCubes();
	}

	function setupWindowManager() {
		windowManager = new WindowManager();
		windowManager.setWinShapeChangeCallback(updateWindowShape);
		windowManager.setWinChangeCallback(windowsUpdated);
		windowManager.init({foo: "bar"});
		windowsUpdated();
	}

	function windowsUpdated() {
		updateNumberOfCubes();
	}

	function updateNumberOfCubes () {
		cubes.forEach((c) => {
			c.parent?.remove(c);
			if(scene.children.includes(c)) scene.remove(c);
			if(world.children.includes(c)) world.remove(c);
			if (c.geometry) c.geometry.dispose();
			if (c.material) c.material.dispose();
		});
		cubes = [];
		heatingObjects = [];

		const centerX = 0;
		const centerY = 0;

		sun = new t.Mesh(
			new t.SphereGeometry(60, 64, 64),
			new t.MeshStandardMaterial({
				map: sunTexture,
				emissive: 0xffffdd,
				emissiveMap: sunTexture,
				emissiveIntensity: 0.8
			})
		);
		world.add(sun);
		cubes.push(sun);

		const planetsData = [
			{ name: "Mercury", texture: mercuryTexture, radius: 100, size: 10, speed: 0.02 },
			{ name: "Venus", texture: venusTexture, radius: 140, size: 12, speed: 0.015 },
			{ name: "Earth", texture: earthTexture, radius: 180, size: 14, speed: 0.012 },
			{ name: "Mars", texture: marsTexture, radius: 220, size: 11, speed: 0.010 },
			{ name: "Jupiter", texture: jupiterTexture, radius: 280, size: 20, speed: 0.008 },
			{ name: "Saturn", texture: saturnTexture, radius: 340, size: 18, speed: 0.006 },
			{ name: "Uranus", texture: uranusTexture, radius: 400, size: 16, speed: 0.005 },
			{ name: "Neptune", texture: neptuneTexture, radius: 460, size: 16, speed: 0.004 }
		];

		for (const planetData of planetsData) {
			const orbit = new t.LineLoop(
				new t.BufferGeometry().setFromPoints(
					new t.EllipseCurve(centerX, centerY, planetData.radius, planetData.radius, 0, 2 * Math.PI, false, 0).getPoints(100)
				),
				new t.LineBasicMaterial({ color: 0x888888 })
			);
			world.add(orbit);
			cubes.push(orbit);

			const planet = new t.Mesh(
				new t.SphereGeometry(planetData.size, 64, 64),
				new t.MeshStandardMaterial({
					map: planetData.texture,
					roughness: 0.7,
					emissive: 0xffffff,
					emissiveMap: planetData.texture,
					emissiveIntensity: 0.4
				})
			);
			planet.userData = { isPlanet: true, radius: planetData.radius, angle: Math.random() * Math.PI * 2, speed: planetData.speed, centerX, centerY };
			orbit.userData.isOrbitFor = planet;
			world.add(planet);
			cubes.push(planet);

			if (planetData.name === "Earth") {
				const atmosphere = new t.Mesh(
					new t.SphereGeometry(planetData.size * 1.05, 64, 64),
					new t.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { c: { value: new t.Color(0x87ceeb) }, p: { value: 4.0 } }, blending: t.AdditiveBlending, side: t.BackSide, transparent: true })
				);
				planet.add(atmosphere);

				const moon = new t.Mesh( new t.SphereGeometry(4, 32, 32), new t.MeshStandardMaterial({
					map: moonTexture,
					roughness: 0.7,
					emissive: 0xffffff,
					emissiveMap: moonTexture,
					emissiveIntensity: 0.2
				}));
				moon.userData = { parent: planet, angle: Math.random() * Math.PI * 2, speed: 0.05, radius: 25 };
				planet.userData.moon = moon;
				world.add(moon);
				cubes.push(moon);
			}
			if (planetData.name === "Saturn") {
				const ring = new t.Mesh( new t.RingGeometry(planetData.size + 8, planetData.size + 20, 64), new t.MeshBasicMaterial({ map: saturnRingTexture, side: t.DoubleSide, transparent: true, opacity: 0.8 }));
				ring.rotation.x = Math.PI / 2;
				planet.add(ring);
			}
		}
	}

	function updateWindowShape(easing = true) {
		sceneOffsetTarget = { x: -window.screenX, y: -window.screenY };
		if (!easing) sceneOffset = sceneOffsetTarget;
	}

	function render ()
	{
		requestAnimationFrame(render);
		const deltaTime = clock.getDelta();

		updateActiveExplosions(deltaTime);

		if (isSunExploding) {
			const duration = 4.0;
			sunExplosionTime += deltaTime;
			const bloomStrength = Math.sin((sunExplosionTime / duration) * Math.PI) * 4.0;
			composer.passes[1].strength = bloomStrength;
			if (sunExplosionTime > duration) {
				resetScene();
			}
		} else {
			if (laserMode === 'hot' && isMouseDown) {
				raycaster.setFromCamera({ x: mouseX, y: mouseY }, camera);
				const targets = cubes.filter(c => c.visible && (c.userData.isPlanet || c === sun));
				const intersects = raycaster.intersectObjects(targets, false);

				if (intersects.length > 0) {
					const intersection = intersects[0];
					const currentTarget = intersection.object;
					const intersectionPoint = intersection.point;

					if (heatingTarget && heatingTarget !== currentTarget) {
						stopHeating(heatingTarget);
					}

					startObjectHeating(currentTarget);
					updateLaserBeam(intersectionPoint);

				} else {
					if(heatingTarget) stopHeating(heatingTarget);
					hideLaserBeam();
				}
			} else {
				if(heatingTarget) stopHeating(heatingTarget);
				hideLaserBeam();
			}

			updateHeatingObjects(deltaTime);

			windowManager.update();
			let falloff = .05;
			sceneOffset.x += (sceneOffsetTarget.x - sceneOffset.x) * falloff;
			sceneOffset.y += (sceneOffsetTarget.y - sceneOffset.y) * falloff;
			world.position.set(sceneOffset.x, sceneOffset.y, 0);

			for (const cube of cubes) {
				if (!cube.visible) continue;
				if (cube.userData.speed) {
					cube.userData.angle += cube.userData.speed;
					if (cube.userData.parent) {
						const parent = cube.userData.parent;
						if(parent.visible) {
							cube.position.x = parent.position.x + Math.cos(cube.userData.angle) * cube.userData.radius;
							cube.position.y = parent.position.y + Math.sin(cube.userData.angle) * cube.userData.radius;
						} else {
							cube.visible = false;
						}
					} else if (cube.userData.radius) {
						cube.position.x = cube.userData.centerX + Math.cos(cube.userData.angle) * cube.userData.radius;
						cube.position.y = cube.userData.centerY + Math.sin(cube.userData.angle) * cube.userData.radius;
					}
				}
			}

			let radius = 800;
			for (const cube of cubes) {
				if (cube.userData && cube.userData.follow) {
					selectedTarget.copy(cube.position);
					radius = 400;
					break;
				}
			}

			if (isControlDown && isMouseDown) {
				fixedTheta = mouseX * Math.PI;
				fixedPhi = (mouseY + 1) * 0.5 * Math.PI;
			}

			const theta = fixedTheta !== null ? fixedTheta : 0;
			const phi = fixedPhi !== null ? fixedPhi : Math.PI / 2;
			const lerpFactor = 0.1;

			camera.position.x += ( (radius * Math.sin(phi) * Math.sin(theta) + sceneOffset.x) - camera.position.x) * lerpFactor;
			camera.position.y += ( (radius * Math.cos(phi) + sceneOffset.y) - camera.position.y) * lerpFactor;
			camera.position.z += ( (radius * Math.sin(phi) * Math.cos(theta)) - camera.position.z) * lerpFactor;
		}

		camera.lookAt(selectedTarget);
		composer.render();
	}

	function resize () {
		const width = window.innerWidth;
		const height = window.innerHeight;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize( width, height );
		composer.setSize( width, height );
	}
}