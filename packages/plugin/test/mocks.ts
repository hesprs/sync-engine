// oxlint-disable-next-line import/no-namespace
import * as ObsidianMock from '@repo/shared/mocks';
import { mock } from 'bun:test';

Object.assign(globalThis, { window: globalThis });
void mock.module('obsidian', () => ObsidianMock);
