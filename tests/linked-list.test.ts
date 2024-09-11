import { LinkedList, ListNode } from "../src/linked-list";

describe("LinkedList", () => {
	let list: LinkedList<number>;

	beforeEach(() => {
		list = new LinkedList<number>();
	});

	test("insertAtFront", () => {
		const newNode = new ListNode<number>(1);
		list.insertAtFront(newNode);
		expect(list.getFront()).toBe(1);
		expect(list.getSize()).toBe(1);
	});

	test("insertValueAtFront", () => {
		list.insertValueAtFront(1);
		expect(list.getFront()).toBe(1);
		expect(list.getSize()).toBe(1);
	});

	test("insertValueAtEnd", () => {
		list.insertValueAtEnd(1);
		expect(list.getEnd()).toBe(1);
		expect(list.getSize()).toBe(1);
	});

	test("deleteNode", () => {
		const node = list.insertValueAtFront(1);
		list.deleteNode(node);
		expect(list.getFront()).toBeNull();
		expect(list.getSize()).toBe(0);
	});

	test("traverse", () => {
		list.insertValueAtEnd(1);
		list.insertValueAtEnd(2);
		list.insertValueAtEnd(3);
		const values: number[] = [];
		list.traverse((item) => {
			values.push(item);
			return true;
		});
		expect(values).toEqual([1, 2, 3]);
	});

	test("deleteNode from middle", () => {
		const _node1 = list.insertValueAtEnd(1);
		const node2 = list.insertValueAtEnd(2);
		const _node3 = list.insertValueAtEnd(3);
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
