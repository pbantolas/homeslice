import * as THREE from "three";
import { ECCSlicer } from "../src/slicer"; // Adjust the import path if needed

describe("ECCSlicer", () => {
	let slicer: ECCSlicer;

	beforeEach(() => {
		slicer = new ECCSlicer();
	});

	test("should import a mesh object correctly", () => {
		const geometry = new THREE.BoxGeometry(1, 1, 1);
		const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
		const mesh = new THREE.Mesh(geometry, material);
		const meshGrp = new THREE.Object3D();
		meshGrp.add(mesh);
		slicer.importObject(meshGrp);

		expect(slicer["triangles"].length).toBeGreaterThan(0);
		expect(slicer["object"]).toBe(meshGrp);
	});

	test("should correctly slice a triangle and return intersections", () => {
		const geometry = new THREE.BufferGeometry();
		const vertices = new Float32Array([
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			1,
			0, // Triangle at z = 0
			0,
			0,
			1,
			0,
			1,
			0,
			1,
			1,
			0, // Triangle at z = 1
		]);
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(vertices, 3)
		);
		const mesh = new THREE.Mesh(geometry);
		const meshGrp = new THREE.Object3D();
		meshGrp.add(mesh);
		slicer.importObject(meshGrp);

		expect(slicer.slice()).toBe(true); // Ensure the slicing was successful

		// Retrieve intersections for the first layer
		const sliceData = slicer.getLayer(0);

		expect(sliceData.length).toBeGreaterThan(0); // Ensure there's at least one intersection
		expect(sliceData).toMatchSnapshot(); // Use snapshots to check correctness of data
	});

	test("should return correct number of intersections at specific slices", () => {
		const geometry = new THREE.TetrahedronGeometry(1);
		const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
		const mesh = new THREE.Mesh(geometry, material);
		const meshGrp = new THREE.Object3D().add(mesh);
		slicer.importObject(meshGrp);
		slicer.slice();

		const sliceDataAtLayer0 = slicer.getLayer(0);
		const sliceDataAtLayer1 = slicer.getLayer(1);

		expect(sliceDataAtLayer0.length).toBeGreaterThan(0);
		expect(sliceDataAtLayer1.length).toBeGreaterThan(0);
		// You can assert specific counts or properties if you know the expected output
	});

	test("should handle non-existent slices gracefully", () => {
		const geometry = new THREE.BoxGeometry(1, 1, 1);
		const mesh = new THREE.Mesh(geometry);
		slicer.importObject(mesh);
		slicer.slice();

		const emptyLayerData = slicer.getLayer(10); // Layer 10 probably does not exist
		expect(emptyLayerData).toEqual(new Float32Array(0));
	});

	test("should return zero intersections for empty input", () => {
		const mesh = new THREE.Group(); // Empty group with no mesh
		slicer.importObject(mesh);
		slicer.slice();

		const emptySliceData = slicer.getLayer(0);
		expect(emptySliceData).toEqual(new Float32Array(0)); // No intersections for empty mesh
	});
});
