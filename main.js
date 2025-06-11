import WindowManager from './WindowManager.js'

const t = THREE;
const textureLoader = new t.TextureLoader();
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

let camera, scene, renderer, world;
let near, far;
let pixR = window.devicePixelRatio ? window.devicePixelRatio : 1;
let cubes = [];
let sceneOffsetTarget = {x: 0, y: 0};
let sceneOffset = {x: 0, y: 0};

let mouseX = 0;
let mouseY = 0;
let fixedTheta = null;
let fixedPhi = null;
let isMouseDown = false;

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

let internalTime = getTime();
let windowManager;
let initialized = false;

// get time in seconds since beginning of the day (so that all windows use the same time)
function getTime ()
{
	return (new Date().getTime() - today) / 1000.0;
}


if (new URLSearchParams(window.location.search).get("clear"))
{
	localStorage.clear();
}
else
{
	// this code is essential to circumvent that some browsers preload the content of some pages before you actually hit the url
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

		// Listen to storage events for cameraState
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

		document.addEventListener('mousedown', () => {
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

		// Pinch-to-zoom support for touch devices
		let touchStartDist = 0;

		document.addEventListener('touchstart', (e) => {
			if (e.touches.length === 2) {
				const dx = e.touches[0].clientX - e.touches[1].clientX;
				const dy = e.touches[0].clientY - e.touches[1].clientY;
				touchStartDist = Math.sqrt(dx * dx + dy * dy);
			}
		});

		document.addEventListener('touchmove', (e) => {
			if (e.touches.length === 2) {
				const dx = e.touches[0].clientX - e.touches[1].clientX;
				const dy = e.touches[0].clientY - e.touches[1].clientY;
				const newDist = Math.sqrt(dx * dx + dy * dy);
				const delta = newDist - touchStartDist;
				camera.position.z = Math.max(200, Math.min(2000, camera.position.z - delta * 0.5));
				touchStartDist = newDist;
			}
		});

		// ## THIS IS THE MODIFIED SECTION ##
		document.addEventListener('click', (event) => {
			mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
			mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

			raycaster.setFromCamera(mouse, camera);
			const intersects = raycaster.intersectObjects(cubes);

			// If an object was clicked
			if (intersects.length > 0) {
				const clickedObject = intersects[0].object;

				// Check if the clicked object is a planet (which has an orbital radius)
				if (clickedObject.userData && clickedObject.userData.radius !== undefined) {
					const planet = clickedObject;
					selectedTarget.copy(planet.position);

					const angle = planet.userData.angle;
					fixedTheta = angle;
					fixedPhi = Math.PI / 2.5;

					// Enable follow behavior
					planet.userData.follow = true;

					// Save camera state for other windows
					const cameraState = {
						target: selectedTarget.toArray(),
						theta: fixedTheta,
						phi: fixedPhi
					};
					localStorage.setItem("cameraState", JSON.stringify(cameraState));

				} else {
					// If the clicked object is the Sun (or an orbit line), reset the view
					selectedTarget = new t.Vector3(0, 0, 0);
					fixedTheta = Math.PI / 4;
					fixedPhi = Math.PI / 2.5;

					const cameraState = {
						target: selectedTarget.toArray(),
						theta: fixedTheta,
						phi: fixedPhi
					};
					localStorage.setItem("cameraState", JSON.stringify(cameraState));
				}

			} else {
				// If empty space was clicked, reset to default view
				selectedTarget = new t.Vector3(0, 0, 0);
				fixedTheta = Math.PI / 4;
				fixedPhi = Math.PI / 2.5;

				const cameraState = {
					target: selectedTarget.toArray(),
					theta: fixedTheta,
					phi: fixedPhi
				};
				localStorage.setItem("cameraState", JSON.stringify(cameraState));
			}
		});

		// Global keyboard event listener for resetting camera with 'r'
		document.addEventListener('keydown', (e) => {
			if (e.key === 'r') {
				// Reset camera to default view
				selectedTarget = new t.Vector3(0, 0, 0);
				fixedTheta = Math.PI / 4;
				fixedPhi = Math.PI / 2.5;
				camera.position.set(0, 0, 800);
				const cameraState = {
					target: selectedTarget.toArray(),
					theta: fixedTheta,
					phi: fixedPhi
				};
				localStorage.setItem("cameraState", JSON.stringify(cameraState));
			}
		});

		// add a short timeout because window.offsetX reports wrong values before a short period
		setTimeout(() => {
			setupScene();
			setupWindowManager();
			resize();
			updateWindowShape(false);
			render();
			window.addEventListener('resize', resize);
		}, 500)
	}

	function setupScene ()
	{
		camera = new t.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
		camera.position.set(0, 0, 800);
		const screenX = window.screenX;
		const screenY = window.screenY;
		sceneOffsetTarget = { x: -screenX, y: -screenY };
		sceneOffset = { x: -screenX, y: -screenY };
		fixedTheta = Math.PI / 4;
		fixedPhi = Math.PI / 2.5;
		selectedTarget = new t.Vector3(0, 0, 0);

		scene = new t.Scene();
		scene.background = starTexture;
		scene.add( camera );

		const ambientLight = new t.AmbientLight(0x404040);
		scene.add(ambientLight);

		const pointLight = new t.PointLight(0xffffff, 1.5, 2000);
		pointLight.position.set(0, 0, 1000);
		scene.add(pointLight);

		renderer = new t.WebGLRenderer({antialias: true, depthBuffer: true});
		renderer.setPixelRatio(pixR);

		world = new t.Object3D();
		scene.add(world);

		renderer.domElement.setAttribute("id", "scene");
		document.body.appendChild( renderer.domElement );
	}

	function setupWindowManager ()
	{
		windowManager = new WindowManager();
		windowManager.setWinShapeChangeCallback(updateWindowShape);
		windowManager.setWinChangeCallback(windowsUpdated);

		// here you can add your custom metadata to each windows instance
		let metaData = {foo: "bar"};

		// this will init the windowmanager and add this window to the centralised pool of windows
		windowManager.init(metaData);

		// call update windows initially (it will later be called by the win change callback)
		windowsUpdated();
	}

	function windowsUpdated ()
	{
		updateNumberOfCubes();
	}

	function updateNumberOfCubes () {
		let wins = windowManager.getWindows();

		// remove all objects
		cubes.forEach((c) => {
			world.remove(c);
		});
		cubes = [];

		const centerX = 0;
		const centerY = 0;

		// Create a central sun
		const sun = new t.Mesh(
			new t.SphereGeometry(60, 64, 64),
			new t.MeshBasicMaterial({ map: sunTexture })
		);
		sun.position.set(centerX, centerY, 0);
		world.add(sun);
		cubes.push(sun);

		// Planet data
		const planetsData = [
			{ name: "Mercury", color: 0xaaaaaa, radius: 100, size: 10, speed: 0.02 },
			{ name: "Venus",   color: 0xffcc66, radius: 140, size: 12, speed: 0.015 },
			{ name: "Earth",   color: 0x3399ff, radius: 180, size: 14, speed: 0.012 },
			{ name: "Mars",    color: 0xff6633, radius: 220, size: 11, speed: 0.010 },
			{ name: "Jupiter", color: 0xffcc99, radius: 280, size: 20, speed: 0.008 },
			{ name: "Saturn",  color: 0xffff99, radius: 340, size: 18, speed: 0.006 },
			{ name: "Uranus",  color: 0x66ffff, radius: 400, size: 16, speed: 0.005 },
			{ name: "Neptune", color: 0x6666ff, radius: 460, size: 16, speed: 0.004 }
		];

		for (const planetData of planetsData) {
			// Orbit Line
			const orbitPoints = [];
			for (let i = 0; i <= 100; i++) {
				const angle = (i / 100) * Math.PI * 2;
				orbitPoints.push(new t.Vector3(
					Math.cos(angle) * planetData.radius,
					Math.sin(angle) * planetData.radius,
					0
				));
			}
			const orbit = new t.Line(
				new t.BufferGeometry().setFromPoints(orbitPoints),
				new t.LineBasicMaterial({ color: 0x888888 })
			);
			orbit.position.set(centerX, centerY, 0);
			world.add(orbit);
			cubes.push(orbit);

			// Planet
			const planet = new t.Mesh(
				new t.SphereGeometry(planetData.size, 64, 64),
				new t.MeshStandardMaterial({
					map:
						planetData.name === "Mercury" ? mercuryTexture :
							planetData.name === "Venus" ? venusTexture :
								planetData.name === "Earth" ? earthTexture :
									planetData.name === "Mars" ? marsTexture :
										planetData.name === "Jupiter" ? jupiterTexture :
											planetData.name === "Saturn" ? saturnTexture :
												planetData.name === "Uranus" ? uranusTexture :
													planetData.name === "Neptune" ? neptuneTexture : null,
					color:
						planetData.name === "Mercury" ||
						planetData.name === "Venus" ||
						planetData.name === "Earth" ||
						planetData.name === "Mars" ||
						planetData.name === "Jupiter" ||
						planetData.name === "Saturn" ||
						planetData.name === "Uranus" ||
						planetData.name === "Neptune"
							? 0xffffff : planetData.color
				})
			);
			planet.userData = {
				radius: planetData.radius,
				angle: Math.random() * Math.PI * 2,
				speed: planetData.speed,
				centerX,
				centerY
			};
			planet.position.x = centerX + Math.cos(planet.userData.angle) * planet.userData.radius;
			planet.position.y = centerY + Math.sin(planet.userData.angle) * planet.userData.radius;

			world.add(planet);
			cubes.push(planet);

			if (planetData.name === "Earth") {
				const moon = new t.Mesh(
					new t.SphereGeometry(4, 32, 32),
					new t.MeshStandardMaterial({ map: moonTexture })
				);
				moon.userData = {
					parent: planet,
					angle: Math.random() * Math.PI * 2,
					speed: 0.05,
					radius: 25
				};
				world.add(moon);
				cubes.push(moon);
			}

			// Add rings for Jupiter, Uranus, Neptune, and Saturn
			if (planetData.name === "Saturn") {
				const ringGeometry = new t.RingGeometry(planetData.size + 8, planetData.size + 20, 64);
				const ringMaterial = new t.MeshBasicMaterial({
					map: saturnRingTexture,
					side: t.DoubleSide,
					transparent: true
				});
				const ring = new t.Mesh(ringGeometry, ringMaterial);
				ring.rotation.x = Math.PI / 2;
				planet.add(ring);
			} else if (planetData.name === "Jupiter" || planetData.name === "Uranus" || planetData.name === "Neptune") {
				const ringGeometry = new t.RingGeometry(planetData.size + 3, planetData.size + 8, 64);
				const ringMaterial = new t.MeshBasicMaterial({
					color: 0x999999,
					side: t.DoubleSide,
					transparent: true,
					opacity: 0.5
				});
				const ring = new t.Mesh(ringGeometry, ringMaterial);
				ring.rotation.x = Math.PI / 2;
				planet.add(ring);
			}
		}
	}

	function updateWindowShape(easing = true) {
		// Set offset so that the camera aligns based on the top-left corner of the current window
		const x = window.screenX;
		const y = window.screenY;
		sceneOffsetTarget = { x: -x, y: -y };
		if (!easing) sceneOffset = sceneOffsetTarget;
	}


	function render ()
	{
		let t = getTime();

		windowManager.update();

		try {
			const sharedCameraState = JSON.parse(localStorage.getItem("cameraState"));
			if (sharedCameraState &&
				Array.isArray(sharedCameraState.target) &&
				typeof sharedCameraState.theta === "number" &&
				typeof sharedCameraState.phi === "number") {
				selectedTarget.set(...sharedCameraState.target);
				fixedTheta = sharedCameraState.theta;
				fixedPhi = sharedCameraState.phi;
			}
		} catch (e) {
			console.warn("Failed to parse camera state", e);
		}

		// calculate the new position based on the delta between current offset and new offset times a falloff value (to create the nice smoothing effect)
		let falloff = .05;
		sceneOffset.x = sceneOffset.x + ((sceneOffsetTarget.x - sceneOffset.x) * falloff);
		sceneOffset.y = sceneOffset.y + ((sceneOffsetTarget.y - sceneOffset.y) * falloff);

		// set the world position to the offset
		world.position.x = sceneOffset.x;
		world.position.y = sceneOffset.y;

		// Animate planets (not the sun or orbits)
		for (let i = 0; i < cubes.length; i++) {
			const cube = cubes[i];
			if (cube.userData && cube.userData.radius !== undefined) {
				cube.userData.angle += cube.userData.speed;
				cube.position.x = cube.userData.centerX + Math.cos(cube.userData.angle) * cube.userData.radius;
				cube.position.y = cube.userData.centerY + Math.sin(cube.userData.angle) * cube.userData.radius;
			}
			if (cube.userData && cube.userData.parent) {
				cube.userData.angle += cube.userData.speed;
				const parent = cube.userData.parent;
				cube.position.x = parent.position.x + Math.cos(cube.userData.angle) * cube.userData.radius;
				cube.position.y = parent.position.y + Math.sin(cube.userData.angle) * cube.userData.radius;
			}
		}

		// Camera follow and zoom logic
		let radius = 800; // Default zoom
		let following = false;
		for (const cube of cubes) {
			if (cube.userData && cube.userData.follow) {
				selectedTarget.copy(cube.position);  // Camera follows the planet
				radius = 400; // Zoom in when following
				following = true;
			}
		}
		if (!following) {
			// When not following anything, ensure the target is the center
			selectedTarget.set(0, 0, 0);
		}

		if (isMouseDown) {
			fixedTheta = mouseX * Math.PI;
			fixedPhi = (mouseY + 1) * 0.5 * Math.PI;
		}
		const theta = fixedTheta !== null ? fixedTheta : 0;
		const phi = fixedPhi !== null ? fixedPhi : Math.PI / 2;

		// Compute new target camera position
		const targetCamX = radius * Math.sin(phi) * Math.sin(theta) + sceneOffset.x;
		const targetCamY = radius * Math.cos(phi) + sceneOffset.y;
		const targetCamZ = radius * Math.sin(phi) * Math.cos(theta);
		// Smooth camera motion (lerp)
		const lerpFactor = 0.1;
		camera.position.x += (targetCamX - camera.position.x) * lerpFactor;
		camera.position.y += (targetCamY - camera.position.y) * lerpFactor;
		camera.position.z += (targetCamZ - camera.position.z) * lerpFactor;
		if (selectedTarget) camera.lookAt(selectedTarget);

		renderer.render(scene, camera);
		localStorage.setItem("selectedTarget", JSON.stringify(selectedTarget.toArray()));
		localStorage.setItem("cameraPosition", JSON.stringify(camera.position.toArray()));

		localStorage.setItem("cameraState", JSON.stringify({
			target: selectedTarget.toArray(),
			theta: fixedTheta,
			phi: fixedPhi
		}));

		// Clear all follow flags except the one matching selectedTarget
		for (const cube of cubes) {
			if (cube.userData && cube.userData.follow) {
				// Ensure only the currently selected one is followed
				if (!cube.position.equals(selectedTarget)) {
					cube.userData.follow = false;
				}
			}
		}

		requestAnimationFrame(render);
	}


	// resize the renderer to fit the window size
	function resize ()
	{
		let width = window.innerWidth;
		let height = window.innerHeight

		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize( width, height );
	}
}