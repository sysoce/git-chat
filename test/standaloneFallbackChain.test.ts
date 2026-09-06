import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  CLIENT_POLL_INTERVALS,
  computeClientPollInterval,
  computeQuotaSafeIntervalMs,
} from '../src/transport/syncPollingPolicy';

const rootDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(rootDir, 'index.html');
const aliasHtmlPath = path.join(rootDir, 'git-chat.html');

function readIndexHtml(): string {
  return fs.readFileSync(indexHtmlPath, 'utf8');
}

function extractInlineScript(html: string): string {
  const match = html.match(/<script>\n([\s\S]*?)\n {2}<\/script>/);
  assert.ok(match, 'index.html must contain the main inline application script');
  return match![1];
}

/**
 * Evaluates a slice of the client script in isolation and returns one of its
 * functions, so duplicated browser logic can be diffed against the TypeScript
 * source of truth. A `window` shim stands in for the browser global the client
 * uses to publish helpers.
 */
function loadClientFunction(source: string, name: string): (ctx: unknown) => number {
  const sandbox: Record<string, unknown> = { window: {} };
  vm.runInNewContext(`${source}\nthis.__fn = ${name};`, sandbox);
  return sandbox.__fn as (ctx: unknown) => number;
}

interface SchedulerHarness {
  computeSyncDelayMs: () => number;
  setBridgeHealthy: (v: boolean) => void;
  setLastActivity: (atMs: number) => void;
  rateLimit: {
    remaining: number;
    limit: number;
    resetAt: number;
    isRateLimited: boolean;
    rateLimitReset: number;
    consecutiveFailures: number;
  };
  registry: { activeMode: string };
}

/**
 * Loads the real adaptive scheduler out of the shipped client and exposes the
 * ambient state it reads, so the decision ordering can be exercised directly
 * instead of asserted by text match.
 */
function loadScheduler(html: string): SchedulerHarness {
  const source = extractInlineScript(html);

  const rateLimitHelper = source.match(/function isRateLimitActive\(state\) \{[\s\S]*?\n {4}\}/);
  assert.ok(rateLimitHelper, 'index.html must define isRateLimitActive');

  const schedulerBlock = source.match(
    /const CLIENT_POLL_INTERVALS = \{[\s\S]*?window\.scheduleAdaptiveSync = scheduleAdaptiveSync;/,
  );
  assert.ok(schedulerBlock, 'index.html must define the adaptive scheduling section');

  const registry = { activeMode: 'offline' };
  const sandbox: Record<string, unknown> = {
    window: {},
    document: { visibilityState: 'visible' },
    transportRegistry: registry,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    syncFromLocalServer: async () => undefined,
    gitHubRateLimit: {
      remaining: 5000,
      limit: 5000,
      resetAt: 0,
      isRateLimited: false,
      rateLimitReset: 0,
      consecutiveFailures: 0,
    },
  };

  vm.runInNewContext(
    `${rateLimitHelper![0]}\n${schedulerBlock![0]}\n` +
      'this.__compute = computeSyncDelayMs;\n' +
      'this.__setBridge = (v) => { localBridgeHealthy = v; };\n' +
      'this.__setActivity = (at) => { lastLocalActivityAt = at; };',
    sandbox,
  );

  return {
    computeSyncDelayMs: sandbox.__compute as () => number,
    setBridgeHealthy: sandbox.__setBridge as (v: boolean) => void,
    setLastActivity: sandbox.__setActivity as (atMs: number) => void,
    rateLimit: sandbox.gitHubRateLimit as SchedulerHarness['rateLimit'],
    registry,
  };
}

describe('Standalone Client Fallback Chain Suite', () => {
  it('keeps the deployed git-chat.html alias byte-identical to index.html', () => {
    const index = fs.readFileSync(indexHtmlPath);
    const alias = fs.readFileSync(aliasHtmlPath);
    assert.ok(alias.equals(index), 'git-chat.html must be a byte-identical copy of index.html');
  });

  it('parses the entire inline application script without syntax errors', () => {
    const source = extractInlineScript(readIndexHtml());
    // The app ships with no bundler or transpile step, so a syntax error here
    // would deploy a blank page straight to GitHub Pages.
    assert.doesNotThrow(() => new vm.Script(source, { filename: 'index.html.inline.js' }));
  });

  it('registers every transport tier including the gist vault fallback', () => {
    const html = readIndexHtml();
    assert.ok(html.includes('class GistSyncClient'), 'must define the GistSyncClient transport');
    assert.ok(html.includes('function initGist('), 'must define initGist');
    assert.ok(/initClientTransports\(\)\s*\{[\s\S]*?initGist\(\);/.test(html),
      'initClientTransports must start the gist tier alongside the live transports');

    for (const mode of ['p2p', 'live-mesh', 'live-sse', 'gist-sync', 'git-sync']) {
      assert.ok(html.includes(`'${mode}'`), `transport registry must know about ${mode}`);
    }
  });

  it('reports git-sync and gist-sync status so the lowest tiers are reachable', () => {
    const html = readIndexHtml();
    // These branches already existed in the registry but nothing ever set the
    // statuses, so the app displayed "Offline" while syncing fine over git.
    assert.ok(html.includes("transportRegistry.setStatus('git-sync', 'connected')"),
      'git-sync must report a connected status');
    assert.ok(html.includes("transportRegistry.setStatus('gist-sync', status)"),
      'gist-sync must report status through the registry');
  });

  it('exposes gist vault configuration and settings inputs', () => {
    const html = readIndexHtml();
    assert.ok(html.includes('id="cfg-gist-id"'), 'settings must expose a gist id input');
    assert.ok(html.includes('id="cfg-gist-token"'), 'settings must expose a gist token input');
    assert.ok(/gistId:\s*''/.test(html), 'DEFAULT_CONFIG must declare gistId');
    assert.ok(/gistToken:\s*''/.test(html), 'DEFAULT_CONFIG must declare gistToken');
    assert.ok(html.includes("config.gistId = (document.getElementById('cfg-gist-id')"),
      'saving settings must persist the gist id');
  });

  it('mirrors outbound pushes into the gist vault as an off-site backup', () => {
    const html = readIndexHtml();
    assert.ok(html.includes('window.gistClient.pushSyncFiles(files)'),
      'pushFiles must mirror updates into the gist vault');
  });

  it('replaces fixed-rate polling with the adaptive scheduler', () => {
    const html = readIndexHtml();
    assert.ok(!html.includes('setInterval(() => syncFromLocalServer(false), 3000)'),
      'the unconditional 3s poll must not be reintroduced; it exhausts the API quota');
    assert.ok(html.includes('function scheduleAdaptiveSync('), 'must define scheduleAdaptiveSync');
    assert.ok(html.includes('function computeSyncDelayMs('), 'must define computeSyncDelayMs');
    assert.ok(html.includes('scheduleAdaptiveSync();'), 'boot must start the adaptive scheduler');
  });

  it('keeps the inlined poll intervals identical to the TypeScript policy', () => {
    const source = extractInlineScript(readIndexHtml());
    const match = source.match(/const CLIENT_POLL_INTERVALS = \{([\s\S]*?)\};/);
    assert.ok(match, 'index.html must inline CLIENT_POLL_INTERVALS');

    // Re-spread into this realm; a vm object carries a foreign Object prototype.
    const inlined = { ...(vm.runInNewContext(`({${match![1]}})`) as Record<string, number>) };
    assert.deepStrictEqual(
      inlined,
      { ...CLIENT_POLL_INTERVALS },
      'inlined client poll intervals must match src/transport/syncPollingPolicy.ts',
    );
  });

  it('computes the same poll interval in the client as the TypeScript policy', () => {
    const source = extractInlineScript(readIndexHtml());
    const block = source.match(
      /const CLIENT_POLL_INTERVALS = \{[\s\S]*?\n {4}function computeClientPollInterval\(ctx\) \{[\s\S]*?\n {4}\}/,
    );
    assert.ok(block, 'index.html must inline computeClientPollInterval');
    const clientFn = loadClientFunction(block![0], 'computeClientPollInterval');

    const cases = [
      { remainingQuota: 10 },
      { isHidden: true },
      { isAwaitingResponse: true, awaitingStartedAt: Date.now() },
      { isAwaitingResponse: true, awaitingStartedAt: Date.now() - 200_000 },
      {},
    ];
    for (const ctx of cases) {
      assert.strictEqual(
        clientFn(ctx),
        computeClientPollInterval(ctx),
        `client and TypeScript policy must agree for ${JSON.stringify(ctx)}`,
      );
    }
  });

  it('paces polling against the real remaining quota in the client', () => {
    const source = extractInlineScript(readIndexHtml());
    const block = source.match(
      /const QUOTA_RESERVE_FRACTION[\s\S]*?\n {4}function computeQuotaSafeIntervalMs\(ctx\) \{[\s\S]*?\n {4}\}/,
    );
    assert.ok(block, 'index.html must inline computeQuotaSafeIntervalMs');
    const clientFn = loadClientFunction(block![0], 'computeQuotaSafeIntervalMs');

    const now = 1_700_000_000_000;
    const cases = [
      // Unauthenticated GitHub budget: 60 requests per hour.
      { remaining: 60, resetAtMs: now + 3_600_000, requestsPerPoll: 2, nowMs: now },
      // Authenticated budget leaves the behavioural policy in charge.
      { remaining: 5000, resetAtMs: now + 3_600_000, requestsPerPoll: 2, nowMs: now },
      // Exhausted quota must wait out the window.
      { remaining: 1, resetAtMs: now + 120_000, requestsPerPoll: 2, nowMs: now },
      // Unknown quota imposes no floor.
      { nowMs: now },
    ];
    for (const ctx of cases) {
      assert.strictEqual(
        clientFn(ctx),
        computeQuotaSafeIntervalMs(ctx),
        `client and TypeScript pacing must agree for ${JSON.stringify(ctx)}`,
      );
    }
  });

  it('derives a sustainable interval for a tokenless static deployment', () => {
    const now = 1_700_000_000_000;
    const intervalMs = computeQuotaSafeIntervalMs({
      remaining: 60,
      resetAtMs: now + 3_600_000,
      requestsPerPoll: 2,
      nowMs: now,
    });

    // 60 requests/hour at 2 requests per poll cannot sustain a 15s cadence.
    assert.ok(intervalMs > CLIENT_POLL_INTERVALS.FOREGROUND_IDLE_MS,
      `expected pacing slower than the idle policy, got ${intervalMs}ms`);

    const pollsPerWindow = Math.floor(3_600_000 / intervalMs);
    assert.ok(pollsPerWindow * 2 <= 60,
      `pacing must fit the quota, ${pollsPerWindow} polls would spend ${pollsPerWindow * 2} requests`);
  });

  it('lets the behavioural policy win when the quota is generous', () => {
    const now = 1_700_000_000_000;
    const floorMs = computeQuotaSafeIntervalMs({
      remaining: 5000,
      resetAtMs: now + 3_600_000,
      requestsPerPoll: 2,
      nowMs: now,
    });
    assert.ok(floorMs < CLIENT_POLL_INTERVALS.FOREGROUND_IDLE_MS,
      'an authenticated quota must not slow down normal polling');
  });

  describe('adaptive scheduler decisions', () => {
    it('stays fast while the unmetered local bridge is answering', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(true);
      // The bridge polls localhost and spends no API quota, so a starved
      // GitHub budget must not slow local sync down.
      s.rateLimit.remaining = 1;
      s.rateLimit.limit = 60;
      s.rateLimit.resetAt = Date.now() + 3_600_000;
      assert.strictEqual(s.computeSyncDelayMs(), 3000);
    });

    it('paces a tokenless deployment to its 60-per-hour budget', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(false);
      s.registry.activeMode = 'offline';
      Object.assign(s.rateLimit, {
        remaining: 60,
        limit: 60,
        resetAt: Date.now() + 3_600_000,
      });

      const delay = s.computeSyncDelayMs();
      assert.strictEqual(delay, 150_000, `expected quota pacing to dominate, got ${delay}ms`);
    });

    it('keeps an active cadence right after the user does something', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(false);
      s.registry.activeMode = 'offline';
      s.setLastActivity(Date.now());
      Object.assign(s.rateLimit, { remaining: 5000, limit: 5000, resetAt: Date.now() + 3_600_000 });

      assert.strictEqual(s.computeSyncDelayMs(), CLIENT_POLL_INTERVALS.ACTIVE_AWAITING_MS);
    });

    it('relaxes to the idle cadence once activity goes stale', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(false);
      s.registry.activeMode = 'offline';
      s.setLastActivity(Date.now() - 10 * 60_000);
      Object.assign(s.rateLimit, { remaining: 5000, limit: 5000, resetAt: Date.now() + 3_600_000 });

      assert.strictEqual(s.computeSyncDelayMs(), CLIENT_POLL_INTERVALS.FOREGROUND_IDLE_MS);
    });

    it('self-throttles as the authenticated quota drains', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(false);
      s.registry.activeMode = 'offline';
      s.setLastActivity(Date.now());
      Object.assign(s.rateLimit, { remaining: 1000, limit: 5000, resetAt: Date.now() + 3_600_000 });

      const delay = s.computeSyncDelayMs();
      assert.ok(delay > CLIENT_POLL_INTERVALS.ACTIVE_AWAITING_MS,
        `a draining quota must widen the interval, got ${delay}ms`);
    });

    it('waits out an open rate-limit window', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(false);
      Object.assign(s.rateLimit, {
        isRateLimited: true,
        rateLimitReset: Date.now() + 90_000,
      });

      const delay = s.computeSyncDelayMs();
      assert.ok(delay >= 85_000 && delay <= 90_000,
        `expected a wait close to the reset deadline, got ${delay}ms`);
    });

    it('caps the rate-limit wait so recovery is never indefinite', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(false);
      Object.assign(s.rateLimit, {
        isRateLimited: true,
        rateLimitReset: Date.now() + 3_600_000,
      });
      assert.strictEqual(s.computeSyncDelayMs(), 120_000, 'backoff must be capped at two minutes');
    });

    it('drops to a slow backstop when a realtime tier is carrying traffic', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(false);
      Object.assign(s.rateLimit, { remaining: 5000, limit: 5000, resetAt: Date.now() + 3_600_000 });

      for (const mode of ['p2p', 'live-mesh', 'live-sse']) {
        s.registry.activeMode = mode;
        assert.strictEqual(s.computeSyncDelayMs(), 60_000, `${mode} must fall back to a backstop poll`);
      }
    });

    it('still respects the quota floor while a realtime tier is active', () => {
      const s = loadScheduler(readIndexHtml());
      s.setBridgeHealthy(false);
      s.registry.activeMode = 'live-sse';
      Object.assign(s.rateLimit, { remaining: 20, limit: 60, resetAt: Date.now() + 3_600_000 });

      const delay = s.computeSyncDelayMs();
      assert.ok(delay > 60_000,
        `a starved quota must slow the backstop below its default, got ${delay}ms`);
    });
  });

  it('backs off remote polling while a rate limit window is open', () => {
    const source = extractInlineScript(readIndexHtml());
    assert.ok(source.includes('if (isRateLimitActive(gitHubRateLimit) && !manual)'),
      'syncFromGitHub must short-circuit while rate limited');
    assert.ok(source.includes('updateRateLimitFromResponse(gitHubRateLimit, branchRes)'),
      'syncFromGitHub must record rate limit headers');
  });
});
