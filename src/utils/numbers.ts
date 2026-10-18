export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundPrice(value: number): number {
  return Number(value.toFixed(2));
}

export function roundSize(value: number): number {
  return Number(value.toFixed(6));
}

export function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
