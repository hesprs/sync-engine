import ObsidianMock from '@/obsidian-mock';
import { mock } from 'bun:test';

void mock.module('obsidian', () => ObsidianMock);
