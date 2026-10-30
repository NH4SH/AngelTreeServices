import test from 'node:test';
import assert from 'node:assert/strict';
import { cashBuckets, reconcileCashSeries, dashboardPeriod } from './cash-series.ts';

test('dashboard ranges are bounded and unknown/custom inputs cannot fan out reads', () => {
  for (const value of ['month', 'last_7', 'last_30', 'last_90', 'year']) assert.equal(dashboardPeriod(value), value);
  for (const value of [undefined, 'custom', 'all', ['last_90'], '../../']) assert.equal(dashboardPeriod(value), 'month');
});

test('business-calendar buckets cover every date exactly once across DST and leap years', () => {
  for (const [start, end] of [['2026-03-01','2026-03-31'], ['2026-10-21','2026-11-19'], ['2024-01-01','2024-12-31'], ['2026-10-21','2026-10-21']]) {
    const buckets = cashBuckets(start, end);
    assert.ok(buckets.length >= 1 && buckets.length <= 7);
    assert.equal(buckets[0].start, start); assert.equal(buckets.at(-1).end, end);
    for (let i = 1; i < buckets.length; i++) {
      assert.equal(Date.parse(buckets[i].start) - Date.parse(buckets[i-1].end), 86400000);
    }
    assert.ok(buckets.every(b => b.start <= b.end));
  }
});

test('bucket coverage holds for every supported year-to-date length', () => {
  for (let days = 1; days <= 366; days++) {
    const start = '2024-01-01'; const end = new Date(Date.parse(start) + (days - 1) * 86400000).toISOString().slice(0,10);
    const buckets = cashBuckets(start, end);
    const covered = buckets.reduce((n,b) => n + (Date.parse(b.end) - Date.parse(b.start))/86400000 + 1, 0);
    assert.equal(covered, days); assert.equal(buckets.length, Math.min(7,days));
  }
});

test('invalid, reversed and unbounded periods are rejected', () => {
  for (const dates of [['2026-02-30','2026-03-01'], ['bad','2026-01-01'], ['2026-01-02','2026-01-01'], ['2020-01-01','2026-01-01']]) assert.throws(() => cashBuckets(...dates));
});

test('cash timeline preserves exact cents and zero buckets without rounding', () => {
  const buckets = cashBuckets('2026-10-01','2026-10-03');
  const points = reconcileCashSeries(buckets, [10001,0,299],10300);
  assert.deepEqual(points.map(p=>p.cumulativeCents),[10001,10001,10300]);
  assert.deepEqual(points.map(p=>p.cents),[10001,0,299]);
});

test('partial reads and concurrent restatements never become a plausible line', () => {
  const buckets = cashBuckets('2026-10-01','2026-10-03');
  assert.throws(()=>reconcileCashSeries(buckets,[100,200],300));
  assert.throws(()=>reconcileCashSeries(buckets,[100,200,300],500));
  for (const invalid of [NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>reconcileCashSeries(buckets,[invalid,0,0],0));
  assert.throws(()=>reconcileCashSeries(buckets,[Number.MAX_SAFE_INTEGER,1,0],Number.MAX_SAFE_INTEGER));
});

test('an empty receipt period produces an honest zero baseline', () => {
  const buckets = cashBuckets('2026-10-01','2026-10-07');
  assert.ok(reconcileCashSeries(buckets, Array(7).fill(0),0).every(p=>p.cumulativeCents===0));
});
