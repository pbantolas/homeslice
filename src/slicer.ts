import * as THREE from 'three';
import Buffer from 'three/examples/jsm/renderers/common/Buffer';
import ClippingContext from 'three/examples/jsm/renderers/common/ClippingContext';
import NodeUniformsGroup from 'three/examples/jsm/renderers/common/nodes/NodeUniformsGroup';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

enum ClipType {
	Below,
	Above
}

interface TriangleClipTask {
	type: ClipType,
	tri: THREE.Triangle
}

export class Slicer {
	layerHeight: number = 0.2;
	object?: THREE.Object3D;
	bbox: THREE.Box3;
	private cachedLayerCount = 0;
	constructor() {
		this.bbox = new THREE.Box3();
	}

	importObject(object: THREE.Object3D) {
		this.object = object;
		this.bbox = new THREE.Box3().setFromObject(this.object);

		let meshSize = new THREE.Vector3();
		this.bbox.getSize(meshSize);
		this.cachedLayerCount = Math.ceil(meshSize.z / this.layerHeight);
	}

	stats() {
		console.log("--- Slicer ---");
		console.log("Layer Height: ", this.layerHeight);
		console.log("Layers: ", this.cachedLayerCount);
	}

	get layerCount(): number {
		return this.cachedLayerCount;
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

		layerIx = Math.min(layerIx, this.cachedLayerCount - 1);

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

			const sliceStartTime = performance.now();

			const belowPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), this.layerHeight * layerIx);
			const abovePlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), -this.layerHeight * (layerIx + 1));

			let triangleListToProcess : Array<TriangleClipTask> = [];
			for (let triIx = 0; triIx < triCount; triIx++) {
				let vtx1 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx1.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx]);
				}
				vtx1.add(baseObjectOffset);
				let vtx2 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx2.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx + 3]);
				}
				vtx2.add(baseObjectOffset);
				let vtx3 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx3.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx + 6]);
				}
				vtx3.add(baseObjectOffset);

				// let tri = new THREE.Triangle(vtx1, vtx2, vtx3);
				triangleListToProcess.push({
					type: ClipType.Below,
					tri: new THREE.Triangle(vtx1, vtx2, vtx3)
				});
			}

			let clippedTrianglesOut : Array<THREE.Triangle> = [];
			while (triangleListToProcess.length > 0) {
				let clippedVtx = new THREE.Vector3();
				let triangleTask = triangleListToProcess.pop() as TriangleClipTask;

				switch (triangleTask.type) {
					case ClipType.Below:
						let clipResultBelow = this.clip3(triangleTask.tri, belowPlane, clippedVtx);
						if (clipResultBelow > 0) {
							let triTask1 : TriangleClipTask = {
								type: ClipType.Above,
								tri: new THREE.Triangle(triangleTask.tri.a, triangleTask.tri.b, triangleTask.tri.c)
							};
							triangleListToProcess.push(triTask1);

							if (clipResultBelow > 3) {
								let triTask2: TriangleClipTask = {
									type: ClipType.Above,
									tri: new THREE.Triangle(triangleTask.tri.a, triangleTask.tri.c, clippedVtx),
								};
								triangleListToProcess.push(triTask2);
							}
						}
						break;
					
					case ClipType.Above:
						let clipResultAbove = this.clip3(triangleTask.tri, abovePlane, clippedVtx);
						if (clipResultAbove > 0) {
							clippedTrianglesOut.push(new THREE.Triangle(triangleTask.tri.a, triangleTask.tri.b, triangleTask.tri.c));
							if (clipResultAbove > 3) {
								clippedTrianglesOut.push(new THREE.Triangle(triangleTask.tri.a, triangleTask.tri.c, clippedVtx));
							}
						}
						break;
				
					default:
						break;
				}
			}

			let slicePositionBuffer: Array<number> = [];
			for (let tri of clippedTrianglesOut) {
				slicePositionBuffer.push(tri.a.x, tri.a.y, tri.a.z, tri.b.x, tri.b.y, tri.b.z, tri.c.x, tri.c.y, tri.c.z);
			}

			let sliceBufferGeometry = new THREE.BufferGeometry();
			const sliceVerticesView = new Float32Array(slicePositionBuffer);
			sliceBufferGeometry.setAttribute('position', new THREE.BufferAttribute(sliceVerticesView, 3));
			BufferGeometryUtils.mergeVertices(sliceBufferGeometry);
			sliceBufferGeometry.computeVertexNormals();

			const sliceEndTime = performance.now();
			console.log(`Slicing took ${sliceEndTime - sliceStartTime} ms`);

			return sliceBufferGeometry;
		}

		return null;
	}

	private clip3(tri: THREE.Triangle, plane: THREE.Plane, clippedVtx: THREE.Vector3) : number {
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
			clippedVtx.copy(v0);
			return 3;
		}

		let above: Array<boolean> = [false, false, false];
		above[0] = dist.x >= 0;
		above[1] = dist.y >= 0;
		above[2] = dist.z >= 0;
		let nextIsAbove = false;

		if (above[1] && !above[0]) {
			nextIsAbove = above[2];
			clippedVtx.copy(v0);
			v0.copy(v1);
			v1.copy(v2);
			v2.copy(clippedVtx);
			dist = new THREE.Vector3(dist.y, dist.z, dist.x);
		}
		else if (above[2] && !above[1]) {
			nextIsAbove = above[0];
			clippedVtx.copy(v2);
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