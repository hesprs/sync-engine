// oxlint-disable-next-line import/no-namespace
import * as ObsidianMock from '@repo/shared/mocks';
import { mock } from 'bun:test';

process.env.CLIENT_ID = btoa(process.env.GDRIVE_CLIENT_ID ?? '');
process.env.CLIENT_SECRET = btoa(process.env.GDRIVE_CLIENT_SECRET ?? '');

void mock.module('obsidian', () => ObsidianMock);
