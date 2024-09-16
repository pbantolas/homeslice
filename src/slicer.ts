import * as THREE from "three";
import { ListNode, LinkedList } from "./linked-list";
import { veryClose } from "./util";

interface LayerContours {
	contours: Float32Array[];
}

export interface SlicerBase {
	importObject(object: THREE.Object3D): void;
	stats(): void;
	slice(): boolean;
	getLayer(layerIndex: number): LayerContours;
	isSlicingComplete: boolean;
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

	private cachedSlicedEdgePairForPhase: Array<Array<ECCEdge>>;

	constructor(t: THREE.Triangle) {
		this.triangle = t;
		this.cachedSlicedEdgePairForPhase = new Array(2);
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

	getSlicedEdgePairForPhase(phase: number): Array<ECCEdge> {
		if (
			!(this.vertexMin && this.vertexMed && this.vertexMax && this.edges)
		) {
			console.error("No triangle analysis run");
			return [];
		}

		if (phase < 0 || phase > 1)
			throw new Error("Part index should be 0 or 1");

		if (this.cachedSlicedEdgePairForPhase[phase])
			return this.cachedSlicedEdgePairForPhase[phase];

		let result: Array<ECCEdge>;
		const secondEdge = this.edges[phase + 1];
		if (this.edges[0].start === this.vertexMin) {
			// oriented normal
			// group 1, 2
			result = [secondEdge, this.edges[0]];
		} else if (this.edges[0].start === this.vertexMax) {
			result = [this.edges[0], secondEdge];
		} else {
			throw new Error("Edge 0 is not spanning [vmin, vmax]");
		}
		this.cachedSlicedEdgePairForPhase[phase] = result;
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
	isSlicingComplete: boolean = false;
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
		// lineDirection: THREE.Vector3,
		edge: ECCEdge
		// linePoint: THREE.Vector3
	): THREE.Vector3 | undefined {
		const edgeDirection = edge.end.vertex.clone().sub(edge.start.vertex);
		const dotLN = edgeDirection.dot(plane.normal);
		const planePoint = plane.normal.clone().multiplyScalar(plane.constant);
		const returnedPoint = planePoint.clone();
		if (Math.abs(dotLN) < 1e-4) {
			const p0SubL0 = planePoint.clone().sub(edge.start.vertex);
			if (Math.abs(p0SubL0.dot(plane.normal)) > 1e-4)
				throw new Error(
					"Line not contained in plane that should contain it."
				);

			// line contained in plane
			return returnedPoint;
		}

		const t = plane.normal.dot(planePoint.sub(edge.start.vertex)) / dotLN;

		returnedPoint
			.copy(edgeDirection)
			.multiplyScalar(t)
			.add(edge.start.vertex);
		const isCloseToStart =
			edge.start.vertex.distanceTo(returnedPoint) < 1e-4;
		const isCloseToEnd = edge.end.vertex.distanceTo(returnedPoint) < 1e-4;
		if (t < 0 || t > 1) {
			if (!isCloseToStart && !isCloseToEnd) return undefined;
		}
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
			tolerance: number = 1e-3
		) => {
			return va.distanceToSquared(vb) < tolerance * tolerance;
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

	private determineIntersectionType(
		edge: ECCEdge,
		sliceZ: number
	): Array<boolean> {
		let startOnSlice = false;
		let endOnSlice = false;
		if (veryClose(edge.start.vertex.z, sliceZ)) {
			startOnSlice = true;
		}
		if (veryClose(edge.end.vertex.z, sliceZ)) {
			endOnSlice = true;
		}

		const orientedEdge = [edge.start, edge.end].sort(
			(a: ECCVertex, b: ECCVertex) => {
				return a.vertex.z < b.vertex.z ? -1 : 1;
			}
		);
		let shouldDiscard = false;
		if (
			orientedEdge[0].vertex.z > sliceZ ||
			orientedEdge[1].vertex.z < sliceZ
		) {
			shouldDiscard = true;
		}

		return [startOnSlice, endOnSlice, shouldDiscard];
	}

	slice(): boolean {
		let slicerSuccess = false;
		if (this.isSlicingComplete) {
			slicerSuccess = true;
			return slicerSuccess;
		}

		if (this.triangles.length > 0) {
			for (
				let triIndex = 0;
				triIndex < this.triangles.length;
				++triIndex
			) {
				const currentTriangle = this.triangles[triIndex];
				currentTriangle.searchMinMaxZ();

				const zOrderedTriangleSlices = currentTriangle.getSlices(
					this.layerHeight
				);
				if (zOrderedTriangleSlices.length == 0) {
					throw new Error("Some error occured");
				}

				//judge fw/bw edge
				const edgePairPass1 =
					currentTriangle.getSlicedEdgePairForPhase(0);

				const slicePlane = new THREE.Plane(
					new THREE.Vector3(0, 0, 1),
					0
				);
				for (
					let j = zOrderedTriangleSlices[0];
					j <= zOrderedTriangleSlices[1];
					j++
				) {
					slicePlane.constant = j * this.layerHeight;
					const [_startOnSlice, _endOnSlice, shouldDiscard] =
						this.determineIntersectionType(
							edgePairPass1[0],
							slicePlane.constant
						);
					if (shouldDiscard) continue;
					const intersectionPoint = this.linePlaneIntersect(
						slicePlane,
						edgePairPass1[0]
					);
					if (intersectionPoint !== undefined) {
						const intersectionEntry: Intersection = {
							prev: null,
							next: null,
							edges: edgePairPass1,
							intersectionVertex: intersectionPoint,
						};

						this.insertIntersectionToCLL(intersectionEntry, j);
					}
				}

				// judge fw/bw edge for upper part
				const edgePairPass2 =
					currentTriangle.getSlicedEdgePairForPhase(1);

				for (
					let k = zOrderedTriangleSlices[1];
					k <= zOrderedTriangleSlices[2];
					k++
				) {
					slicePlane.constant = k * this.layerHeight;

					const [_startOnSlice, _endOnSlice, shouldDiscard] =
						this.determineIntersectionType(
							edgePairPass2[0],
							slicePlane.constant
						);
					if (shouldDiscard) continue;
					const intersectionPoint = this.linePlaneIntersect(
						slicePlane,
						edgePairPass2[0]
					);
					if (intersectionPoint !== undefined) {
						const intersectionEntry: Intersection = {
							prev: null,
							next: null,
							edges: edgePairPass2,
							intersectionVertex: intersectionPoint,
						};

						this.insertIntersectionToCLL(intersectionEntry, k);
					}
				}
			}

			slicerSuccess = true;
		}

		if (this.sliceArrayLL.length > 0)
			this.isSlicingComplete = slicerSuccess;
		return slicerSuccess;
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

		console.log("Top level CLL count: ", sliceReport.getSize());
		return contourList;
	}
}
