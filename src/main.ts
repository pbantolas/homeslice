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
			});

		this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000);

		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.renderer.domElement);

		const geo = new THREE.BoxGeometry( 1, 1, 1);
		const material = new THREE.MeshBasicMaterial({color: 0x00ff00});
		const cube = new THREE.Mesh(geo, material);
		this.scene.add(cube);
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
		});
		el.addEventListener('dragenter', (ev) => {
			el.classList.add('highlight');
		});
		el.addEventListener('dragleave', (ev) => {
			el.classList.remove('highlight');
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
				let mat = new THREE.MeshStandardMaterial({});
				let mesh = new THREE.Mesh(stlGeometry, mat);
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
app.addDragHandling(document.querySelector('#dropzone')!);
