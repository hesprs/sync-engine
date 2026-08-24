// oxlint-disable-next-line import/no-namespace
import ObsidianMock from '@repo/shared/obsidian-mock';
import { mock } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);
