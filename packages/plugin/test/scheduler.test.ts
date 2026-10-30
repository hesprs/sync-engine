import Scheduler from '@/modules/Scheduler';
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from 'bun:test';

const MINUTE = 60_000;

const tick = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});

const fakeWindow = Object.assign(new EventTarget(), {
	clearInterval: () => {},
	clearTimeout: () => {},
	setInterval: () => 0,
	setTimeout: () => 0,
});
const fakeDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
const originals = { document: globalThis.document, window: globalThis.window };
// Bun runs all test files in one process, so the stubs must not outlive this file
beforeAll(() => {
	Object.assign(globalThis, { document: fakeDocument, window: fakeWindow });
});
afterAll(() => {
	Object.assign(globalThis, originals);
});

function setup({ enabled = true, value = 30_000, idle = true } = {}) {
	const executeSync = mock((_trigger: string) =>
		Promise.resolve({ result: 'completed' as const }),
	);
	const reduceTriggers = mock((triggers: Array<string>) => ({ trigger: triggers[0] }));
	const isIdle = Object.assign(
		(next?: boolean) => (next === undefined ? state.idle : (state.idle = next)),
		{},
	);
	const state = { idle };
	const scheduler = new Scheduler({
		app: { vault: { on: () => ({}) }, workspace: { onLayoutReady: () => {} } },
		dispatch: () => {},
		executeSync,
		isIdle,
		reduceTriggers,
		registerEvent: () => {},
		syncStage: () => 'idle',
	} as never);
	scheduler.settings = {
		avoidAutoSyncWhenOffline: false,
		focusSync: { enabled, value },
		realtimeSync: { enabled: false, value: 0 },
		scheduledSync: { enabled: false, value: 0 },
		startupSync: { enabled: false, value: 0 },
		syncStrategy: [],
	};
	scheduler.start();
	return { executeSync, scheduler, state };
}

let now = 10 * MINUTE;
let scheduler: Scheduler | undefined;
const focus = async () => {
	fakeWindow.dispatchEvent(new Event('focus'));
	// Let the queued request flush
	await tick();
};
const setVisibility = (visibilityState: 'visible' | 'hidden') => {
	fakeDocument.visibilityState = visibilityState;
	fakeDocument.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
	now = 10 * MINUTE;
	spyOn(Date, 'now').mockImplementation(() => now);
	fakeDocument.visibilityState = 'visible';
});

afterEach(() => {
	scheduler?.dispose();
	scheduler = undefined;
	mock.restore();
});

describe('scheduler focus sync', () => {
	it('starts a focus sync when the window gains focus', async () => {
		const env = setup();
		scheduler = env.scheduler;
		await focus();
		expect(env.executeSync).toHaveBeenCalledTimes(1);
		expect(env.executeSync.mock.calls[0]?.[0]).toBe('focus');
	});

	it('does nothing when disabled', async () => {
		const env = setup({ enabled: false });
		scheduler = env.scheduler;
		await focus();
		expect(env.executeSync).not.toHaveBeenCalled();
	});

	it('ignores focus inside the minimum gap, and syncs again after it', async () => {
		const env = setup();
		scheduler = env.scheduler;
		await focus();
		env.state.idle = true;
		now += 29_000;
		await focus();
		expect(env.executeSync).toHaveBeenCalledTimes(1);
		env.state.idle = true;
		now += 2000;
		await focus();
		expect(env.executeSync).toHaveBeenCalledTimes(2);
	});

	it('ignores focus while a sync is running', async () => {
		const env = setup({ idle: false });
		scheduler = env.scheduler;
		await focus();
		expect(env.executeSync).not.toHaveBeenCalled();
	});

	it('reacts to visibilitychange only when the document is visible', async () => {
		const env = setup();
		scheduler = env.scheduler;
		setVisibility('hidden');
		await tick();
		expect(env.executeSync).not.toHaveBeenCalled();
		setVisibility('visible');
		await tick();
		expect(env.executeSync).toHaveBeenCalledTimes(1);
	});

	it('measures the gap from the end of any sync', async () => {
		const env = setup();
		scheduler = env.scheduler;
		await focus();
		env.state.idle = true;
		now += 20_000;
		void env.scheduler.root.requestSync('manual');
		await tick();
		env.state.idle = true;
		now += 20_000;
		await focus();
		// 20 s after the manual sync ended: still inside the 30 s gap
		expect(env.executeSync).toHaveBeenCalledTimes(2);
	});

	it('stops listening after dispose', async () => {
		const env = setup();
		env.scheduler.dispose();
		await focus();
		expect(env.executeSync).not.toHaveBeenCalled();
	});
});
