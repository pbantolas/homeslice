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
			const material = new THREE.MeshBasicMaterial({
				color: new THREE.Color(0xea580c),
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

	createAssemblyForBuffer(pointsBuffer: Float32Array): THREE.Object3D {
		// get next direction
		const sectionGeo = new THREE.CylinderGeometry(
			this.radius,
			this.radius,
			1,
			8
		);

		// number of actual points is pointsBuffer.length / 3
		const pointCount = pointsBuffer.length / 3;

		const material = new THREE.MeshBasicMaterial({
			color: new THREE.Color(
				"hsl(" + Math.round(Math.random() * 360) + ", 95%, 53%)"
			),
		});
		for (let ix = 0; ix < pointCount - 1; ++ix) {
			const firstIndex = ix;
			const secondIndex = (ix + 1) % pointCount;
			const startVertex = new THREE.Vector3(
				pointsBuffer[firstIndex * 3 + 0],
				pointsBuffer[firstIndex * 3 + 1],
				pointsBuffer[firstIndex * 3 + 2]
			);
			const endVertex = new THREE.Vector3(
				pointsBuffer[secondIndex * 3 + 0],
				pointsBuffer[secondIndex * 3 + 1],
				pointsBuffer[secondIndex * 3 + 2]
			);
			const direction = endVertex.clone().sub(startVertex);

			const midpoint = new THREE.Vector3()
				.addVectors(startVertex, endVertex)
				.multiplyScalar(0.5);

			const cylLength = direction.length();
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
