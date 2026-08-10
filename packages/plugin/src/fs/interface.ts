// oxlint-disable typescript/method-signature-style
import type { MaybePromise, Progress, Stat, Binary, FileStat } from '@/types';

/**
 * All keys use unified format:
 * - root: `/`
 * - file: `note.md`, `folder/note.md`
 * - folder: `folder/`, `folder/nested/`
 */
export type RootFs = {
	getUid(): string; // String whose inequality signifies the client is unique
	read(key: string, stat: FileStat): MaybePromise<Binary>;
	readStream(key: string, stat: FileStat): MaybePromise<ReadableStream<Binary>>;
	write(key: string, value: Binary, stat: FileStat): MaybePromise<string>; // Returns uid
	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): MaybePromise<string>; // Returns uid, should only resolve when the stream is fully consumed
	delete(key: string): MaybePromise<void>;
	move(oldKey: string, newKey: string): MaybePromise<void>;
	mkdir(key: string, recursive?: boolean): MaybePromise<void>;
	stat(key: string): MaybePromise<Stat>;
	exists(key: string): MaybePromise<boolean>;
	list(key: string, reporter: ListReporter): MaybePromise<Array<Stat>>; // List recursive children under one folder
};

export type ListReporter = (
	progress: Required<Progress>,
) => MaybePromise<'include' | 'exclude' | 'advance'>;
export type WrappedFs = RootFs & { original: Fs };
export type Fs = WrappedFs | RootFs;

export type WriteAtom = {
	type: 'write';
	key: string;
	execute: () => MaybePromise<string>;
	resolve: (uid: string) => void;
	reject: (err: Error) => void;
};
export type DeleteAtom = {
	type: 'delete';
	key: string;
	execute: () => MaybePromise<void>;
	resolve: () => void;
	reject: (err: Error) => void;
};
export type MoveAtom = {
	type: 'move';
	oldKey: string;
	newKey: string;
	execute: () => MaybePromise<void>;
	resolve: () => void;
	reject: (err: Error) => void;
};
export type MkdirAtom = {
	type: 'mkdir';
	key: string;
	execute: () => MaybePromise<void>;
	resolve: () => void;
	reject: (err: Error) => void;
};
export type InputAtom = WriteAtom | DeleteAtom | MoveAtom | MkdirAtom;
export type CustomAtom = {
	type: 'custom';
	execute: () => MaybePromise<void>;
};
export type OutputAtom = InputAtom | CustomAtom;

export type OptimizerInput = {
	atoms: Array<InputAtom>;
	fs: Fs;
	executeAtom: (atom: OutputAtom) => Promise<void | string>;
};
export type OptimizerOutput = Array<OutputAtom>;
export type BatchOptimizer = (input: OptimizerInput) => OptimizerOutput;
