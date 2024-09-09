import { LinkedList } from "../src/linked-list";

describe("LinkedList", () => {
	let list: LinkedList<number>;

	beforeEach(() => {
		list = new LinkedList<number>();
	});

	test("insertAtFront", () => {
		list.insertAtFront(1);
		expect(list.getFront()).toBe(1);
		expect(list.getSize()).toBe(1);
	});

	test("insertAtEnd", () => {
		list.insertAtEnd(1);
		expect(list.getEnd()).toBe(1);
		expect(list.getSize()).toBe(1);
	});

	test("deleteNode", () => {
		const node = list.insertAtFront(1);
		list.deleteNode(node);
		expect(list.getFront()).toBeNull();
		expect(list.getSize()).toBe(0);
	});

	test("traverse", () => {
		list.insertAtEnd(1);
		list.insertAtEnd(2);
		list.insertAtEnd(3);
		const values: number[] = [];
		list.traverse((item) => {
			values.push(item);
			return true;
		});
		expect(values).toEqual([1, 2, 3]);
	});

	test("deleteNode from middle", () => {
		const node1 = list.insertAtEnd(1);
		const node2 = list.insertAtEnd(2);
		const node3 = list.insertAtEnd(3);
		list.deleteNode(node2);
		const values: number[] = [];
		list.traverse((item) => {
			values.push(item);
			return true;
		});
		expect(values).toEqual([1, 3]);
		expect(list.getSize()).toBe(2);
	});
});
