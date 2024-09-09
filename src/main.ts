import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { ECCSlicer, SlicerBase } from "./slicer";
import { PipeRenderer } from "./renderer";
import WebGPURenderer from "three/examples/jsm/renderers/webgpu/WebGPURenderer";

class App {
	scene: THREE.Scene;
	camera: THREE.Camera;
	// renderer: THREE.WebGLRenderer;
	renderer: WebGPURenderer;
	cameraController: OrbitControls;
	sceneGraph: THREE.Object3D[];
	statusBar: HTMLElement | null;
	activeSlicer?: SlicerBase;
	debug = false;

	constructor(statusBar: HTMLElement | null) {
		this.scene = new THREE.Scene();
		this.sceneGraph = [];
		this.statusBar = statusBar;

		THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);

		if (this.statusBar) {
			this.statusBar.innerText = "No file loaded!";
		}

		new RGBELoader()
			.setPath("assets/")
			.load("machine_shop_01_1k.hdr", (texture) => {
				texture.mapping = THREE.EquirectangularReflectionMapping;
				this.scene.environment = texture;
				this.scene.environmentRotation.set(Math.PI / 2, 0, Math.PI / 2);
				this.scene.environmentIntensity = 0.7;
				this.scene.background = new THREE.Color("rgb(20, 20, 20)");
				// this.scene.background = texture;
				// this.scene.backgroundRotation = this.scene.environmentRotation;
			});

		this.camera = new THREE.PerspectiveCamera(
			75,
			window.innerWidth / window.innerHeight,
			0.1,
			1000
		);

		// this.renderer = new THREE.WebGLRenderer();
		this.renderer = new WebGPURenderer();
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.renderer.domElement);

		this.cameraController = new OrbitControls(
			this.camera,
			this.renderer.domElement
		);

		const light = new THREE.DirectionalLight(0xffffff, 1.0);
		light.position.set(1, 0, 1);
		light.castShadow = true;
		light.shadow.camera.top = 100;
		light.shadow.camera.bottom = -100;
		light.shadow.camera.left = -100;
		light.shadow.camera.right = 100;
		light.shadow.mapSize.width = 512;
		light.shadow.mapSize.height = 512;
		light.shadow.camera.near = 1;
		light.shadow.camera.far = 500;
		this.scene.add(light);

		this.camera.position.z = 80;
		this.camera.position.y = 200;
		this.camera.lookAt(new THREE.Vector3(0, 0, 0));
		this.cameraController.update();

		if (this.debug) {
			const originGeo = new THREE.SphereGeometry(0.7, 8, 8);
			const basicMat = new THREE.MeshBasicMaterial({
				depthTest: false,
				color: 0xff0000,
			});
			const originMesh = new THREE.Mesh(originGeo, basicMat);
			originMesh.renderOrder = 999;
			this.scene.add(originMesh);
		}

		// const planeGeo = new THREE.PlaneGeometry(100, 100);
		// const planeMat = new THREE.MeshStandardMaterial({color: 0x00ff00, transparent: true, opacity: 0.5});
		// const planeMesh = new THREE.Mesh(planeGeo, planeMat);
		// this.scene.add(planeMesh);
		// planeMesh.position.z = 2.2;
		// planeMesh.rotation.x = -Math.PI/2;
		// const gridHelper = new THREE.GridHelper(250, 10);
		// this.scene.add(gridHelper)

		const gltfLoader = new GLTFLoader();
		gltfLoader.load(
			"assets/pei_plate_2.glb",
			(gltf) => {
				gltf.scene.scale.set(100, 100, 100);
				gltf.scene.traverse((node) => {
					if (node.isObject3D) {
						node.receiveShadow = true;
						if (node instanceof THREE.Mesh) {
							node.material.color.setHex(0x26262a);
						}
					}
				});
				this.scene.add(gltf.scene);
			},
			undefined,
			(err) => {
				console.error(err);
			}
		);

		this.renderer.setAnimationLoop(() => {
			this.animate();
		});
	}

	addDragHandling(el: HTMLElement) {
		window.addEventListener("dragover", (ev) => {
			ev.preventDefault();
		});
		el.addEventListener("drop", (ev) => {
			ev.preventDefault();
			const files = ev.dataTransfer!.files;
			const allowedExtensions = /(\.stl)$/i;
			if (allowedExtensions.exec(files[0].name)) {
				console.log(`Loading STL: ${files[0].name}`);
				this.loadFile(files[0]);
			}
			el.classList.remove("active");
		});
		window.addEventListener("dragenter", (ev) => {
			ev.preventDefault();
			el.classList.add("active");
		});
		el.addEventListener("dragleave", (ev) => {
			ev.preventDefault();
			el.classList.remove("active");
		});
	}

	addScrollHandling(el: HTMLElement) {
		document.addEventListener("wheel", (evt) => {
			evt.preventDefault();
			const { deltaX, deltaY } = evt;

			this.camera.translateZ(-deltaY * 0.1);
		});
	}

	groundGeometry(g: THREE.BufferGeometry): number {
		if (!g.boundingBox) {
			g.computeBoundingBox();
		}
		const bbox = g.boundingBox;
		let yOffset = 0;
		if (bbox) {
			yOffset = bbox.min.z;
		}

		return yOffset;
	}

	animate() {
		// this.sceneGraph.forEach((m) => {
		// 	m.rotation.y += 0.005;
		// });
		this.cameraController.update();
		this.renderer.render(this.scene, this.camera);
	}

	loadFile(f: File) {
		const reader = new FileReader();
		reader.addEventListener("load", (ev) => {
			if (reader.readyState == FileReader.DONE && reader.result != null) {
				const loader = new STLLoader();
				const stlGeometry = loader.parse(reader.result);
				let mat: THREE.Material = new THREE.MeshStandardMaterial({
					color: 0x333333,
					side: THREE.DoubleSide,
				});
				if (this.debug) {
					mat = new THREE.MeshBasicMaterial({ wireframe: true });
				}

				// stlGeometry.center();

				const mesh = new THREE.Mesh(stlGeometry, mat);
				// mesh.receiveShadow = true;
				mesh.castShadow = true;

				stlGeometry.computeVertexNormals();
				stlGeometry.computeBoundingBox();

				const slicerInputGroup = new THREE.Group();
				slicerInputGroup.add(mesh);

				const stlViewerGroup = new THREE.Group();
				stlViewerGroup.add(
					new THREE.Mesh(
						stlGeometry,
						new THREE.MeshBasicMaterial({
							wireframe: true,
							opacity: 0.2,
							transparent: true,
							color: 0xffc8dd,
						})
					)
				);
				// stlViewerGroup.scale.set(1.05, 1.05, 1.05);

				const bbox = stlGeometry.boundingBox;
				const groupGroundOffsetZ = new THREE.Vector3();
				if (bbox) {
					const bboxSize = new THREE.Vector3();
					bbox.getSize(bboxSize);

					groupGroundOffsetZ.z = -bbox.min.z;
					groupGroundOffsetZ.x = -bbox.min.x - bboxSize.x / 2.0;
					groupGroundOffsetZ.y = -bbox.min.y - bboxSize.y / 2.0;
					if (this.statusBar)
						this.statusBar.innerHTML = `${f.name}: ${
							Math.round(bboxSize.x * 100) / 100
						} x ${Math.round(bboxSize.y * 100) / 100} x ${
							Math.round(bboxSize.z * 100) / 100
						}`;
				}

				slicerInputGroup.position.copy(groupGroundOffsetZ);
				stlViewerGroup.position.copy(groupGroundOffsetZ);

				for (const m of this.sceneGraph) {
					this.scene.remove(m);
				}
				this.sceneGraph = [];
				// this.scene.add(slicerInputGroup);
				// this.sceneGraph.push(slicerInputGroup);
				this.scene.add(stlViewerGroup);
				this.sceneGraph.push(stlViewerGroup);

				// this.activeSlicer = new ClippingSlicer();
				this.activeSlicer = new ECCSlicer();

				if (this.activeSlicer) {
					this.activeSlicer.importObject(slicerInputGroup);
					this.activeSlicer.stats();
					this.activeSlicer.slice();

					const slicedGeometry = this.activeSlicer.getLayer(10);
					const points = [];
					for (
						let triple = 0;
						triple < slicedGeometry.length / 3;
						triple++
					) {
						points.push(
							new THREE.Vector3(
								slicedGeometry[triple * 3 + 0],
								slicedGeometry[triple * 3 + 1],
								slicedGeometry[triple * 3 + 2]
							)
						);
					}

					const pipes = new PipeRenderer(0.1);
					const pipeObject = pipes.createAssemblyForPoints(points);
					this.scene.add(pipeObject);
					this.sceneGraph.push(pipeObject);
				}
			}
		});

		reader.readAsArrayBuffer(f);
	}
}

const app: App = new App(document.querySelector("#status-bar"));
//app.addScrollHandling(document.querySelector('canvas')!);
app.addDragHandling(document.querySelector("#dropzone")!);
