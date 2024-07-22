import * as THREE from 'three';
import ClippingContext from 'three/examples/jsm/renderers/common/ClippingContext';
import NodeUniformsGroup from 'three/examples/jsm/renderers/common/nodes/NodeUniformsGroup';
export class Slicer {
	layerHeight: number = 0.2;
	object?: THREE.Object3D;
	bbox: THREE.Box3;
	constructor() {
		this.bbox = new THREE.Box3();
	}

	importObject(object: THREE.Object3D) {
		this.object = object;
		this.bbox = new THREE.Box3().setFromObject(this.object);
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
		if (!this.object) return null;
		// TODO: process all children
		let mesh : THREE.Mesh | undefined;
		let baseObjectOffset = this.object.position;
		for (let c of this.object.children) {
			if (c instanceof THREE.Mesh) {
				mesh = c;
				break;
			}
		}
		if (!mesh) {
			console.error("Mesh undefined");
			return null;
		}

		let posAttr = mesh.geometry.getAttribute("position");
		let isIndexed = false;
		if (posAttr) {
			console.log("Has position attribute.");
			if (mesh.geometry.index) {
				console.log("It is indexed.");
				isIndexed = true;
			}
			const vertexCount = posAttr.count;
			console.log("Num vertices: ", vertexCount);

			let triCount = 0;
			if (!isIndexed)
				triCount = vertexCount / 3;
			console.log("Num triangles: ", triCount);

			let slicePositionBuffer: Array<number> = [];

			const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), this.layerHeight * layerIx);
			for (let triIx = 0; triIx < triCount; triIx++) {
				let vtx1 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx1.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx]);
					vtx1.add(baseObjectOffset);
				}
				let vtx2 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx2.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx + 3]);
					vtx2.add(baseObjectOffset);
				}
				let vtx3 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx3.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx + 6]);
					vtx3.add(baseObjectOffset);
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

		if ((dist.x >= -clipEps1) && (dist.y >= -clipEps1) && (dist.z >= -clipEps1)) {
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
			v0.copy(v1);
			v1.copy(v2);
			v2.copy(clippedVtx);
			dist = new THREE.Vector3(dist.y, dist.z, dist.x);
		}
		else if (above[2] && !above[1]) {
			nextIsAbove = above[0];
			clippedVtx = v2.clone();
			v2.copy( v1 );
			v1.copy( v0 );
			v0.copy( clippedVtx );
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
			v2.copy(clippedVtx);
			clippedVtx.copy(v0);
			numOutVertices = 3;
		}

		tri.a = v0.add(planeOffset);
		tri.b = v1.add(planeOffset);
		tri.c = v2.add(planeOffset);
		clippedVtx.add(planeOffset);
		return numOutVertices;
	}
}