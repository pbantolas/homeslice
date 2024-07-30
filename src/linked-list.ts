import { cache } from "three/examples/jsm/nodes/Nodes";

export class ListNode<T> {
	public prev: ListNode<T> | null = null;
	public next: ListNode<T> | null = null;
	constructor(public data: T) {}
}

interface ILinkedList<T> {
	traverse(fn: (item: T, node: ListNode<T>) => Boolean): void;
	insertAtFront(data: T): ListNode<T>;
	insertAtEnd(data: T): ListNode<T>;
	getFront(): T | null;
	getEnd(): T | null;
	deleteNode(node: ListNode<T>): void;
	getSize(): number;
}

export class LinkedList<T> implements ILinkedList<T> {
	private head: ListNode<T> | null = null;
	private tail: ListNode<T> | null = null;
	private cachedCount: number = 0;
	
	public getSize(): number {
		return this.cachedCount;
	}

	public traverse(fn: (item: T, node: ListNode<T>) => Boolean): void {
		let currentNode = this.head;
		while (currentNode !== null) {
			const nextNode = currentNode.next;
			if (!fn(currentNode.data, currentNode))
				break;
			currentNode = nextNode;
		}
	}

	public insertAtFront(data: T): ListNode<T> {
		const node = new ListNode(data);
		if (!this.head) {
			this.head = node;
			this.tail = node;
		} else {
			this.head.prev = node;
			node.next = this.head;
			this.head = node;
		}

		this.cachedCount++;
		return node;
	}

	public insertAtEnd(data: T): ListNode<T> {
		const node = new ListNode(data);
		if (!this.tail) {
			this.head = node;
			this.tail = node;
		} else {
			this.tail.next = node;
			node.prev = this.tail;
			this.tail = node;
		}

		this.cachedCount++;
		return node;
	}

	public getFront(): T | null {
		if (this.head)
			return this.head.data;
		return null;
	}

	public getEnd(): T | null {
		if (this.tail)
			return this.tail.data;
		return null;
	}

	public deleteNode(node: ListNode<T>): void {
		if (!node.prev) {
			// node is head
			this.head = node.next;
			if (this.head)
				this.head.prev = null;
		} else {
			node.prev.next = node.next;
		}

		if (!node.next) {
			// node is tail
			this.tail = node.prev;
			if (this.tail)
				this.tail.next = null;
		} else {
			node.next.prev = node.prev;
		}

		node.prev = null;
		node.next = null;

		this.cachedCount--;
	}
}