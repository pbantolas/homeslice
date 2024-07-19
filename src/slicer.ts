import * as THREE from 'three';
import ClippingContext from 'three/examples/jsm/renderers/common/ClippingContext';
import NodeUniformsGroup from 'three/examples/jsm/renderers/common/nodes/NodeUniformsGroup';
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

		console.log(this.bbox.min);
	}

	slice(layerIx : number): THREE.BufferGeometry | null {
		let posAttr = this.mesh?.geometry.getAttribute("position");
		let isIndexed = false;
		if (posAttr) {
			console.log("Has position attribute.");
			if (this.mesh?.geometry.index) {
				console.log("It is indexed.");
				isIndexed = true;
			}
			const vertexCount = posAttr.count;
			console.log("Num vertices: ", vertexCount);

			let triCount = 0;
			if (!isIndexed)
				triCount = vertexCount / 3;
			console.log("Num triangles: ", triCount);

			let cutPlaneMin = new THREE.Vector3(0, 0, this.bbox.min.z);
			let cutPlaneMax = new THREE.Vector3(0, 0, this.bbox.min.z + this.layerHeight);

			let slicePositionBuffer: Array<number> = [];

			let plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), this.layerHeight * layerIx);
			for (let triIx = 0; triIx < triCount; triIx++) {
				let vtx1 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx1.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx]);
				}
				let vtx2 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx2.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx + 3]);
				}
				let vtx3 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx3.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx + 6]);
				}

				let tri = new THREE.Triangle(vtx1, vtx2, vtx3);

				let clippedVtx = new THREE.Vector3();
				let triangleClippingRes = this.clip3(tri, plane, clippedVtx);

				if (triangleClippingRes > 0) {
					slicePositionBuffer.push(tri.a.x, tri.a.y, tri.a.z, tri.b.x, tri.b.y, tri.b.z, tri.c.x, tri.c.y, tri.c.z);
					if (triangleClippingRes == 4) {
						slicePositionBuffer.push(tri.a.x, tri.a.y, tri.a.z, tri.c.x, tri.c.y, tri.c.z, clippedVtx.x, clippedVtx.y, clippedVtx.z);
					}
				}
			}

			let sliceBufferGeometry = new THREE.BufferGeometry();
			const sliceVerticesView = new Float32Array(slicePositionBuffer);
			sliceBufferGeometry.setAttribute('position', new THREE.BufferAttribute(sliceVerticesView, 3));
			return sliceBufferGeometry;
		}

		return null;
	}

	clip3(tri: THREE.Triangle, plane: THREE.Plane, clippedVtx: THREE.Vector3) : number {
		const clipEps1 = 0.00001;
		const clipEps2 = 0.01;

		let v0 = tri.a.clone();
		let v1 = tri.b.clone();
		let v2 = tri.c.clone();
		let planeOffset = plane.normal.clone().multiplyScalar(plane.constant);
		v0.sub(planeOffset);
		v1.sub(planeOffset);
		v2.sub(planeOffset);

		let dist = new THREE.Vector3(v0.dot(plane.normal), v1.dot(plane.normal), v2.dot(plane.normal));

		if (!(( dist.x >= clipEps2 ) || ( dist.y >= clipEps2 ) || ( dist.z >= clipEps2 )))
			return 0;

		if ((dist.x >= -clipEps1) && (dist.y >= -clipEps1) && (dist.z >= -clipEps2)) {
			clippedVtx = v0.clone();
			return 3;
		}

		let above: Array<boolean> = [false, false, false];
		above[0] = dist.x >= 0;
		above[1] = dist.y >= 0;
		above[2] = dist.z >= 0;
		let nextIsAbove = false;

		if (above[1] && !above[0]) {
			nextIsAbove = above[2];
			clippedVtx = v0.clone();
			v0 = v1;
			v1 = v2;
			v2 = clippedVtx;
			dist = new THREE.Vector3(dist.y, dist.z, dist.x);
		}
		else if (above[2] && !above[1]) {
			nextIsAbove = above[0];
			clippedVtx = v2;
			v2 = v1;
			v1 = v0;
			v0 = clippedVtx;
			dist = new THREE.Vector3(dist.z, dist.x, dist.y);
		}
		else {
			nextIsAbove = above[1];
		}

		clippedVtx.lerpVectors(v0, v2, dist.x / (dist.x - dist.z));

		let numOutVertices = 3;
		if (nextIsAbove) {
			v2.lerpVectors(v1, v2, dist.y / ( dist.y - dist.z ));
			numOutVertices = 4;
		}
		else {
			v1.lerpVectors(v0, v1, dist.x / (dist.x - dist.y));
			v2 = clippedVtx;
			clippedVtx = v0;
			numOutVertices = 3;
		}

		tri.a = v0.add(planeOffset);
		tri.b = v1.add(planeOffset);
		tri.c = v2.add(planeOffset);
		clippedVtx.add(planeOffset);
		return numOutVertices;
	}
}