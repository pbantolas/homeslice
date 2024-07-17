import * as THREE from 'three';
export class Slicer {
	layerHeight: number = 0.2;
	mesh?: THREE.Mesh;
	bbox: THREE.Box3;
	constructor() {
		//
		this.bbox = new THREE.Box3();
	}

	importMesh(mesh: THREE.Mesh) {
		this.mesh = mesh;
		this.bbox = this.mesh.geometry.boundingBox!;
	}

	stats() {
		console.log("--- Slicer ---");
		console.log("Layer Height: ", this.layerHeight);

		let meshSize = new THREE.Vector3();
		this.bbox.getSize(meshSize);
		let nSlices = meshSize.z / this.layerHeight;

		console.log("Layers: ", nSlices);
	}
}