export function random(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function lane(seed, row) {
  const rng = random((seed ^ Math.imul(row + 1, 2654435761)) >>> 0);
  if (row < 3 || row % 5 === 0) return {row, type: 'grass', item: row > 0 && row % 10 === 0 ? ['coffee', 'umbrella'][Math.floor(rng() * 2)] : null, itemX: Math.floor(rng() * 9)};
  const type = row % 7 === 0 ? 'water' : rng() < .17 ? 'walk' : 'road';
  const result = {row, type, direction: rng() < .5 ? -1 : 1, speed: (.65 + rng() * .65) * (1 + Math.min(row / 150, 1)), offset: rng() * 14, gap: type === 'walk' ? 9 : 4.5 + rng() * 2.2, length: type === 'water' ? 1.15 : type === 'walk' ? .7 : 1.35, color: Math.floor(rng() * 4), item: row % 7 === 1 ? 'card' : null, itemX: Math.floor(rng() * 9)};
  result.variant = type === 'walk' ? (rng() < .5 ? 'survey' : 'drunk') : result.color === 3 ? 'scooter' : 'car';
  if(type === 'road' && result.variant === 'scooter'){result.length=.8;result.speed*=1.35;}
  return result;
}
export function obstacles(l, time, multiplier = 1) {
  if (l.type === 'grass') return [];
  const travel = l.variant === 'drunk' ? Math.sin(time * l.speed * multiplier / 2) * 3 : time * l.speed * l.direction * multiplier;
  const offset = ((l.offset + travel) % l.gap + l.gap) % l.gap;
  const values = [];
  for (let x = offset - l.gap; x < 11; x += l.gap) values.push(x);
  return values;
}
export function collision(l, x, time, multiplier = 1) {
  return obstacles(l, time, multiplier).some(pos => Math.abs(pos - x) < (l.length + .52) / 2);
}
export function score(distance, cards) { return distance * 10 + cards * 50; }
