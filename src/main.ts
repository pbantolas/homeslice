import * as THREE from 'three';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader';

class App {
	scene: THREE.Scene;
	camera: THREE.Camera;
	renderer: THREE.WebGLRenderer;
	loadedMeshes: THREE.Mesh[];

	constructor() {
		this.scene = new THREE.Scene();
		this.loadedMeshes = [];

		new RGBELoader()
			.setPath( 'assets/')
			.load('machine_shop_01_1k.hdr', (texture) => {
				texture.mapping = THREE.EquirectangularReflectionMapping;
				this.scene.background = texture;
				this.scene.environment = texture;
				this.scene.environmentIntensity = 0.8;
			});

		this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000);

		this.renderer = new THREE.WebGLRenderer();
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.renderer.domElement);


		const light = new THREE.DirectionalLight(0xffffff, 10.0);
		light.position.set(0, 0, -1);
		light.castShadow = true;
		this.scene.add(light);

		light.shadow.mapSize.width = 512;
		light.shadow.mapSize.height = 512;
		light.shadow.camera.near = 0.5;
		light.shadow.camera.far = 500;

		this.camera.position.z = 50;

		this.renderer.setAnimationLoop(() => {
			this.animate();
		});
	}

	addDragHandling(el : HTMLElement) {
		el.addEventListener('dragover', (ev) => {
			ev.preventDefault();
		});
		el.addEventListener('drop', (ev) => {
			ev.preventDefault();
			const files = ev.dataTransfer!.files;
			const allowedExtensions = /(\.stl)$/i;
			if (allowedExtensions.exec(files[0].name)) {
				console.log(`Loading STL: ${files[0].name}`);
				this.loadFile(files[0]);
			}
			el.classList.remove('highlight');
		});
		el.addEventListener('dragenter', (ev) => {
			el.classList.add('highlight');
		});
		el.addEventListener('dragleave', (ev) => {
			el.classList.remove('highlight');
		});
	}

	addScrollHandling(el : HTMLElement) {
		document.addEventListener('wheel', (evt) => {
			evt.preventDefault();
			const {deltaX, deltaY} = evt;

			this.camera.position.z -= deltaY * 0.01;
		});
	}

	animate() {
		this.loadedMeshes.forEach((m) => {
			m.rotation.y += 0.005;
		});
		this.renderer.render(this.scene, this.camera);
	}

	loadFile(f : File) {
		const reader = new FileReader();
		reader.addEventListener('load', (ev) => {
			if (reader.readyState == FileReader.DONE && reader.result != null) {
				const loader = new STLLoader();
				let stlGeometry = loader.parse(reader.result);
				let mat = new THREE.MeshStandardMaterial({color: 0xaaaaaa});
				let mesh = new THREE.Mesh(stlGeometry, mat);
				mesh.receiveShadow = true;
				mesh.castShadow = true;
				stlGeometry.center();
				this.scene.add(mesh);
				if (this.loadedMeshes.length > 0) {
					this.scene.remove(this.loadedMeshes[0]);
				} else {
					this.loadedMeshes.push(new THREE.Mesh());
				}
				this.loadedMeshes[0] = mesh;
			}
		});

		reader.readAsArrayBuffer(f);
	}
}

const app : App = new App();
app.addScrollHandling(document.querySelector('canvas')!);
app.addDragHandling(document.querySelector('#dropzone')!);
