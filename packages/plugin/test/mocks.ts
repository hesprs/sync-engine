import ObsidianMock from '@repo/shared/obsidian-mock';
import { mock } from 'bun:test';

Object.assign(globalThis, { window: globalThis });
void mock.module('obsidian', () => ObsidianMock);
