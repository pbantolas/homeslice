import * as THREE from "three";
import { ListNode, LinkedList } from "./linked-list";
import { getAppState } from "./main";

enum ClipType {
	Below,
	Above,
}

interface TriangleClipTask {
	type: ClipType;
	tri: THREE.Triangle;
}

interface LayerContours {
	contours: Float32Array[];
}

export interface SlicerBase {
	importObject(object: THREE.Object3D): void;
	stats(): void;
	slice(): boolean;
	getLayer(layerIndex: number): LayerContours;
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

		const meshSize = new THREE.Vector3();
		this.bbox.getSize(meshSize);
		this.cachedLayerCount = Math.ceil(meshSize.z / this.layerHeight);
	}

	stats() {
		if (getAppState().debug) {
			console.log("--- Slicer ---");
			console.log("Layer Height: ", this.layerHeight);
			console.log("Layers: ", this.cachedLayerCount);
		}
	}

	get layerCount(): number {
		return this.cachedLayerCount;
	}

	slice(): boolean {
		return true;
	}

	getLayer(layerIx: number): LayerContours {
		if (!this.object) return { contours: [new Float32Array(0)] };
		// TODO: process all children
		let mesh: THREE.Mesh | undefined;
		const baseObjectOffset = this.object.position;
		for (const c of this.object.children) {
			if (c instanceof THREE.Mesh) {
				mesh = c;
				break;
			}
		}
		if (!mesh) {
			if (getAppState().debug) {
				console.error("Mesh undefined");
			}
			return { contours: [new Float32Array(0)] };
		}

		layerIx = Math.min(layerIx, this.cachedLayerCount - 1);

		const posAttr = mesh.geometry.getAttribute("position");
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

			const triangleListToProcess: Array<TriangleClipTask> = [];
			for (let triIx = 0; triIx < triCount; triIx++) {
				const vtx1 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx1.setComponent(vtxIx, posAttr.array[triIx * 9 + vtxIx]);
				}
				vtx1.add(baseObjectOffset);
				const vtx2 = new THREE.Vector3();
				for (let vtxIx = 0; vtxIx < 3; ++vtxIx) {
					vtx2.setComponent(
						vtxIx,
						posAttr.array[triIx * 9 + vtxIx + 3]
					);
				}
				vtx2.add(baseObjectOffset);
				const vtx3 = new THREE.Vector3();
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

			const clippedTrianglesOut: Array<THREE.Triangle> = [];
			while (triangleListToProcess.length > 0) {
				const clippedVtx = new THREE.Vector3();
				const triangleTask =
					triangleListToProcess.pop() as TriangleClipTask;

				switch (triangleTask.type) {
					case ClipType.Below: {
						const clipResultBelow = this.clip3(
							triangleTask.tri,
							belowPlane,
							clippedVtx
						);
						if (clipResultBelow > 0) {
							const triTask1: TriangleClipTask = {
								type: ClipType.Above,
								tri: new THREE.Triangle(
									triangleTask.tri.a,
									triangleTask.tri.b,
									triangleTask.tri.c
								),
							};
							triangleListToProcess.push(triTask1);

							if (clipResultBelow > 3) {
								const triTask2: TriangleClipTask = {
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
					}

					case ClipType.Above: {
						const clipResultAbove = this.clip3(
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
					}

					default:
						break;
				}
			}

			const slicePositionBuffer: Array<number> = [];
			for (const tri of clippedTrianglesOut) {
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
			return {
				contours: [sliceVerticesView],
			};
		}

		return { contours: [new Float32Array(0)] };
	}

	private clip3(
		tri: THREE.Triangle,
		plane: THREE.Plane,
		clippedVtx: THREE.Vector3
	): number {
		const clipEps1 = 0.00001;
		const clipEps2 = 0.01;

		const v0 = tri.a.clone();
		const v1 = tri.b.clone();
		const v2 = tri.c.clone();
		const planeOffset = plane.normal.clone().multiplyScalar(plane.constant);
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

		const above: Array<boolean> = [false, false, false];
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

	private cachedFwBwEdges1?: Array<ECCEdge>;
	private cachedFwBwEdges2?: Array<ECCEdge>;

	constructor(t: THREE.Triangle) {
		this.triangle = t;
	}

	private orderVertices() {
		if (this.triangle) {
			const sortArray = [
				<ECCVertex>{ vertex: this.triangle.a, flag: 0 },
				<ECCVertex>{ vertex: this.triangle.b, flag: 1 },
				<ECCVertex>{ vertex: this.triangle.c, flag: 2 },
			];
			const edgeSortArray: Array<ECCEdge> = [
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

		if (this.cachedFwBwEdges1) return this.cachedFwBwEdges1;

		let result: Array<ECCEdge>;
		if (this.edges[0].start === this.vertexMin) {
			// oriented normal
			// group 1, 2
			result = [this.edges[1], this.edges[0]];
		} else if (this.edges[0].start === this.vertexMax) {
			result = [this.edges[0], this.edges[1]];
		} else {
			throw new Error("Incorrect match between s1 edge and vmax, vmin");
			result = [];
		}
		this.cachedFwBwEdges1 = result;
		return result;
	}

	getFwBwEdges2(): Array<ECCEdge> {
		if (
			!(this.vertexMin && this.vertexMed && this.vertexMax && this.edges)
		) {
			console.error("No triangle analysis run");
			return [];
		}

		if (this.cachedFwBwEdges2) return this.cachedFwBwEdges2;

		let result: Array<ECCEdge>;
		if (this.edges[0].start === this.vertexMin) {
			// oriented normal
			// group 1, 2
			result = [this.edges[2], this.edges[0]];
		} else if (this.edges[0].start === this.vertexMax) {
			result = [this.edges[0], this.edges[2]];
		} else {
			throw new Error("Incorrect match between s1 edge and vmax, vmin");
			result = [];
		}
		this.cachedFwBwEdges2 = result;
		return result;
	}
}

type ILLType = LinkedList<ECCIntersection>;
//type CLLType = LinkedList<ILLType>;

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
		const parentObjectOriginOffset = this.object.position;
		for (const c of this.object.children) {
			if (c instanceof THREE.Mesh) {
				mesh = c;
				break;
			}
		}
		if (!mesh) {
			throw new Error("No mesh found");
		}

		const bboxSize = new THREE.Vector3();
		new THREE.Box3().setFromObject(this.object).getSize(bboxSize);

		const posAttr = mesh.geometry.getAttribute("position");
		if (posAttr) {
			const vertexCount = posAttr.count;
			this.vertexFlags = new Float32Array(vertexCount);

			const triCount = vertexCount / 3;

			for (let triIx = 0; triIx < triCount; triIx++) {
				// this.vertexFlags[triIx * 3 + 0] = 0;
				// this.vertexFlags[triIx * 3 + 1] = 1;
				// this.vertexFlags[triIx * 3 + 2] = 2;

				const vtx0 = new THREE.Vector3();
				vtx0.setComponent(0, posAttr.array[triIx * 9 + 0]);
				vtx0.setComponent(1, posAttr.array[triIx * 9 + 1]);
				vtx0.setComponent(2, posAttr.array[triIx * 9 + 2]);
				vtx0.add(parentObjectOriginOffset);

				const vtx1 = new THREE.Vector3();
				vtx1.setComponent(0, posAttr.array[triIx * 9 + 3 + 0]);
				vtx1.setComponent(1, posAttr.array[triIx * 9 + 3 + 1]);
				vtx1.setComponent(2, posAttr.array[triIx * 9 + 3 + 2]);
				vtx1.add(parentObjectOriginOffset);

				const vtx2 = new THREE.Vector3();
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
		const planePoint = plane.normal.clone().multiplyScalar(plane.constant);
		const p0SubL0 = planePoint.clone().sub(linePoint);
		const returnedPoint = planePoint.clone();
		if (dotLN == 0) {
			if (p0SubL0.dot(plane.normal) != 0)
				throw new Error(
					"Line not contained in plane that should contain it."
				);

			// line contained in plane
			return returnedPoint;
		}

		const dist = p0SubL0.dot(plane.normal) / dotLN;

		returnedPoint.copy(lineDirection).multiplyScalar(dist).add(linePoint);
		return returnedPoint;
	}

	private checkIntersectionFromLeft(
		left: ECCIntersection | null,
		right: ECCIntersection | null
	): boolean {
		if (left === null || right === null) return false;

		const areVectorsEqual = (
			va: THREE.Vector3,
			vb: THREE.Vector3,
			tolerance: number = 1e-9
		) => {
			return (
				Math.abs(va.x - vb.x) < tolerance &&
				Math.abs(va.y - vb.y) < tolerance &&
				Math.abs(va.z - vb.z) < tolerance
			);
		};

		const leftEdge = left.edges[1];
		const rightEdge = right.edges[0];

		const directMatch =
			areVectorsEqual(leftEdge.start.vertex, rightEdge.start.vertex) &&
			areVectorsEqual(leftEdge.end.vertex, rightEdge.end.vertex);

		const reverseMatch =
			areVectorsEqual(leftEdge.end.vertex, rightEdge.start.vertex) &&
			areVectorsEqual(leftEdge.start.vertex, rightEdge.end.vertex);

		return directMatch || reverseMatch;
	}

	private insertIntersectionToCLL(
		intersection: Intersection,
		sliceIx: number
	) {
		// rule 1: if is.e2 == ill.isf.e1, forward intersection
		// rule 2: if is.e1 == ill.isl.e2, backward intersection
		let checkForward = false;
		let checkBackward = false;

		const thisSliceContourList = this.sliceArrayLL[sliceIx];

		const eccInterData: ECCIntersection = {
			intersectionPoint: intersection.intersectionVertex,
			edges: intersection.edges,
		};
		let eccInterNode = new ListNode<ECCIntersection>(eccInterData);

		let insertionSuccess = false;
		if (!thisSliceContourList) {
			const newInnerLL = new LinkedList<ECCIntersection>();
			const outerLL = new LinkedList<ILLType>();
			newInnerLL.insertNodeAtEnd(eccInterNode);
			outerLL.insertValueAtEnd(newInnerLL);
			this.sliceArrayLL[sliceIx] = outerLL;

			insertionSuccess = true;
		} else {
			let terminateInsertion = false;
			let cachedBackwardInsertionCLLNode: ListNode<ILLType> | null = null;
			thisSliceContourList.traverse(
				(
					intersectionLinkedListObject: ILLType,
					cllNode: ListNode<ILLType>
				) => {
					let backwardInsertionInThisTraversal = false;
					if (
						!checkBackward &&
						this.checkIntersectionFromLeft(
							eccInterData,
							intersectionLinkedListObject.getFront()
						)
					) {
						checkBackward = true;

						// cache position of insertion -> node of insertion
						backwardInsertionInThisTraversal = true;
						cachedBackwardInsertionCLLNode = cllNode;

						// insert IS in front
						eccInterNode =
							intersectionLinkedListObject.insertNodeAtFront(
								eccInterNode
							);
						insertionSuccess = true;

						if (checkForward) {
							// delete CLL_i
							if (intersectionLinkedListObject)
								thisSliceContourList.markNodeForDeletion(
									cllNode
								);
							terminateInsertion = true;
							return false;
						}
					}

					if (
						!checkForward &&
						this.checkIntersectionFromLeft(
							intersectionLinkedListObject.getEnd(),
							eccInterData
						)
					) {
						if (backwardInsertionInThisTraversal) {
							terminateInsertion = true;
							return false;
						}
						checkForward = true;

						eccInterNode =
							intersectionLinkedListObject.insertNodeAtEnd(
								eccInterNode
							);
						insertionSuccess = true;

						if (checkBackward) {
							// delete CLL_position (above)
							if (!cachedBackwardInsertionCLLNode)
								throw new Error(
									"Didn't cache previous insertion position"
								);
							thisSliceContourList.markNodeForDeletion(
								cachedBackwardInsertionCLLNode
							);
							terminateInsertion = true;
							return false;
						}
					}
					return true;
				}
			);
			if (terminateInsertion) return;

			if (!insertionSuccess) {
				const innerILL = new LinkedList<ECCIntersection>();
				eccInterNode = innerILL.insertNodeAtEnd(eccInterNode);
				this.sliceArrayLL[sliceIx].insertValueAtEnd(innerILL);
			}
		}
	}

	slice(): boolean {
		if (this.triangles.length > 0) {
			for (
				let triIndex = 0;
				triIndex < this.triangles.length;
				++triIndex
			) {
				this.triangles[triIndex].searchMinMaxZ();

				const zOrderedTriangleSlices = this.triangles[
					triIndex
				].getSlices(this.layerHeight);
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
				const slicePlane = new THREE.Plane(
					new THREE.Vector3(0, 0, 1),
					0
				);
				for (
					let j = zOrderedTriangleSlices[0];
					j < zOrderedTriangleSlices[1];
					j++
				) {
					slicePlane.constant = j * this.layerHeight;

					const intersectionPoint = this.linePlaneIntersect(
						slicePlane,
						fwLineDirection,
						fwBwEdges1[0].start.vertex
					);
					const intersectionEntry: Intersection = {
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

					const intersectionPoint = this.linePlaneIntersect(
						slicePlane,
						fwLine2Direction,
						fwBwEdges2[0].start.vertex
					);
					const intersectionEntry: Intersection = {
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

	getLayer(layerIndex: number): LayerContours {
		if (this.sliceArrayLL.length == 0)
			return { contours: [new Float32Array(0)] };
		// print contour list for slice x
		const sliceReport =
			this.sliceArrayLL[
				Math.min(layerIndex, this.sliceArrayLL.length - 1)
			];
		let totalIntersections = 0;
		const contourList: LayerContours = { contours: [] };
		sliceReport.traverse((cll: ILLType, _cllNode: ListNode<ILLType>) => {
			if (getAppState().debug)
				console.log("Traversing ILL, count: ", cll.getSize());

			const accumulatedIntersections: Array<number> = [];
			cll.traverse(
				(
					intersection: ECCIntersection,
					_illNode: ListNode<ECCIntersection>
				) => {
					const v = intersection.intersectionPoint;
					accumulatedIntersections.push(v.x, v.y, v.z);
					totalIntersections++;
					return true;
				}
			);

			contourList.contours.push(
				new Float32Array(accumulatedIntersections)
			);

			return true;
		});

		if (getAppState().debug) {
			console.log("Top level CLL count: ", sliceReport.getSize());
			console.log(`Total intersections retrieved: ${totalIntersections}`);
		}
		return contourList;
	}
}
