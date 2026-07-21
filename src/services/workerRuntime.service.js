'use strict';

const workers = new Map();

function registerWorker(name, worker) {
  const entry = {
    name,
    worker,
    startedAt: new Date(),
    status: 'running',
    lastError: null,
    lastErrorAt: null,
    completed: 0,
    failed: 0
  };

  workers.set(name, entry);

  if (worker && typeof worker.on === 'function') {
    worker.on('completed', () => {
      entry.completed += 1;
      entry.status = 'running';
    });
    worker.on('failed', (_job, err) => {
      entry.failed += 1;
      entry.status = 'degraded';
      entry.lastError = err?.message || String(err || 'Worker job failed');
      entry.lastErrorAt = new Date();
    });
    worker.on('error', (err) => {
      entry.status = 'error';
      entry.lastError = err?.message || String(err || 'Worker error');
      entry.lastErrorAt = new Date();
    });
    worker.on('closed', () => {
      entry.status = 'closed';
    });
  }

  return entry;
}

function registerWorkerFailure(name, error) {
  workers.set(name, {
    name,
    worker: null,
    startedAt: null,
    status: 'failed_to_start',
    lastError: error?.message || String(error || 'Worker failed to start'),
    lastErrorAt: new Date(),
    completed: 0,
    failed: 0
  });
}

function listWorkers() {
  return Array.from(workers.values()).map((entry) => ({
    name: entry.name,
    status: entry.status,
    startedAt: entry.startedAt,
    lastError: entry.lastError,
    lastErrorAt: entry.lastErrorAt,
    completed: entry.completed,
    failed: entry.failed
  }));
}

module.exports = { registerWorker, registerWorkerFailure, listWorkers };