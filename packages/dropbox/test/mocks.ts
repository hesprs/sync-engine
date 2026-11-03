import ObsidianMock from '@repo/shared/obsidian-mock';
import { mock } from 'bun:test';

// The build bakes the base64-encoded app key via `define`; tests encode the raw key from the environment the same way (bun auto-loads `packages/dropbox/.env`).
process.env.DROPBOX_APP_KEY = btoa(process.env.DROPBOX_APP_KEY ?? 'test-app-key');

void mock.module('obsidian', () => ObsidianMock);
