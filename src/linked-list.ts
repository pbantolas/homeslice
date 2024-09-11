type ListId = symbol;

export class ListNode<T> {
	public isMarkedForDeletion: boolean = false;
	constructor(
		public data: T,
		public prev: ListNode<T> | null = null,
		public next: ListNode<T> | null = null
	) {}
}

interface ILinkedList<T> {
	traverse(fn: (item: T, node: ListNode<T>) => boolean): void;
	insertNodeAtFront(node: ListNode<T>): ListNode<T>;
	insertNodeAtEnd(node: ListNode<T>): ListNode<T>;
	insertValueAtFront(data: T): ListNode<T>;
	insertValueAtEnd(data: T): ListNode<T>;
	getFront(): T | null;
	getEnd(): T | null;
	markNodeForDeletion(node: ListNode<T>): void;
	getSize(): number;
}

export class LinkedList<T> implements ILinkedList<T> {
	private head: ListNode<T> | null = null;
	private tail: ListNode<T> | null = null;
	private cachedCount: number = 0;
	private listId: ListId = Symbol();
	private nodesToDelete: Set<ListNode<T>> = new Set();

	public getSize(): number {
		return this.cachedCount;
	}

	public traverse(fn: (item: T, node: ListNode<T>) => boolean): void {
		let currentNode = this.head;
		while (currentNode !== null) {
			if (currentNode.isMarkedForDeletion) continue;
			// const nextNode = currentNode.next;
			if (!fn(currentNode.data, currentNode)) break;
			currentNode = currentNode.next;
		}
		this.performDeferredDeletions();
	}

	public insertNodeAtFront(node: ListNode<T>): ListNode<T> {
		if (node.next)
			throw new Error("Trying to insert node that has a right neighbor");

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

	public insertNodeAtEnd(node: ListNode<T>): ListNode<T> {
		if (node.prev)
			throw new Error("Trying to insert node that has a left neighbour");

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

	public insertValueAtFront(data: T): ListNode<T> {
		const node = new ListNode(data);
		return this.insertNodeAtFront(node);
	}

	public insertValueAtEnd(data: T): ListNode<T> {
		const node = new ListNode(data);
		return this.insertNodeAtEnd(node);
	}

	public getFront(): T | null {
		if (this.head) return this.head.data;
		return null;
	}

	public getEnd(): T | null {
		if (this.tail) return this.tail.data;
		return null;
	}

	public markNodeForDeletion(node: ListNode<T>): void {
		if (node) {
			node.isMarkedForDeletion = true;
			this.nodesToDelete.add(node);
		}
	}

	private performDeferredDeletions(): void {
		for (const node of this.nodesToDelete) {
			this.deleteNode(node);
		}
		this.nodesToDelete.clear();
	}

	private deleteNode(node: ListNode<T>): void {
		if (!node.prev) {
			// node is head
			this.head = node.next;
			if (this.head) this.head.prev = null;
		} else {
			node.prev.next = node.next;
		}

		if (!node.next) {
			// node is tail
			this.tail = node.prev;
			if (this.tail) this.tail.next = null;
		} else {
			node.next.prev = node.prev;
		}

		node.prev = null;
		node.next = null;

		this.cachedCount--;
	}
}
