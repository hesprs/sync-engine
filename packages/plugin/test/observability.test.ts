import Observability from '@/modules/Observability';
import { expect, test } from 'bun:test';
import { Platform } from 'obsidian';
import { ref } from 'synthkernel';

type MockElement = {
	addEventListener: (
		event: string,
		handler: (e: { stopPropagation: () => void }) => void,
	) => void;
	addClass: (...cls: Array<string>) => void;
	append: (...nodes: Array<unknown>) => void;
	children: Array<MockElement>;
	closest: (sel: string) => MockElement | undefined;
	createEl: (tag: string, options?: { cls?: string; text?: string }) => MockElement;
	createSpan: (options?: { cls?: string; text?: string }) => MockElement;
	empty: () => void;
	firstElementChild: MockElement | undefined;
	getAttribute: (name: string) => string | undefined;
	hasClass: (cls: string) => boolean;
	parent?: MockElement;
	prepend: (...nodes: Array<unknown>) => void;
	querySelector: (sel: string) => MockElement | undefined;
	querySelectorAll: (sel: string) => Array<MockElement>;
	remove: () => void;
	removeAttribute: (name: string) => void;
	removeClass: (...cls: Array<string>) => void;
	setAttr: (name: string, val: string) => void;
	setAttribute: (name: string, val: string) => void;
	setText: (text: string) => void;
	style: Record<string, string>;
	tag: string;
	trigger: (event: string, e?: unknown) => void;
};

function fakeElement(tag = 'div'): MockElement {
	const children: Array<MockElement> = [];
	const attrs = new Map<string, string>();
	const classes = new Set<string>();
	const style: Record<string, string> = {};
	const listeners = new Map<string, Array<(e: { stopPropagation: () => void }) => void>>();

	const el: MockElement = {
		addClass: (...cls) => cls.forEach((c) => classes.add(c)),
		addEventListener: (event, handler) => {
			const list = listeners.get(event) ?? [];
			list.push(handler);
			listeners.set(event, list);
		},
		append: (...nodes) => {
			for (const node of nodes as Array<MockElement>) {
				node.parent = el;
				children.push(node);
			}
		},
		children,
		closest: (sel) => {
			if (sel.startsWith('.')) {
				const cls = sel.slice(1);
				let cur: MockElement | undefined = el;
				while (cur) {
					if (cur.hasClass(cls)) return cur;
					cur = cur.parent;
				}
			}
			return;
		},
		createEl: (t, options) => {
			const child = fakeElement(t);
			if (options?.cls) child.addClass(...options.cls.split(' ').filter(Boolean));
			if (options?.text) child.setText(options.text);
			child.parent = el;
			children.push(child);
			return child;
		},
		createSpan: (options) => {
			const span = fakeElement('span');
			if (options?.cls) span.addClass(...options.cls.split(' ').filter(Boolean));
			if (options?.text) span.setText(options.text);
			span.parent = el;
			children.push(span);
			return span;
		},
		empty: () => {
			children.length = 0;
		},
		get firstElementChild() {
			return children[0];
		},
		getAttribute: (name) => attrs.get(name) ?? undefined,
		hasClass: (cls) => classes.has(cls),
		prepend: (...nodes) => {
			for (const node of (nodes as Array<MockElement>).reverse()) {
				node.parent = el;
				children.unshift(node);
			}
		},
		querySelector: (sel) => {
			if (sel.startsWith('.')) {
				const cls = sel.slice(1);
				const find = (node: MockElement): MockElement | undefined => {
					if (node.hasClass(cls)) return node;
					for (const child of node.children) {
						const res = find(child);
						if (res) return res;
					}
					return undefined;
				};
				for (const child of el.children) {
					const res = find(child);
					if (res) return res;
				}
			}
			return;
		},
		querySelectorAll: (sel) => {
			const result: Array<MockElement> = [];
			if (sel.startsWith('.')) {
				const cls = sel.slice(1);
				const find = (node: MockElement) => {
					if (node.hasClass(cls)) result.push(node);
					for (const child of node.children) find(child);
				};
				for (const child of el.children) find(child);
			}
			return result;
		},
		remove: () => {
			if (el.parent) {
				const idx = el.parent.children.indexOf(el);
				if (idx !== -1) el.parent.children.splice(idx, 1);
			}
		},
		removeAttribute: (name) => {
			attrs.delete(name);
		},
		removeClass: (...cls) => cls.forEach((c) => classes.delete(c)),
		setAttr: (name, val) => {
			attrs.set(name, val);
		},
		setAttribute: (name, val) => {
			attrs.set(name, val);
		},
		setText: () => {},
		style,
		tag,
		trigger: (event, e = { stopPropagation: () => {} }) => {
			const list = listeners.get(event) ?? [];
			for (const handler of list) handler(e as { stopPropagation: () => void });
		},
	};
	return el;
}

function createFakeObservability(options?: {
	isMobile?: boolean;
	rootLeaves?: Array<{ view?: { containerEl?: MockElement } }>;
}) {
	const callbacks = new Map<string, Array<(...args: Array<unknown>) => void>>();
	const workspaceCallbacks = new Map<string, Array<() => void>>();
	const isIdle = ref(true);
	const startIconEl = fakeElement('div');
	const statusEl = fakeElement('div');
	let syncRequested = false;
	let progressShown = false;

	const rootLeaves = options?.rootLeaves ?? [];

	const ctx = {
		addCommand: () => ({}) as never,
		addRibbonIcon: () => startIconEl as unknown as HTMLElement,
		addStatusBarItem: () => statusEl as unknown as HTMLElement,
		app: {
			workspace: {
				iterateRootLeaves: (cb: (leaf: unknown) => void) => {
					rootLeaves.forEach(cb);
				},
				offref: () => {},
				on: (event: string, cb: () => void) => {
					const list = workspaceCallbacks.get(event) ?? [];
					list.push(cb);
					workspaceCallbacks.set(event, list);
					return {} as never;
				},
			},
		} as never,
		dispatch: () => {},
		getLogs: () => '',
		isIdle,
		on: (event: string, cb: (...args: Array<unknown>) => void) => {
			const list = callbacks.get(event) ?? [];
			list.push(cb);
			callbacks.set(event, list);
			return () => {
				const current = callbacks.get(event) ?? [];
				callbacks.set(
					event,
					current.filter((item) => item !== cb),
				);
			};
		},
		requestSync: () => {
			syncRequested = true;
			return Promise.resolve({ result: 'completed' as const });
		},
		showProgress: () => {
			progressShown = true;
		},
		translate: (key: string) => key,
	};

	if (options?.isMobile !== undefined) Platform.isMobile = options.isMobile;

	const obs = new Observability(ctx as never);
	(obs as unknown as { settings: object }).settings = {
		exportLogsDirectory: '',
		noticeStatusOnMobile: false,
	};
	obs.start();
	return {
		callbacks,
		isIdle,
		isProgressShown: () => progressShown,
		isSyncRequested: () => syncRequested,
		obs,
		startIconEl,
		statusEl,
		workspaceCallbacks,
	};
}

test('setModuleStatus manages module statuses and updates badge', () => {
	Platform.isMobile = false;
	const { obs, startIconEl } = createFakeObservability();
	expect(obs.getModuleStatus('collaboration')).toBeUndefined();

	const unregister = obs.setModuleStatus('collaboration', {
		level: 'warning',
		message: 'MQTT: Reconnecting',
	});
	expect(obs.getModuleStatus('collaboration')?.level).toBe('warning');
	expect(startIconEl.querySelector('.sync-engine-badge-icon')).toBeDefined();
	expect(startIconEl.getAttribute('aria-label')).toContain('MQTT: Reconnecting');

	obs.setModuleStatus('collaboration', { level: 'error', message: 'MQTT: Connection failed' });
	expect(obs.getModuleStatus('collaboration')?.level).toBe('error');
	expect(startIconEl.getAttribute('aria-label')).toContain('MQTT: Connection failed');

	unregister();
	expect(obs.getModuleStatus('collaboration')).toBeUndefined();
	expect(startIconEl.querySelector('.sync-engine-badge-icon')).toBeUndefined();
});

test('sync failure produces error badge on the sync icon', () => {
	Platform.isMobile = false;
	const { callbacks, startIconEl } = createFakeObservability();
	const terminatedHandlers = callbacks.get('syncTerminated') ?? [];
	for (const handler of terminatedHandlers)
		handler({ error: new Error('Network error'), result: 'failed' });

	expect(startIconEl.querySelector('.sync-engine-badge-icon')).toBeDefined();
	expect(startIconEl.getAttribute('aria-label')).toContain('Network error');

	const startedHandlers = callbacks.get('syncStarted') ?? [];
	for (const handler of startedHandlers) handler();

	expect(startIconEl.querySelector('.sync-engine-badge-icon')).toBeUndefined();
});

test('mobile header icon renders in view-actions and responds to status changes and clicks', () => {
	const leafContainer = fakeElement('div');
	const viewActions = leafContainer.createEl('div', { cls: 'view-actions' });
	const legacyBtn = viewActions.createEl('button', { cls: 'sync-engine-collab-action' });

	const fake = createFakeObservability({
		isMobile: true,
		rootLeaves: [{ view: { containerEl: leafContainer } }],
	});

	// Legacy button removed and new action prepended
	expect(viewActions.querySelector('.sync-engine-collab-action')).toBeUndefined();
	const mobileBtn = viewActions.querySelector('.sync-engine-mobile-action');
	expect(mobileBtn).toBeDefined();
	expect(mobileBtn?.querySelector('.sync-engine-main-icon')).toBeDefined();
	expect(mobileBtn?.querySelector('.sync-engine-badge-icon')).toBeUndefined();

	// Set module warning
	fake.obs.setModuleStatus('collaboration', { level: 'warning', message: 'MQTT: Reconnecting' });
	expect(mobileBtn?.querySelector('.sync-engine-badge-icon')).toBeDefined();
	expect(mobileBtn?.getAttribute('aria-label')).toContain('MQTT: Reconnecting');

	// Set module error
	fake.obs.setModuleStatus('collaboration', {
		level: 'error',
		message: 'MQTT: Connection failed',
	});
	expect(mobileBtn?.querySelector('.sync-engine-badge-icon')).toBeDefined();
	expect(mobileBtn?.getAttribute('aria-label')).toContain('MQTT: Connection failed');

	// Click while idle triggers manual sync
	mobileBtn?.trigger('click');
	expect(fake.isSyncRequested()).toBe(true);

	// When syncing, spinning class is present
	fake.isIdle(false);
	const mainIcon = mobileBtn?.querySelector('.sync-engine-main-icon');
	expect(mainIcon?.hasClass('animate-spin')).toBe(true);

	// Click while syncing shows progress modal
	mobileBtn?.trigger('click');
	expect(fake.isProgressShown()).toBe(true);

	// Switching leaves via active-leaf-change updates actions
	const onLeafChangeHandlers = fake.workspaceCallbacks.get('active-leaf-change') ?? [];
	for (const handler of onLeafChangeHandlers) handler();
	expect(viewActions.querySelector('.sync-engine-mobile-action')).toBeDefined();

	fake.obs.dispose();
	expect(viewActions.querySelector('.sync-engine-mobile-action')).toBeUndefined();
	Platform.isMobile = false;
});
