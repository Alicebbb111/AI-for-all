'use strict';
const { buildPath, haversineM } = require('./data');
const MODES = ['live', 'replay', 'simulation'];
const fail = (message) => { throw new Error(message); };
const number = (x) => typeof x === 'number' && Number.isFinite(x);
function validate(event, kind) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('event must be an object');
  const fields = ['schemaVersion','eventId','sourceId','sourceType','mode','observedAt','busId','routeId','tripId','direction','stopId','measurementType','board','alight','onboard','capacity','crowdingLevel','confidence','windowStart','windowEnd','simulationRunId','simTimeSec','latitude','longitude','speedKmh','bearingDeg','accuracyM'];
  const e = Object.fromEntries(fields.filter(k=>event[k]!==undefined).map(k=>[k,event[k]]));
  for (const k of ['eventId', 'sourceId', 'busId', 'routeId', 'tripId']) {
    if (typeof e[k] !== 'string' || !e[k].trim() || e[k].length > 128) fail(`invalid ${k}`);
  }
  if (e.schemaVersion !== '1.0' || !MODES.includes(e.mode) || ![1, -1].includes(e.direction)) fail('invalid version, mode or direction');
  if (typeof e.observedAt !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(e.observedAt) || !Number.isFinite(Date.parse(e.observedAt))) fail('observedAt requires ISO timestamp with timezone');
  if (e.mode !== 'live' && (typeof e.simulationRunId !== 'string' || !e.simulationRunId || !number(e.simTimeSec) || e.simTimeSec < 0)) fail('simulation/replay requires simulationRunId and simTimeSec');
  if (kind === 'position') {
    if(e.measurementType!=null)fail('position cannot contain passenger measurementType');
    if (!number(e.latitude) || Math.abs(e.latitude) > 90 || !number(e.longitude) || Math.abs(e.longitude) > 180) fail('invalid coordinates');
    for (const [k, max] of [['speedKmh', 150], ['bearingDeg', 360], ['accuracyM', 1000]]) if (e[k] != null && (!number(e[k]) || e[k] < 0 || e[k] > max)) fail(`invalid ${k}`);
  } else {
    if(e.latitude!=null||e.longitude!=null)fail('passenger cannot contain position');
    if (!['camera', 'apc', 'manual', 'mock'].includes(e.sourceType)) fail('invalid sourceType');
    if (!['flow', 'occupancy'].includes(e.measurementType)) fail('invalid measurementType');
    for (const k of ['board', 'alight', 'onboard', 'capacity']) if (e[k] != null && (!Number.isInteger(e[k]) || e[k] < 0 || e[k] > 1000)) fail(`invalid ${k}`);
    if (e.capacity === 0) fail('capacity must be positive');
    if (e.measurementType === 'flow') {
      if (e.board == null || e.alight == null || e.onboard != null) fail('flow requires board/alight and no onboard');
      if (!Number.isFinite(Date.parse(e.windowStart)) || !Number.isFinite(Date.parse(e.windowEnd)) || Date.parse(e.windowStart) > Date.parse(e.windowEnd) || Date.parse(e.windowEnd) > Date.parse(e.observedAt)) fail('invalid flow window');
    } else if (e.onboard == null || e.board != null || e.alight != null) fail('occupancy requires onboard and no board/alight');
    if (e.confidence != null && (!number(e.confidence) || e.confidence < 0 || e.confidence > 1)) fail('invalid confidence');
    if (e.crowdingLevel != null && ![0, 1, 2].includes(e.crowdingLevel)) fail('invalid crowdingLevel');
  }
  return e;
}

// Translate only aggregate counts. Never retain frames, face IDs or tracking IDs.
function passengerAdapter(raw) {
  const names = ['schemaVersion', 'eventId', 'sourceId', 'sourceType', 'mode', 'observedAt', 'busId', 'routeId', 'tripId', 'direction', 'stopId', 'measurementType', 'board', 'alight', 'onboard', 'capacity', 'crowdingLevel', 'confidence', 'windowStart', 'windowEnd', 'simulationRunId', 'simTimeSec'];
  return Object.fromEntries(names.filter(k => raw[k] !== undefined).map(k => [k, raw[k]]));
}
function projectPosition(e, path) {
  let best = null;
  const scale = Math.cos(e.latitude * Math.PI / 180);
  for (let i = 1; i < path.path.length; i++) {
    const a = path.path[i - 1], b = path.path[i];
    const dx = (b.lng - a.lng) * scale, dy = b.lat - a.lat;
    const t = Math.max(0, Math.min(1, (((e.longitude - a.lng) * scale) * dx + (e.latitude - a.lat) * dy) / (dx * dx + dy * dy || 1)));
    const p = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    const distanceM = haversineM([e.latitude, e.longitude], [p.lat, p.lng]);
    if (!best || distanceM < best.distanceM) best = { s: a.s + t * (b.s - a.s), distanceM };
  }
  return best;
}
class Telemetry {
  constructor(routes, { now = () => Date.now(), maxAgeSec = 90 } = {}) {
    this.routes = routes; this.now = now; this.maxAgeSec = maxAgeSec;
    this.paths = new Map(); this.streams = new Map(); this.seen = new Map(); this.revision = 0;
  }
  key(e) { return `${e.mode}:${e.mode === 'live' ? 'live' : e.simulationRunId}:${e.routeId}:${e.busId}`; }
  ingest(raw, kind) {
    const e = validate(kind === 'passenger' ? passengerAdapter(raw) : raw, kind);
    const route = this.routes[e.routeId];
    if (!route || !route.FLEET_PLAN.some(b => b.id === e.busId)) fail('unknown bus or route');
    if (e.stopId != null && !route.STOPS.some(s => s.id === e.stopId)) fail('unknown stop');
    const now = this.now(), age = (now - Date.parse(e.observedAt)) / 1000;
    if (age < -30) fail('event is in the future');
    if (e.mode === 'live' && age > (kind==='position'?this.maxAgeSec:3600)) fail('stale event');
    const id = `${e.sourceId}:${e.eventId}`;
    if (this.seen.has(id)) return { ok: true, duplicate: true, applied: false };
    if (kind === 'position') {
      if (!this.paths.has(e.routeId)) this.paths.set(e.routeId, buildPath(route.ROUTE_POINTS));
      const match = projectPosition(e, this.paths.get(e.routeId));
      if (!match || match.distanceM > Math.max(100, e.accuracyM || 0)) fail('position is outside route corridor');
      e.s = match.s;
    }
    const key = this.key(e), stream = this.streams.get(key) || { events: [], run: e.simulationRunId || null };
    const time = x => x.mode === 'live' ? Date.parse(x.observedAt) / 1000 : x.simTimeSec;
    const latest = stream.events.filter(x => x.kind === kind).at(-1);
    if (stream.events.some(x=>x.tripId===e.tripId&&x.direction!==e.direction)) fail('direction changed within trip');
    const outOfOrder = !!latest && time(e) < time(latest);
    if(kind==='position' && latest && latest.tripId===e.tripId && time(e)>time(latest)) {
      const dt=time(e)-time(latest);
      if(haversineM([latest.latitude,latest.longitude],[e.latitude,e.longitude])/dt>150/3.6)fail('implausible GPS jump');
      if(e.direction*(e.s-latest.s)<-100)fail('GPS progress contradicts trip direction');
    }
    if(kind==='passenger' && e.measurementType==='flow' && stream.events.some(x=>x.kind==='passenger'&&x.measurementType==='flow'&&x.tripId===e.tripId&&Date.parse(x.windowStart)<Date.parse(e.windowEnd)&&Date.parse(e.windowStart)<Date.parse(x.windowEnd)))fail('overlapping flow windows');
    // Retain bounded ordered history. Late passenger events are replayed from the latest occupancy anchor.
    if (stream.events.length >= 500 && time(e) <= time(stream.events[0])) fail('event older than retained history');
    e.kind = kind; e.receivedAt = new Date(now).toISOString();
    stream.events.push(e); stream.events.sort((a, b) => time(a) - time(b) || (a.measurementType==='occupancy'?1:0)-(b.measurementType==='occupancy'?1:0) || a.eventId.localeCompare(b.eventId));
    if (stream.events.length > 500) {
      const removed = stream.events.shift();
      if (removed.kind === 'passenger') stream.base = applyPassenger(stream.base, removed);
    }
    this.streams.delete(key); this.streams.set(key, stream);
    if (this.streams.size > 500) this.streams.delete(this.streams.keys().next().value);
    this.seen.set(id, now); if (this.seen.size > 50000) this.seen.delete(this.seen.keys().next().value);
    this.revision++;
    return { ok: true, duplicate: false, outOfOrder, applied: true, receivedAt: e.receivedAt };
  }
  vehicles(mode, routeId, runId) {
    const result = [];
    for (const stream of this.streams.values()) {
      const position = stream.events.filter(e => e.kind === 'position').at(-1);
      if (!position || position.mode !== mode || position.routeId !== routeId || (mode !== 'live' && position.simulationRunId !== runId)) continue;
      let passenger = stream.base?.tripId===position.tripId ? stream.base : null;
      for (const e of stream.events) if (e.kind === 'passenger' && e.tripId === position.tripId && e.direction === position.direction) passenger = applyPassenger(passenger, e);
      const clock=mode==='live'?this.now()/1000:Math.max(...[...this.streams.values()].flatMap(s=>s.events.filter(x=>x.mode===mode&&x.simulationRunId===runId).map(x=>x.simTimeSec)));
      const age = clock-(mode==='live'?Date.parse(position.observedAt)/1000:position.simTimeSec);
      const passengerAge=passenger?clock-(mode==='live'?Date.parse(passenger.observedAt)/1000:passenger.simTimeSec):Infinity;
      const flow=stream.events.filter(x=>x.kind==='passenger'&&x.measurementType==='flow'&&x.tripId===position.tripId&&x.direction===position.direction).at(-1);
      const flowAge=flow?clock-(mode==='live'?Date.parse(flow.observedAt)/1000:flow.simTimeSec):Infinity;
      result.push({ ...position, passenger:passengerAge<=this.maxAgeSec?passenger:null, lastFlow:flowAge<=this.maxAgeSec?flow:null, capacity:passengerAge<=this.maxAgeSec?passenger?.capacity??null:null, gpsOk:age <= this.maxAgeSec, gpsStaleSec: age, onboardEst: passengerAge<=this.maxAgeSec ? passenger?.onboard ?? null : null, speedKmh: position.speedKmh ?? null, lat: position.latitude, lng: position.longitude });
    }
    return result;
  }
}
function applyPassenger(previous, e) {
  const same = previous?.tripId === e.tripId;
  const before = same ? previous.onboard : null;
  return { ...e, onboard: e.measurementType === 'occupancy' ? e.onboard : before == null ? null : Math.max(0, before + e.board - e.alight), board: e.board ?? null, alight: e.alight ?? null };
}
module.exports = { Telemetry, validate, passengerAdapter, projectPosition, applyPassenger };
