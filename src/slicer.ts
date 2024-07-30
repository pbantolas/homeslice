import * as THREE from "three";
import { tri, triNoise3D } from "three/examples/jsm/nodes/math/TriNoise3D";
import { cache } from "three/examples/jsm/nodes/Nodes";
import Buffer from "three/examples/jsm/renderers/common/Buffer";
import ClippingContext from "three/examples/jsm/renderers/common/ClippingContext";
import NodeUniformsGroup from "three/examples/jsm/renderers/common/nodes/NodeUniformsGroup";
import { ListNode, LinkedList } from "./linked-list";

enum ClipType {
	Below,
	Above,
}

interface TriangleClipTask {
	type: ClipType;
	tri: THREE.Triangle;
}

export interface SlicerBase {
	importObject(object: THREE.Object3D): void;
	stats(): void;
	slice(): Boolean;
	getLayer(layerIndex: number): Float32Array;
}

export class ClippingSlicer implements SlicerBase {
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

	slice(): Boolean {
		return true;
	}
	// getLayer(layerIx : number): THREE.BufferGeometry | null {
	getLayer(layerIx: number): Float32Array {
		if (!this.object) return new Float32Array(0);
		// TODO: process all children
		let mesh: THREE.Mesh | undefined;
		let baseObjectOffset = this.object.position;
		for (let c of this.object.children) {
			if (c instanceof THREE.Mesh) {
				mesh = c;
				break;
			}
		}
		if (!mesh) {
			console.error("Mesh undefined");
			return new Float32Array(0);
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
			if (!isIndexed) triCount = vertexCount / 3;
			console.log("Num triangles: ", triCount);

			const sliceStartTime = performance.now();

			const belowPlane = new THREE.Plane(
				new THREE.Vector3(0, 0, 1),
				this.layerHeight * layerIx
			);
			const abovePlane = new THREE.Plane(
				new THREE.Vector3(0, 0, -1),
				-this.layerHeight * (layerIx + 1)
			);

			let triangleListToProcess: Array<TriangleClipTask> = [];
			for (let triIx = 0; triIx < triCount; triIx++) {
				let vtx1 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx1.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx]);
				}
				vtx1.add(baseObjectOffset);
				let vtx2 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx2.setComponent(
						vtxIx,
						posAttr.array[triIx * 9 + vtxIx + 3]
					);
				}
				vtx2.add(baseObjectOffset);
				let vtx3 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx3.setComponent(
						vtxIx,
						posAttr.array[triIx * 9 + vtxIx + 6]
					);
				}
				vtx3.add(baseObjectOffset);

				// let tri = new THREE.Triangle(vtx1, vtx2, vtx3);
				triangleListToProcess.push({
					type: ClipType.Below,
					tri: new THREE.Triangle(vtx1, vtx2, vtx3),
				});
			}

			let clippedTrianglesOut: Array<THREE.Triangle> = [];
			while (triangleListToProcess.length > 0) {
				let clippedVtx = new THREE.Vector3();
				let triangleTask =
					triangleListToProcess.pop() as TriangleClipTask;

				switch (triangleTask.type) {
					case ClipType.Below:
						let clipResultBelow = this.clip3(
							triangleTask.tri,
							belowPlane,
							clippedVtx
						);
						if (clipResultBelow > 0) {
							let triTask1: TriangleClipTask = {
								type: ClipType.Above,
								tri: new THREE.Triangle(
									triangleTask.tri.a,
									triangleTask.tri.b,
									triangleTask.tri.c
								),
							};
							triangleListToProcess.push(triTask1);

							if (clipResultBelow > 3) {
								let triTask2: TriangleClipTask = {
									type: ClipType.Above,
									tri: new THREE.Triangle(
										triangleTask.tri.a,
										triangleTask.tri.c,
										clippedVtx
									),
								};
								triangleListToProcess.push(triTask2);
							}
						}
						break;

					case ClipType.Above:
						let clipResultAbove = this.clip3(
							triangleTask.tri,
							abovePlane,
							clippedVtx
						);
						if (clipResultAbove > 0) {
							clippedTrianglesOut.push(
								new THREE.Triangle(
									triangleTask.tri.a,
									triangleTask.tri.b,
									triangleTask.tri.c
								)
							);
							if (clipResultAbove > 3) {
								clippedTrianglesOut.push(
									new THREE.Triangle(
										triangleTask.tri.a,
										triangleTask.tri.c,
										clippedVtx
									)
								);
							}
						}
						break;

					default:
						break;
				}
			}

			let slicePositionBuffer: Array<number> = [];
			for (let tri of clippedTrianglesOut) {
				slicePositionBuffer.push(
					tri.a.x,
					tri.a.y,
					tri.a.z,
					tri.b.x,
					tri.b.y,
					tri.b.z,
					tri.c.x,
					tri.c.y,
					tri.c.z
				);
			}

			// let sliceBufferGeometry = new THREE.BufferGeometry();
			const sliceVerticesView = new Float32Array(slicePositionBuffer);
			const sliceEndTime = performance.now();
			console.log(`Slicing took ${sliceEndTime - sliceStartTime} ms`);

			// sliceBufferGeometry.setAttribute('position', new THREE.BufferAttribute(sliceVerticesView, 3));
			// BufferGeometryUtils.mergeVertices(sliceBufferGeometry);
			// sliceBufferGeometry.computeVertexNormals();
			// return sliceBufferGeometry;
			return sliceVerticesView;
		}

		return new Float32Array(0);
	}

	private clip3(
		tri: THREE.Triangle,
		plane: THREE.Plane,
		clippedVtx: THREE.Vector3
	): number {
		const clipEps1 = 0.00001;
		const clipEps2 = 0.01;

		let v0 = tri.a.clone();
		let v1 = tri.b.clone();
		let v2 = tri.c.clone();
		let planeOffset = plane.normal.clone().multiplyScalar(plane.constant);
		v0.sub(planeOffset);
		v1.sub(planeOffset);
		v2.sub(planeOffset);

		let dist = new THREE.Vector3(
			v0.dot(plane.normal),
			v1.dot(plane.normal),
			v2.dot(plane.normal)
		);

		if (!(dist.x >= clipEps2 || dist.y >= clipEps2 || dist.z >= clipEps2))
			return 0;

		if (dist.x >= -clipEps1 && dist.y >= -clipEps1 && dist.z >= -clipEps1) {
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
		} else if (above[2] && !above[1]) {
			nextIsAbove = above[0];
			clippedVtx.copy(v2);
			v2.copy(v1);
			v1.copy(v0);
			v0.copy(clippedVtx);
			dist = new THREE.Vector3(dist.z, dist.x, dist.y);
		} else {
			nextIsAbove = above[1];
		}

		clippedVtx.lerpVectors(v0, v2, dist.x / (dist.x - dist.z));

		let numOutVertices = 3;
		if (nextIsAbove) {
			v2.lerpVectors(v1, v2, dist.y / (dist.y - dist.z));
			numOutVertices = 4;
		} else {
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

/* ECC Paper */
interface ECCVertex {
	vertex: THREE.Vector3;
	flag: number;
}

interface ECCEdge {
	start: ECCVertex;
	end: ECCVertex;
}

interface Intersection {
	prev: Intersection | null;
	next: Intersection | null;
	intersectionVertex: THREE.Vector3;
	edges: ECCEdge[];
}

interface ECCIntersection {
	intersectionPoint: THREE.Vector3;
	edges: ECCEdge[];
}

interface IntersectionLL {
	first: Intersection | null;
	last: Intersection | null;
}

interface ContourNode {
	intersectionList: IntersectionLL;
	next: ContourNode | null;
}

interface ContourList {
	head: ContourNode | null;
	last: ContourNode | null;
}

class ECCTriangle {
	triangle: THREE.Triangle;
	vertexMin?: ECCVertex;
	vertexMed?: ECCVertex;
	vertexMax?: ECCVertex;
	edges?: Array<ECCEdge>;

	constructor(t: THREE.Triangle) {
		this.triangle = t;
	}

	private orderVertices() {
		if (this.triangle) {
			let sortArray = [
				<ECCVertex>{ vertex: this.triangle.a, flag: 0 },
				<ECCVertex>{ vertex: this.triangle.b, flag: 1 },
				<ECCVertex>{ vertex: this.triangle.c, flag: 2 },
			];
			let edgeSortArray: Array<ECCEdge> = [
				{ start: sortArray[0], end: sortArray[1] },
				{ start: sortArray[1], end: sortArray[2] },
				{ start: sortArray[2], end: sortArray[0] },
			];

			sortArray.sort((a: ECCVertex, b: ECCVertex) => {
				if (a.vertex.z > b.vertex.z) return 1;
				else if (a.vertex.z < b.vertex.z) return -1;
				return 0;
			});

			this.vertexMin = sortArray[0];
			this.vertexMed = sortArray[1];
			this.vertexMax = sortArray[2];

			const findEdge = (
				start: ECCVertex,
				end: ECCVertex
			): ECCEdge | undefined => {
				return edgeSortArray.find(
					(edge) =>
						(edge.start === start && edge.end === end) ||
						(edge.start === end && edge.end === start)
				);
			};

			// s1: min->max
			// s2: min->med
			// s3: med->max
			this.edges = [
				findEdge(this.vertexMin, this.vertexMax),
				findEdge(this.vertexMin, this.vertexMed),
				findEdge(this.vertexMed, this.vertexMax),
			].filter((edge) => edge != undefined) as ECCEdge[];
			if (this.edges.length < 3) {
				throw new Error("Edges have not been made");
			}
		}
	}

	searchMinMaxZ() {
		this.orderVertices();
	}

	getSlices(layerHeight: number): Array<number> {
		if (this.vertexMin && this.vertexMed && this.vertexMax) {
			return [
				Math.floor(this.vertexMin.vertex.z / layerHeight),
				Math.floor(this.vertexMed.vertex.z / layerHeight),
				Math.floor(this.vertexMax.vertex.z / layerHeight),
			];
		}

		return [];
	}

	getFwBwEdges1(): Array<ECCEdge> {
		if (
			!(this.vertexMin && this.vertexMed && this.vertexMax && this.edges)
		) {
			console.error("No triangle analysis run");
			return [];
		}

		if (this.edges[0].start === this.vertexMin) {
			// oriented normal
			// group 1, 2
			return [this.edges[1], this.edges[0]];
		} else if (this.edges[0].start === this.vertexMax) {
			return [this.edges[0], this.edges[1]];
		} else {
			throw new Error("Incorrect match between s1 edge and vmax, vmin");
			return [];
		}
	}

	getFwBwEdges2(): Array<ECCEdge> {
		if (
			!(this.vertexMin && this.vertexMed && this.vertexMax && this.edges)
		) {
			console.error("No triangle analysis run");
			return [];
		}

		if (this.edges[0].start === this.vertexMin) {
			// oriented normal
			// group 1, 2
			return [this.edges[2], this.edges[0]];
		} else if (this.edges[0].start === this.vertexMax) {
			return [this.edges[0], this.edges[2]];
		} else {
			throw new Error("Incorrect match between s1 edge and vmax, vmin");
			return [];
		}
	}
}

type ILLType = LinkedList<ECCIntersection>;
type CLLType = LinkedList<ILLType>;

export class ECCSlicer implements SlicerBase {
	private vertexFlags?: Float32Array;
	private object?: THREE.Object3D;
	private triangles: Array<ECCTriangle> = [];
	private sliceArray: ContourList[] = [];
	private sliceArrayLL: LinkedList<LinkedList<ECCIntersection>>[] = [];
	layerHeight = 0.2;

	importObject(object: THREE.Object3D) {
		this.object = object;
		// TODO: process all children
		let mesh: THREE.Mesh | null = null;
		let parentObjectOriginOffset = this.object.position;
		for (let c of this.object.children) {
			if (c instanceof THREE.Mesh) {
				mesh = c;
				break;
			}
		}
		if (!mesh) {
			console.error("No mesh found");
			return;
		}

		const bboxSize = new THREE.Vector3();
		new THREE.Box3().setFromObject(this.object).getSize(bboxSize);
		const numSlices = Math.ceil(bboxSize.z / this.layerHeight);

		let posAttr = mesh.geometry.getAttribute("position");
		if (posAttr) {
			const vertexCount = posAttr.count;
			this.vertexFlags = new Float32Array(vertexCount);

			const triCount = vertexCount / 3;

			for (let triIx = 0; triIx < triCount; triIx++) {
				// this.vertexFlags[triIx * 3 + 0] = 0;
				// this.vertexFlags[triIx * 3 + 1] = 1;
				// this.vertexFlags[triIx * 3 + 2] = 2;

				let vtx0 = new THREE.Vector3();
				vtx0.setComponent(0, posAttr.array[triIx * 9 + 0]);
				vtx0.setComponent(1, posAttr.array[triIx * 9 + 1]);
				vtx0.setComponent(2, posAttr.array[triIx * 9 + 2]);
				vtx0.add(parentObjectOriginOffset);

				let vtx1 = new THREE.Vector3();
				vtx1.setComponent(0, posAttr.array[triIx * 9 + 3 + 0]);
				vtx1.setComponent(1, posAttr.array[triIx * 9 + 3 + 1]);
				vtx1.setComponent(2, posAttr.array[triIx * 9 + 3 + 2]);
				vtx1.add(parentObjectOriginOffset);

				let vtx2 = new THREE.Vector3();
				vtx2.setComponent(0, posAttr.array[triIx * 9 + 6 + 0]);
				vtx2.setComponent(1, posAttr.array[triIx * 9 + 6 + 1]);
				vtx2.setComponent(2, posAttr.array[triIx * 9 + 6 + 2]);
				vtx2.add(parentObjectOriginOffset);

				this.triangles.push(
					new ECCTriangle(new THREE.Triangle(vtx0, vtx1, vtx2))
				);
			}
		}
	}

	stats() {}

	private linePlaneIntersect(
		plane: THREE.Plane,
		lineDirection: THREE.Vector3,
		linePoint: THREE.Vector3
	): THREE.Vector3 {
		const dotLN = lineDirection.dot(plane.normal);
		let returnedPoint = new THREE.Vector3(0, 0, 0);
		if (dotLN == 0) {
			// line parallel to plane
			return returnedPoint;
		}

		let utilVec = plane.normal.clone().multiplyScalar(plane.constant);
		utilVec.sub(linePoint);
		let dist = utilVec.dot(plane.normal) / dotLN;

		returnedPoint.copy(lineDirection).multiplyScalar(dist).add(linePoint);
		return returnedPoint;
	}

	private checkIntersectionFromLeftNew(
		left: ECCIntersection | null,
		right: ECCIntersection | null
	): Boolean {
		if (left === null || right === null) return false;

		// compare left edge 2 with right edge 1
		// if (left.edges[1] === right.edges[0]) return true;
		let sortedEdgeLeft = [
			left.edges[1].start.vertex,
			left.edges[1].end.vertex,
		].sort(
			(v1: THREE.Vector3, v2: THREE.Vector3) =>
				v1.manhattanLength() - v2.manhattanLength()
		);
		let sortedEdgeRight = [
			right.edges[0].start.vertex,
			right.edges[0].end.vertex,
		].sort(
			(v1: THREE.Vector3, v2: THREE.Vector3) =>
				v1.manhattanLength() - v2.manhattanLength()
		);

		const eps = 0.01;
		let compareVertexLoose = (v: THREE.Vector3, vother: THREE.Vector3) => {
			return (Math.abs(v.x - vother.x) < eps) && (Math.abs(v.y - vother.y) < eps) && (Math.abs(v.z - vother.z) < eps);
		};

		return compareVertexLoose(sortedEdgeLeft[0], sortedEdgeRight[0]) && compareVertexLoose(sortedEdgeLeft[1], sortedEdgeRight[1]);

		// return (
		// 	sortedEdgeLeft[0].equals(sortedEdgeRight[0]) &&
		// 	sortedEdgeLeft[1].equals(sortedEdgeRight[1])
		// );
	}

	private checkIntersectionFromLeft(
		left: Intersection | null,
		right: Intersection | null
	): Boolean {
		if (left === null || right === null) return false;

		// compare left edge 2 with right edge 1
		// if (left.edges[1] === right.edges[0]) return true;
		let sortedEdgeLeft = [
			left.edges[1].start.vertex,
			left.edges[1].end.vertex,
		].sort(
			(v1: THREE.Vector3, v2: THREE.Vector3) =>
				v1.manhattanLength() - v2.manhattanLength()
		);
		let sortedEdgeRight = [
			right.edges[0].start.vertex,
			right.edges[0].end.vertex,
		].sort(
			(v1: THREE.Vector3, v2: THREE.Vector3) =>
				v1.manhattanLength() - v2.manhattanLength()
		);

		return (
			sortedEdgeLeft[0].equals(sortedEdgeRight[0]) &&
			sortedEdgeLeft[1].equals(sortedEdgeRight[1])
		);
	}

	private insertIntersectionToCLL(
		intersection: Intersection,
		sliceIx: number
	) {
		// rule 1: if is.e2 == ill.isf.e1, forward intersection
		// rule 2: if is.e1 == ill.isl.e2, backward intersection
		let checkForward = false;
		let checkBackward = false;
		// let position = 0;
		// let cllIndex = 0;

		// let thisSliceContourList = this.sliceArray[sliceIx];
		let thisSliceContourListNew = this.sliceArrayLL[sliceIx];

		let eccInterData: ECCIntersection = {
			intersectionPoint: intersection.intersectionVertex,
			edges: intersection.edges,
		};

		// if (!thisSliceContourList) {
		// 	let newILL: IntersectionLL = {
		// 		first: intersection,
		// 		last: intersection,
		// 	};
		// 	intersection.prev = intersection;
		// 	let newCLL: ContourNode = { intersectionList: newILL, next: null };
		// 	this.sliceArray[sliceIx] = { head: newCLL, last: newCLL };
		// }

		let insertionSuccess = false;
		if (!thisSliceContourListNew) {
			const newInnerLL = new LinkedList<ECCIntersection>();
			const outerLL = new LinkedList<ILLType>();
			newInnerLL.insertAtEnd(eccInterData);
			outerLL.insertAtEnd(newInnerLL);
			this.sliceArrayLL[sliceIx] = outerLL;

			insertionSuccess = true;
		} else {
			// let contourListNode: ContourNode | null = thisSliceContourList.head;
			// let prevCLL: ContourNode | null = null;
			// let cachedCLLAtPosition: ContourNode | null = null;

			let terminateInsertion = false;
			let cachedBackwardInsertionPosition: ListNode<ILLType> | null =
				null;
			thisSliceContourListNew.traverse(
				(item: ILLType, node: ListNode<ILLType>) => {
					let backwardInsertionInThisTraversal = false;
					if (
						!checkBackward &&
						this.checkIntersectionFromLeftNew(
							eccInterData,
							item.getFront()
						)
					) {
						checkBackward = true;

						// cache position of insertion -> node of insertion
						backwardInsertionInThisTraversal = true;
						cachedBackwardInsertionPosition = node;

						// insert IS in front
						item.insertAtFront(eccInterData);
						insertionSuccess = true;

						if (checkForward) {
							// delete CLL_i
							thisSliceContourListNew.deleteNode(node);
							terminateInsertion = true;
							return false;
						}
					}

					if (
						!checkForward &&
						this.checkIntersectionFromLeftNew(
							item.getEnd(),
							eccInterData
						)
					) {
						if (backwardInsertionInThisTraversal) {
							terminateInsertion = true;
							return false;
						}
						checkForward = true;

						item.insertAtEnd(eccInterData);
						insertionSuccess = true;

						if (checkBackward) {
							// delete CLL_position (above)
							if (!cachedBackwardInsertionPosition)
								throw new Error(
									"Didn't cache previous insertion position"
								);
							thisSliceContourListNew.deleteNode(
								cachedBackwardInsertionPosition
							);
							terminateInsertion = true;
							return false;
						}
					}
					return true;
				}
			);
			if (terminateInsertion) return;

			// while (contourListNode !== null) {
			// 	if (!checkBackward && this.checkIntersectionFromLeft(intersection, contourListNode.intersectionList.first)) {
			// 		checkBackward = true;
			// 		position = cllIndex;
			// 		cachedCLLAtPosition = prevCLL;

			// 		// insert IS in front of first item in ILL
			// 		intersection.next = contourListNode.intersectionList.first;
			// 		intersection.prev = contourListNode.intersectionList.last;
			// 		if (contourListNode.intersectionList.first)
			// 			contourListNode.intersectionList.first.prev = intersection;
			// 		contourListNode.intersectionList.first = intersection;

			// 		if (checkForward) {
			// 			// delete CLL_i, stop
			// 			if (prevCLL !== null) {
			// 				prevCLL.next = contourListNode.next;
			// 			} else {
			// 				if (thisSliceContourList.head) {
			// 					thisSliceContourList.head = thisSliceContourList.head.next;
			// 				}
			// 			}
			// 			return;
			// 		}
			// 	}

			// 	if (!checkForward && this.checkIntersectionFromLeft(contourListNode.intersectionList.last, intersection)) {
			// 		if (position == cllIndex) return;

			// 		checkForward = true;

			// 		//insert IS into the back of last
			// 		intersection.prev = contourListNode.intersectionList.last;
			// 		intersection.next = null;
			// 		if (contourListNode.intersectionList.last)
			// 			contourListNode.intersectionList.last.next = intersection;
			// 		contourListNode.intersectionList.last = intersection;

			// 		if (checkBackward) {
			// 			// delete CLL_position
			// 			if (cachedCLLAtPosition) {
			// 				cachedCLLAtPosition.next = contourListNode.next;
			// 			}
			// 			else if (position == 0) {
			// 				// first elements
			// 				if (thisSliceContourList.head) {
			// 					thisSliceContourList.head = thisSliceContourList.head.next;
			// 				}
			// 			}
			// 			return;
			// 		}
			// 	}

			// 	prevCLL = contourListNode;
			// 	contourListNode = contourListNode.next;
			// 	cllIndex++;
			// }

			// nothing worked, just insert into new CLL
			// let newILL: IntersectionLL = {
			// 	first: intersection,
			// 	last: intersection
			// };
			// intersection.prev = intersection;
			// let newCLL: ContourNode = {intersectionList: newILL, next: null};
			// let lastOfSlice = this.sliceArray[sliceIx].last;
			// if (lastOfSlice !== null) {
			// 	lastOfSlice.next = newCLL;
			// }
			// this.sliceArray[sliceIx].last = newCLL;

			if (!insertionSuccess)
			{
				let innerILL = new LinkedList<ECCIntersection>();
				innerILL.insertAtEnd(eccInterData);
				this.sliceArrayLL[sliceIx].insertAtEnd(innerILL);
			}
		}
	}

	slice(): Boolean {
		if (this.triangles.length > 0) {
			for (
				let triIndex = 0;
				triIndex < this.triangles.length;
				++triIndex
			) {
				this.triangles[triIndex].searchMinMaxZ();

				let zOrderedTriangleSlices = this.triangles[triIndex].getSlices(
					this.layerHeight
				);
				if (zOrderedTriangleSlices.length == 0) {
					console.error("Some error occured");
					return false;
				}

				//judge fw/bw edge
				const fwBwEdges1 = this.triangles[triIndex].getFwBwEdges1();

				// get fw edge line def
				const fwLineDirection = new THREE.Vector3()
					.subVectors(
						fwBwEdges1[0].end.vertex,
						fwBwEdges1[0].start.vertex
					)
					.normalize();
				let slicePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
				for (
					let j = zOrderedTriangleSlices[0];
					j < zOrderedTriangleSlices[1];
					j++
				) {
					slicePlane.constant = j * this.layerHeight;

					let intersectionPoint = this.linePlaneIntersect(
						slicePlane,
						fwLineDirection,
						fwBwEdges1[0].start.vertex
					);
					let intersectionEntry: Intersection = {
						prev: null,
						next: null,
						edges: fwBwEdges1,
						intersectionVertex: intersectionPoint,
					};

					// TODO insert to ILL/CLL/SA
					this.insertIntersectionToCLL(intersectionEntry, j);
				}

				// judge fw/bw edge for upper part
				const fwBwEdges2 = this.triangles[triIndex].getFwBwEdges2();

				const fwLine2Direction = fwBwEdges2[0].end.vertex
					.clone()
					.sub(fwBwEdges2[0].start.vertex)
					.normalize();
				for (
					let k = zOrderedTriangleSlices[1];
					k < zOrderedTriangleSlices[2];
					k++
				) {
					slicePlane.constant = k * this.layerHeight;

					let intersectionPoint = this.linePlaneIntersect(
						slicePlane,
						fwLine2Direction,
						fwBwEdges2[0].start.vertex
					);
					let intersectionEntry: Intersection = {
						prev: null,
						next: null,
						edges: fwBwEdges2,
						intersectionVertex: intersectionPoint,
					};

					// TODO insert to ILL/CLL/SA
					this.insertIntersectionToCLL(intersectionEntry, k);
				}
			}
		}
		return true;
	}

	getLayer(layerIndex: number): Float32Array {
		// print contour list for slice x
		let sliceReport =
			// this.sliceArray[Math.min(layerIndex, this.sliceArray.length - 1)];
			this.sliceArrayLL[Math.min(layerIndex, this.sliceArrayLL.length - 1)];
		let sliceBuffer: Array<THREE.Vector3> = [];
		// if (sliceReport.head) {
		// 	let sliceNode: ContourNode | null = sliceReport.head;
		// 	let sliceNumber = 0;
		// 	while (sliceNode !== null) {
		// 		// console.log(`CLL ${sliceNumber}`);
		// 		let illNode = sliceNode.intersectionList.first;
		// 		let illNumber = 0;
		// 		while (illNode !== null) {
		// 			// console.log(`ILL ${illNumber}`);

		// 			let v = illNode.intersectionVertex;
		// 			sliceBuffer.push(v);
		// 			illNode = illNode.next;
		// 			illNumber++;
		// 		}

		// 		sliceNumber++;
		// 		sliceNode = sliceNode.next;
		// 	}
		// }
		sliceReport.traverse((cll: ILLType, _cllNode: ListNode<ILLType>) => {
			console.log("Traversing ILL, count: ", cll.getSize());
			cll.traverse((intersection: ECCIntersection, _illNode: ListNode<ECCIntersection>) => {
				let v = intersection.intersectionPoint;
				sliceBuffer.push(v);
				return true;
			});
			return true;
		});

		console.log("Top level CLL count: ", sliceReport.getSize());
		let posArray = [];
		for (let v3 of sliceBuffer) {
			posArray.push(v3.x, v3.y, v3.z);
		}
		let posArrayView = new Float32Array(posArray);
		return posArrayView;
	}
}
