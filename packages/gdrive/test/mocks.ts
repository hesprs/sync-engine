import ObsidianMock from '@repo/shared/obsidian-mock';
import { mock } from 'bun:test';

process.env.CLIENT_ID = btoa(process.env.GDRIVE_CLIENT_ID ?? '');
process.env.CLIENT_SECRET = btoa(process.env.GDRIVE_CLIENT_SECRET ?? '');

void mock.module('obsidian', () => ObsidianMock);
