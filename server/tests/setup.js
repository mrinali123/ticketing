// Runs before every test file: gives it a fresh, throwaway MongoDB in memory.
import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

beforeAll(async () => {
  // A single-node replica set (not a plain server) so transactions work later
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri();

  // Safety net: refuse to run against anything that isn't local
  if (!uri.startsWith('mongodb://127.0.0.1')) {
    throw new Error(`Refusing to run tests against non-local database: ${uri}`);
  }

  await mongoose.connect(uri);
  // Build unique indexes (e.g. User.email) before tests rely on them
  await mongoose.connection.syncIndexes();
});

afterEach(async () => {
  // Empty every collection so tests can't affect each other (indexes are kept)
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});
