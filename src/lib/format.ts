const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const cad0 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

export const money = (n: number) => cad.format(Math.round((n || 0) * 100) / 100);
export const money0 = (n: number) => cad0.format(Math.round(n || 0));
export const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
export const uid = () => Math.random().toString(36).slice(2, 10);

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const parseMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1);
};
export const addMonths = (m: string, n: number) => {
  const d = parseMonth(m);
  d.setMonth(d.getMonth() + n);
  return monthKey(d);
};
export const monthsBetween = (from: string, to: string) => {
  const a = parseMonth(from);
  const b = parseMonth(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
};
export const monthLabel = (m: string, style: 'long' | 'short' = 'long') =>
  parseMonth(m).toLocaleString('en-CA', style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' });
export const daysIn = (m: string) => {
  const d = parseMonth(m);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};
export const dayOf = (iso: string) => Number(iso.slice(8, 10)) || 1;
export const isoDay = (m: string, day: number) => `${m}-${String(day).padStart(2, '0')}`;
export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
export const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();
