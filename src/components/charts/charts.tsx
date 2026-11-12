import { scaleLinear } from 'd3-scale';
import { arc, area, curveMonotoneX, line, pie } from 'd3-shape';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useMounted, useWidth } from '@/lib/hooks';

interface TrendProps {
  values: number[];
  /** Index of the last real point. Later points are not drawn. */
  upTo?: number;
  /** A dashed reference that climbs evenly to this total. */
  pace?: number;
  paceLabel?: string;
  color?: string;
  height?: number;
  label: (i: number) => string;
  format: (n: number) => string;
  ticks?: number[];
}

/** A filled line chart with a touch and hover readout. */
export function TrendChart({ values, upTo, pace, paceLabel, color = '#4b3fe4', height = 180, label, format, ticks }: TrendProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const last = Math.min(values.length - 1, upTo ?? values.length - 1);
  const shown = values.slice(0, last + 1);
  const pad = { t: 14, b: 22, l: 2, r: 2 };
  const lo = pace === undefined ? Math.min(...shown) : 0;
  const hi = Math.max(...shown, pace ?? 0, lo + 1);
  const x = scaleLinear().domain([0, Math.max(1, values.length - 1)]).range([pad.l, Math.max(pad.l + 1, width - pad.r)]);
  const y = scaleLinear().domain([pace === undefined ? lo - (hi - lo) * 0.15 : 0, hi * 1.06]).range([height - pad.b, pad.t]);
  const pts = shown.map((v, i) => [x(i), y(v)] as [number, number]);
  const stroke = line().curve(curveMonotoneX)(pts) ?? '';
  const fill = area().curve(curveMonotoneX).y0(height - pad.b)(pts) ?? '';
  const id = `g${color.replace('#', '')}`;
  const at = hover ?? last;
  const onMove = (clientX: number, el: Element) => {
    const rect = el.getBoundingClientRect();
    setHover(Math.max(0, Math.min(last, Math.round(x.invert(clientX - rect.left)))));
  };
  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="touch-pan-y overflow-visible" onPointerMove={e => onMove(e.clientX, e.currentTarget)} onPointerDown={e => onMove(e.clientX, e.currentTarget)} onPointerLeave={() => setHover(null)} role="img" aria-label={`${label(last)}: ${format(shown[last] ?? 0)}`}>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.22" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {pace !== undefined && <line x1={x(0)} y1={y(0)} x2={x(values.length - 1)} y2={y(pace)} stroke="#94a0b8" strokeWidth="1.5" strokeDasharray="4 5" />}
          <path d={fill} fill={`url(#${id})`} className="animate-rise" />
          <path d={stroke} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" pathLength={1} strokeDasharray="1" className="animate-draw" />
          {hover !== null && <line x1={x(at)} x2={x(at)} y1={pad.t} y2={height - pad.b} stroke="#0f172a" strokeOpacity="0.15" />}
          {pts[at] && <circle cx={pts[at][0]} cy={pts[at][1]} r="5" fill="#fff" stroke={color} strokeWidth="2.5" />}
          {(ticks ?? []).map(i => (
            <text key={i} x={x(i)} y={height - 4} textAnchor={i === 0 ? 'start' : i === values.length - 1 ? 'end' : 'middle'} className="fill-muted text-[11px]">{label(i)}</text>
          ))}
        </svg>
      )}
      {width > 0 && hover !== null && pts[at] && (
        <div className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-xs font-semibold text-white" style={{ left: Math.max(48, Math.min(width - 48, pts[at][0])), top: Math.max(0, pts[at][1] - 38) }}>
          <span className="num">{format(shown[at])}</span> <span className="font-normal opacity-70">{label(at)}</span>
        </div>
      )}
      {pace !== undefined && paceLabel && width > 0 && <span className="absolute right-0 text-[11px] text-muted" style={{ top: Math.max(0, y(pace) - 16) }}>{paceLabel}</span>}
    </div>
  );
}

export interface Bar { key: string; label: string; value: number }

/** Vertical bars. Tap one to select it. */
export function BarChart({ bars, active, onSelect, target, height = 140, format }: { bars: Bar[]; active?: string; onSelect?: (key: string) => void; target?: number; height?: number; format: (n: number) => string }) {
  const mounted = useMounted();
  const max = Math.max(1, target ?? 0, ...bars.map(b => b.value));
  const top = 20;
  return (
    <div className="relative flex items-end gap-2" style={{ height }}>
      {target !== undefined && target > 0 && <div className="absolute inset-x-0 border-t border-dashed border-[#94a0b8]" style={{ bottom: 22 + (target / max) * (height - 22 - top) }} aria-hidden />}
      {bars.map(b => {
        const on = b.key === active;
        const h = mounted ? Math.max(4, (b.value / max) * (height - 22 - top)) : 4;
        return (
          <button key={b.key} type="button" onClick={() => onSelect?.(b.key)} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5" style={{ height }} aria-label={`${b.label}: ${format(b.value)}`} aria-pressed={on}>
            <span className={cn('num text-[11px] font-semibold transition', on ? 'text-ink' : 'text-transparent group-hover:text-muted')}>{format(b.value)}</span>
            <span className={cn('w-full max-w-12 rounded-lg transition-[height,background-color] duration-700 ease-out', on ? 'bg-brand' : 'bg-brand/25 group-hover:bg-brand/45', target !== undefined && b.value > target && on && 'bg-bad')} style={{ height: h }} />
            <span className={cn('text-[11px]', on ? 'font-bold text-ink' : 'text-muted')}>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface Slice { label: string; value: number; color: string }

/** A ring split into slices, with whatever you pass shown in the middle. */
export function Donut({ slices, size = 180, thickness = 22, children, onHover }: { slices: Slice[]; size?: number; thickness?: number; children?: ReactNode; onHover?: (i: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const r = size / 2;
  const data = slices.filter(s => s.value > 0);
  const arcs = pie<Slice>().value(d => d.value).sort(null).padAngle(data.length > 1 ? 0.025 : 0)(data);
  const set = (i: number | null) => { setHover(i); onHover?.(i === null ? null : slices.indexOf(data[i])); };
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} className="animate-pop" role="img" aria-label={data.map(d => d.label).join(', ')}>
        {!data.length && <circle r={r - thickness / 2} fill="none" stroke="#e2e6ef" strokeWidth={thickness} />}
        {arcs.map((a, i) => (
          <path
            key={a.data.label}
            d={arc<typeof a>().innerRadius(r - thickness - (hover === i ? 2 : 0)).outerRadius(r - (hover === i ? 0 : 3)).cornerRadius(5)(a) ?? ''}
            fill={a.data.color}
            opacity={hover === null || hover === i ? 1 : 0.35}
            className="transition-opacity duration-150"
            onPointerEnter={() => set(i)}
            onPointerLeave={() => set(null)}
            onClick={() => set(hover === i ? null : i)}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>{hover !== null && data[hover] ? <><div className="text-xs text-muted">{data[hover].label}</div><div className="display text-xl font-bold">{Math.round((data[hover].value / data.reduce((a, d) => a + d.value, 0)) * 100)}%</div></> : children}</div>
      </div>
    </div>
  );
}

/** One horizontal bar divided into labelled parts. */
export function SplitBar({ parts, height = 14, className }: { parts: Slice[]; height?: number; className?: string }) {
  const mounted = useMounted();
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div className={cn('flex gap-0.5 overflow-hidden rounded-full bg-ink/8', className)} style={{ height }} role="img" aria-label={parts.map(p => `${p.label} ${Math.round((Math.max(0, p.value) / total) * 100)}%`).join(', ')}>
      {parts.map(p => (
        <div key={p.label} className="h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full" style={{ width: mounted ? `${(Math.max(0, p.value) / total) * 100}%` : '0%', backgroundColor: p.color }} />
      ))}
    </div>
  );
}

export function Legend({ parts, format }: { parts: Slice[]; format: (n: number) => string }) {
  return (
    <ul className="grid gap-1.5">
      {parts.map(p => (
        <li key={p.label} className="flex items-center gap-2 text-sm">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-muted">{p.label}</span>
          <span className="num font-semibold">{format(p.value)}</span>
        </li>
      ))}
    </ul>
  );
}
