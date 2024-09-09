import * as THREE from "three";

export class PipeRenderer {
	radius: number;
	pipeAssembly: THREE.Object3D;
	constructor(radius: number) {
		this.radius = radius;
		this.pipeAssembly = new THREE.Object3D();
	}

	createAssemblyForPoints(points: Array<THREE.Vector3>): THREE.Object3D {
		// get next direction
		const sectionGeo = new THREE.CylinderGeometry(
			this.radius,
			this.radius,
			1,
			8
		);
		for (let ix = 0; ix < points.length - 1; ++ix) {
			const direction: THREE.Vector3 = new THREE.Vector3();
			direction.copy(points[ix + 1]).sub(points[ix]);
			const start = points[ix];
			const end = points[ix + 1];

			const midpoint = new THREE.Vector3()
				.addVectors(start, end)
				.multiplyScalar(0.5);

			const cylLength = direction.length();
			// sectionGeo.rotateX(Math.PI / 2);
			const material = new THREE.MeshPhongMaterial({
				color: (() => {
					const r = Math.random();
					const g = Math.random();
					const b = Math.random();
					return new THREE.Color(r, g, b);
				})(),
			});
			const pipeMesh = new THREE.Mesh(sectionGeo, material);
			pipeMesh.scale.setY(cylLength);
			pipeMesh.position.copy(midpoint);

			const axis = new THREE.Vector3(0, 1, 0);
			const quat = new THREE.Quaternion().setFromUnitVectors(
				axis,
				direction.normalize()
			);
			pipeMesh.setRotationFromQuaternion(quat);
			this.pipeAssembly.add(pipeMesh);
		}
		return this.pipeAssembly;
	}
}
