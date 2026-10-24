// The band and its menu as SVG, laid out in pixels for the band's width. Pure:
// each function returns strings and numbers; nothing here touches the engine.
//
// Band: six chips (5H, 7D, CACHE, SPENT, TOKENS, NEXT), a label over a value
// each, in equal widths: six in a row, else two rows of three, else three rows
// of two. Menu: the same chips, in as many columns as the width holds. Gauges are
// rows of dots throughout.

import type { CacheState } from './pricing'

// ---------- Palette ----------
/** The band's colours, by role. */
export const PAL = {
  surface: '#24221c',
  ink: '#e8e2d2',
  muted: '#8d8775',
  track: '#4a463b',
  h5: '#f5a623',
  d7: '#ff6b1a',
  warm: '#cc6363',
  cold: '#6aaabd',
  shade: '#1c1a16',
} as const

/** The colour of a cache state: red while warm, blue once cold. */
export const tone = (state: CacheState): string => (state === 'warm' ? PAL.warm : PAL.cold)

// ---------- Type: one font, two sizes ----------
const LS = 10.5 // labels: caps, weight 500, tracked
const VS = 15 // values: weight 600, tabular figures
const TRACK = 0.12 * LS
const CAP = 0.7 // Outfit's cap height, in em

// ---------- Geometry ----------
const DOT_R = 2
const PITCH = 6
const PILL_H = 10
const PILL_X = 4
/**
 * CSS pixels per character cell on the desktop app. MEASURED in the running
 * app, not documented: the engine gives no pixel width. Kept low on purpose:
 * an Svg wider than its slot is scaled down (text shrinks), one narrower only
 * leaves a few pixels of slack.
 */
export const CELL_PX_DESKTOP = 8
/** The band's controls beside its Svg, in cells: stacked in a column (multi-row band), or side by side (one row). */
export const CONTROLS_COL_CELLS = 4
export const CONTROLS_ROW_CELLS = 8

/** An Svg's width in CSS pixels for the band's body columns, the controls' cells taken off. */
export const svgPx = (bodyColumns: number, controlsCells: number): number =>
  Math.max(120, Math.floor((bodyColumns - controlsCells) * CELL_PX_DESKTOP))

// ---------- Measuring ----------
// Outfit's advance widths in thousandths of an em at weights 500 and 600, tabular
// figures on, read from the embedded font's hmtx and HVAR tables.
type Weight = 500 | 600
const GLYPHS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·'
const ADV: Record<Weight, number[]> = {
  500: [
    200, 262, 426, 641, 584, 658, 669, 242, 299, 299, 491, 547, 276, 461, 290, 401, 590, 590, 590, 590, 590, 590, 590, 590,
    590, 590, 271, 269, 547, 547, 547, 506, 737, 702, 622, 683, 740, 590, 566, 772, 712, 267, 494, 672, 550, 842, 717, 794,
    604, 820, 628, 556, 619, 690, 696, 982, 698, 672, 589, 341, 401, 341, 451, 481, 293, 580, 580, 487, 580, 534, 403, 575,
    551, 234, 242, 511, 232, 861, 551, 563, 580, 580, 425, 430, 378, 517, 510, 754, 509, 518, 451, 326, 282, 326, 547, 146,
  ],
  600: [
    195, 274, 441, 652, 594, 671, 680, 246, 304, 304, 490, 555, 280, 462, 295, 393, 590, 590, 590, 590, 590, 590, 590, 590,
    590, 590, 281, 275, 555, 555, 555, 503, 747, 715, 631, 686, 747, 602, 578, 778, 721, 280, 513, 688, 556, 850, 727, 800,
    616, 820, 640, 569, 629, 696, 705, 992, 707, 679, 598, 345, 393, 345, 459, 493, 308, 588, 588, 492, 588, 541, 419, 579,
    562, 248, 257, 528, 247, 867, 562, 569, 588, 588, 434, 444, 389, 528, 523, 769, 523, 526, 466, 334, 291, 334, 555, 164,
  ],
}

/**
 * The table is Outfit's; the text draws in Segoe UI. 10% more than the table says,
 * so a figure measured to fit still fits in the other face.
 */
const WIDTH_MARGIN = 1.1

/** Width in pixels of a text at a size and weight, with letter spacing between glyphs. Unknown glyphs count 0.75 em. */
export const textW = (s: string, size: number, weight: Weight, ls = 0): number => {
  let sum = 0
  let n = 0
  for (const ch of s) {
    const i = GLYPHS.indexOf(ch)
    sum += i < 0 ? 750 : (ADV[weight][i] ?? 750)
    n += 1
  }
  return ((sum / 1000) * size + ls * Math.max(0, n - 1)) * WIDTH_MARGIN
}

// ---------- Formatting ----------
const sig3 = (v: number, unit: string): string => (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.round(v))) + unit

/** Token counts to three figures: 812, 12.4k, 184k, 2.13M. */
export const fmtTok = (n: number): string =>
  n < 1000 ? String(Math.round(n)) : n < 999_500 ? sig3(n / 1e3, 'k') : sig3(n / 1e6, 'M')

/** A context window as people name it: 200k, 1M. */
const fmtWindow = (n: number): string => (n >= 1e6 && n % 1e6 === 0 ? `${n / 1e6}M` : n >= 1e3 && n % 1e3 === 0 ? `${n / 1e3}k` : fmtTok(n))

/** A stretch of time, short: 42m, 1h19, 1d4h. */
export const shortSpan = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 60_000))
  const days = Math.floor(total / 1440)
  const hrs = Math.floor((total % 1440) / 60)
  const mins = total % 60
  if (days > 0) return `${days}d${hrs}h`
  return hrs > 0 ? `${hrs}h${String(mins).padStart(2, '0')}` : `${mins}m`
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// ---------- What the band draws ----------
/** One usage window: percent used (whole number), the time to its reset ('' when unknown), and when that is ('14:32', 'Fri 17:13'). */
export type Gauge = { used: number; reset: string; at: string }
/** What the next message costs on one model family. */
export type Price = { id: string; name: string; usd: number; isMine: boolean }
/** One subagent of this session and what its turns cost. */
export type AgentCost = { name: string; usd: number }

export type BandView = {
  h5: Gauge | null
  d7: Gauge | null
  /** The prompt cache: warm with minutes left ('59m'), or cold with idle time ('1h12'); null before the first reply. */
  cache: { mode: CacheState; time: string; idleMin: number } | null
  /** Tokens in the cache, the model's context window, and their share (0 to 1, null when the window is unknown). */
  tokens: number
  window: number
  share: number | null
  prices: Price[]
  /** The top of the price bars' scale: the dearest cold re-cache, so a warm read shows as the small bar it is. */
  priceTop: number
  usd: number
  prompts: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  agents: AgentCost[]
  /** Whether the cache chip shows the mascot: a setting, off unless chosen. */
  mascot: boolean
}

// ---------- Drawing pieces ----------
const n2 = (v: number): string => String(Math.round(v * 100) / 100)

type Item = { w: number; svg: (x: number, base: number) => string }

const text = (s: string, size: number, weight: Weight, fill: string, ls = 0): Item => ({
  w: textW(s, size, weight, ls),
  svg: (x, b) =>
    `<text x="${n2(x)}" y="${n2(b)}" font-size="${size}" font-weight="${weight}" fill="${fill}"` +
    (ls ? ` letter-spacing="${n2(ls)}"` : '') +
    `>${esc(s)}</text>`,
})
const label = (s: string, fill: string = PAL.muted): Item => text(s.toUpperCase(), LS, 500, fill, TRACK)
const val = (s: string, fill: string = PAL.ink): Item => text(s, VS, 600, fill)
const soft = (s: string, fill: string = PAL.muted): Item => text(s, VS, 500, fill)
const space = (w: number): Item => ({ w, svg: () => '' })

const run = (items: Item[]): Item => ({
  w: items.reduce((a, i) => a + i.w, 0),
  svg: (x, b) => {
    let s = ''
    let cx = x
    for (const i of items) {
      s += i.svg(cx, b)
      cx += i.w
    }
    return s
  },
})

/** A filled pill: dark caps on a colour, the WARM / COLD look. Centred on a label line, or on a value line. */
const pill = (word: string, fill: string, onValue = false): Item => {
  const w = textW(word, LS, 600, TRACK) + 2 * PILL_X
  return {
    w,
    svg: (x, b) => {
      const cy = b - ((onValue ? VS : LS) * CAP) / 2
      return (
        `<rect x="${n2(x)}" y="${n2(cy - PILL_H / 2)}" width="${n2(w)}" height="${PILL_H}" rx="3" fill="${fill}"/>` +
        `<text x="${n2(x + PILL_X)}" y="${n2(cy + (LS * CAP) / 2)}" font-size="${LS}" font-weight="600" fill="${PAL.shade}" letter-spacing="${n2(TRACK)}">${word}</text>`
      )
    },
  }
}

/** A row of `n` dots centred on `cy`: `lit` of them in `fill`, the rest PAL.track. */
const dotRow = (x: number, cy: number, n: number, lit: number, fill: string): string => {
  let s = ''
  for (let i = 0; i < n; i++) s += `<circle cx="${n2(x + DOT_R + i * PITCH)}" cy="${n2(cy)}" r="${DOT_R}" fill="${i < lit ? fill : PAL.track}"/>`
  return s
}
/** How many dots fit between x0 and x1. */
const dotsIn = (x0: number, x1: number): number => Math.max(0, Math.floor((x1 - x0 - 2 * DOT_R) / PITCH) + 1)
const litOf = (share: number, n: number): number => (share > 0 ? Math.max(1, Math.round(Math.min(1, share) * n)) : 0)

const money = (n: number, fill: string = PAL.ink): Item => run([text('$', VS, 600, PAL.muted), val(n.toFixed(2), fill)])

/** Text cut with an ellipsis to fit `w` pixels. */
const fit = (s: string, size: number, weight: Weight, w: number): string => {
  if (textW(s, size, weight) <= w) return s
  let t = s
  while (t.length > 1 && textW(t + '…', size, weight) > w) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

// The app blocks an Svg's embedded fonts, so the band uses the system's sans: Segoe UI
// on Windows. The root carries the family too, as an attribute.
const FAMILY = `'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif`

const svgDoc = (w: number, h: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FAMILY}">` +
  `<style>svg,text{font-family:${FAMILY};font-feature-settings:'tnum'}</style>` +
  body +
  '</svg>'

// ---------- tuzzo: the cache's mascot ----------
// A pixel portrait, head and shoulders: thick curly dark hair, olive skin, blue
// eyes, a short full beard with a mouth gap, broad shoulders in a dark shirt. Warm,
// he bobs over a soft shadow and blinks now and then; cold, he stands frozen under
// a frost wash with snow about him. The motion is SMIL, so it plays only where the
// Svg animates; drawn as a still image he rests.
const TUZZO_GRID = [
  '..chcchc..',
  '.hhchhchh.',
  '.hssssssh.',
  '.swwsswws.',
  '.ssessess.',
  '.bssnnssb.',
  '.bsbbbbsb.',
  '.bbbmmbbb.',
  '..bbbbbb..',
  'ttttsstttt',
]
/** The portrait's colours, by grid letter. */
const TUZZO_INK: Record<string, string> = {
  h: '#2a201b', // hair
  c: '#4a382e', // lighter curls along the top
  w: '#2a201b', // eyebrows
  s: '#b98a63', // skin
  n: '#a3744f', // the shade of the nose
  e: '#5b9be0', // eyes
  b: '#3d2c22', // beard, a warmer brown than the hair so the two read apart
  m: '#8e5a46', // lips
  t: '#3a3630', // shirt
}

/** Mixes two #rrggbb colours: t = 0 gives `from`, t = 1 gives `to`. */
const blend = (from: string, to: string, t: number): string => {
  const a = parseInt(from.slice(1), 16)
  const b = parseInt(to.slice(1), 16)
  const channel = (shift: number): number => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return '#' + ((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')
}

/**
 * Every cell of the given letters as one path, each row's neighbouring cells
 * merged into one bar, so no hairline shows between them at small sizes.
 */
const gridPath = (letters: string, unit: number, fill: string): string => {
  let d = ''
  TUZZO_GRID.forEach((cells, row) => {
    let start = -1
    for (let col = 0; col <= cells.length; col++) {
      const hit = col < cells.length && letters.includes(cells.charAt(col))
      if (hit && start < 0) start = col
      if (!hit && start >= 0) {
        const len = (col - start) * unit
        d += `M${n2(start * unit)} ${n2(row * unit)}h${n2(len)}v${n2(unit)}h${n2(-len)}z`
        start = -1
      }
    }
  })
  return d ? `<path d="${d}" fill="${fill}"/>` : ''
}

/** The whole portrait, each letter in its colour after `shade` (a frost wash, or none). */
const portrait = (unit: number, shade: (hex: string) => string): string =>
  Object.entries(TUZZO_INK)
    .map(([letter, hex]) => gridPath(letter, unit, shade(hex)))
    .join('')

/** The mascot in a square `size` px wide, its top-left corner at x, y. */
export const tuzzoShapes = (x: number, y: number, size: number, state: CacheState): string => {
  const unit = size / 11
  const left = x + unit / 2
  const top = y + unit / 2
  if (state === 'warm') {
    // One eased 1.2 s beat drives the bob and the shadow.
    const beat = 'dur="1.2s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"'
    const shadow = [3.6, 2.9, 3.6].map(k => n2(k * unit)).join(';')
    return (
      `<g transform="translate(${n2(left)} ${n2(top)})">` +
      `<ellipse cx="${n2(5 * unit)}" cy="${n2(10.25 * unit)}" rx="${n2(3.6 * unit)}" ry="${n2(0.4 * unit)}" fill="#000" fill-opacity="0.4">` +
      `<animate attributeName="rx" values="${shadow}" ${beat}/></ellipse>` +
      `<g shape-rendering="crispEdges"><animateTransform attributeName="transform" type="translate" values="0 0;0 ${n2(-1.1 * unit)};0 0" ${beat}/>` +
      portrait(unit, hex => hex) +
      // Every 3.4 s he blinks: skin covers both eyes for a moment.
      `<g opacity="0">${gridPath('e', unit, TUZZO_INK.s ?? '#b98a63')}` +
      `<animate attributeName="opacity" dur="3.4s" repeatCount="indefinite" keyTimes="0;0.9;0.91;0.95;1" values="0;0;1;1;0"/></g>` +
      `</g></g>`
    )
  }
  const flake = (cx: number, cy: number): string =>
    `<rect x="${n2(cx * unit)}" y="${n2(cy * unit)}" width="${n2(0.6 * unit)}" height="${n2(0.6 * unit)}" fill="#ffffff" fill-opacity="0.9"/>`
  return (
    `<g transform="translate(${n2(left)} ${n2(top)})" shape-rendering="crispEdges">` +
    portrait(unit, hex => blend(hex, '#ffffff', 0.45)) +
    // Snow resting on his curls, and a few flakes in the air around him.
    `<rect x="${n2(2 * unit)}" y="0" width="${n2(6 * unit)}" height="${n2(0.4 * unit)}" fill="#ffffff" fill-opacity="0.8"/>` +
    flake(-0.4, 1.4) +
    flake(9.6, 2.2) +
    flake(0.2, 5.6) +
    flake(9.3, 6.4) +
    `</g>`
  )
}

// ---------- Text lines: one <text>, its runs as <tspan>s ----------
// A line that mixes runs is ONE text element: the renderer flows the runs, and a
// gap is a dx on the next tspan. The width table only decides what fits; it
// never places a run that follows another.
type Span = { s: string; size: number; weight: Weight; fill: string; ls: number; dx: number }

const sLabel = (s: string, fill: string = PAL.muted, dx = 0): Span => ({ s: s.toUpperCase(), size: LS, weight: 500, fill, ls: TRACK, dx })
const sVal = (s: string, fill: string = PAL.ink, dx = 0): Span => ({ s, size: VS, weight: 600, fill, ls: 0, dx })
const sSoft = (s: string, fill: string = PAL.muted, dx = 0): Span => ({ s, size: VS, weight: 500, fill, ls: 0, dx })
const sMoney = (n: number, fill: string = PAL.ink, dx = 0): Span[] => [
  { s: '$', size: VS, weight: 600, fill: PAL.muted, ls: 0, dx },
  sVal(n.toFixed(2), fill),
]
/** A middle dot between two runs, 5 px either side. */
const sDot = (): Span => sSoft('·', PAL.muted, 5)
const after = (spans: Span[], dx: number): Span[] => spans.map((s, i) => (i === 0 ? { ...s, dx } : s))

const spansW = (spans: Span[]): number => spans.reduce((a, s) => a + textW(s.s, s.size, s.weight, s.ls) + s.dx + (s.ls ? s.ls : 0), 0)

const line = (x: number, y: number, spans: Span[], anchor: 'start' | 'end' = 'start'): string =>
  `<text x="${n2(x)}" y="${n2(y)}"${anchor === 'end' ? ' text-anchor="end"' : ''}>` +
  spans
    .map(
      s =>
        `<tspan${s.dx ? ` dx="${n2(s.dx)}"` : ''} font-size="${s.size}" font-weight="${s.weight}" fill="${s.fill}"` +
        (s.ls ? ` letter-spacing="${n2(s.ls)}"` : '') +
        `>${esc(s.s)}</tspan>`,
    )
    .join('') +
  '</text>'

/** `n` dots ending at x1 (right-anchored), centred on cy. */
const dotsEndingAt = (x1: number, cy: number, n: number, lit: number, fill: string): string =>
  n > 0 ? dotRow(x1 - ((n - 1) * PITCH + 2 * DOT_R), cy, n, lit, fill) : ''

// ---------- Chips: the one shape the band and the menu are built from ----------
const B_PAD = 2
const CHIP_GAP = 4
const CHIP_H = 36
const CHIP_PX = 8
const CHIP_LABEL = 14
const CHIP_VALUE = 30
const CHIP_FILL = '#ffffff'
const CHIP_ALPHA = 0.04
const MASCOT = 22
const MIN_DOTS = 4
const MAX_DOTS = 20
const DOTS_MIN_W = (MIN_DOTS - 1) * PITCH + 2 * DOT_R

/** A chip: a label line and a value line, drawn into a box `w` wide. `min` is the least width it reads in. */
type Chip = { min: number; draw: (x: number, y: number, w: number) => string; tint?: string }

const totalOf = (v: BandView): number => v.input + v.output + v.cacheRead + v.cacheWrite
const valueCy = (y: number): number => y + CHIP_VALUE - (VS * CAP) / 2

const chipRect = (x: number, y: number, w: number, tint?: string): string =>
  `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${CHIP_H}" rx="6" fill="${tint ?? CHIP_FILL}" fill-opacity="${tint ? 0.14 : CHIP_ALPHA}"/>`

/** A label's width with 15% to spare, so a label never meets what sits beside it. */
const MARGIN = 1.15
const lw = (spans: Span[]): number => spansW(spans) * MARGIN

/** The plain chip: label over value, `pad` px in from each side. */
const plainChip = (head: Span[], value: Span[], tint?: string, pad = CHIP_PX): Chip => ({
  min: 2 * pad + Math.max(lw(head), spansW(value)),
  draw: (x, y) => line(x + pad, y + CHIP_LABEL, head) + line(x + pad, y + CHIP_VALUE, value),
  ...(tint ? { tint } : {}),
})

/**
 * How tightly the band's chips are drawn. The band keeps six chips in one row as
 * long as any of these steps fits, giving up a little at each: first the reset times
 * shorten to their largest unit (and the cache's 60M goes), then padding and gaps,
 * then the words after the values. Only past the last step does it go to two rows,
 * then three. The dot bars and the reset times always show: no step removes them.
 */
type Fit = { pad: number; gap: number; resets: 'full' | 'short'; dots: boolean; short: boolean }
const FITS: readonly Fit[] = [
  { pad: CHIP_PX, gap: CHIP_GAP, resets: 'full', dots: true, short: false },
  { pad: CHIP_PX, gap: CHIP_GAP, resets: 'short', dots: true, short: false },
  { pad: 5, gap: 3, resets: 'short', dots: true, short: false },
  { pad: 5, gap: 3, resets: 'short', dots: true, short: true },
]

/** A reset time cut to its largest unit: "2h41" becomes "2h", "6d19h" becomes "6d"; "41m" and "now" stay. */
const shortReset = (s: string): string => /^\d+[dh]/.exec(s)?.[0] ?? s

/** 5H or 7D: name and reset on the top line; percent used, a dot bar of it, and HIGH at the right end from 85% used. */
const gaugeChip = (name: string, g: Gauge | null, fill: string, fit: Fit): Chip => {
  const head = [sLabel(name)]
  if (!g) return plainChip(head, [sSoft('--')], undefined, fit.pad)
  const resetText = fit.resets === 'full' ? g.reset : shortReset(g.reset)
  const reset = resetText ? [sLabel(resetText)] : []
  const pct = fit.short ? [sVal(`${g.used}%`, fill)] : [sVal(`${g.used}%`, fill), sSoft('used', PAL.muted, 4)]
  const low = g.used >= 85 ? pill('HIGH', PAL.d7, true) : null
  const lowW = low ? low.w + 6 : 0
  const top = lw(head) + (reset.length > 0 ? 10 + lw(reset) : 0)
  const bottom = spansW(pct) + (fit.dots ? 8 + DOTS_MIN_W : 0) + lowW
  return {
    min: 2 * fit.pad + Math.max(top, bottom),
    draw: (x, y, w) => {
      const x0 = x + fit.pad
      const x1 = x + w - fit.pad
      const end = x1 - lowW
      const n = fit.dots ? Math.min(MAX_DOTS, dotsIn(x0 + spansW(pct) + 8, end)) : 0
      return (
        line(x0, y + CHIP_LABEL, head) +
        (reset.length > 0 ? line(x1, y + CHIP_LABEL, reset, 'end') : '') +
        line(x0, y + CHIP_VALUE, pct) +
        (n > 0 ? dotsEndingAt(end, valueCy(y), n, litOf(g.used / 100, n), fill) : '') +
        (low ? low.svg(x1 - low.w, y + CHIP_VALUE) : '')
      )
    },
  }
}

/**
 * The cache, built like 5H and 7D: CACHE on the top line with the hour it lasts at
 * the right while warm, then minutes left (warm, red) or time idle (cold, blue) and
 * a dot bar of what is left of the hour. With the mascot setting on, tuzzo stands in
 * front of the text.
 */
const cacheChip = (v: BandView, fit: Fit): Chip => {
  const c = v.cache
  const head = [sLabel('cache')]
  if (!c) return plainChip(head, [sSoft('none yet')], undefined, fit.pad)
  const hue = tone(c.mode)
  const hour = fit.resets === 'full' && c.mode === 'warm' ? [sLabel('60m')] : []
  const value = fit.short ? [sVal(c.time, hue)] : [sVal(c.time, hue), sSoft(c.mode === 'warm' ? 'left' : 'idle', PAL.muted, 4)]
  // Where the text starts: the chip's own padding, or past the mascot when it shows.
  const inset = v.mascot ? 8 + MASCOT + 6 : fit.pad
  const top = lw(head) + (hour.length > 0 ? 10 + lw(hour) : 0)
  const bottom = spansW(value) + (fit.dots ? 8 + DOTS_MIN_W : 0)
  return {
    min: inset + fit.pad + Math.max(top, bottom),
    draw: (x, y, w) => {
      const x0 = x + inset
      const x1 = x + w - fit.pad
      const n = fit.dots ? Math.min(MAX_DOTS, dotsIn(x0 + spansW(value) + 8, x1)) : 0
      const hourLeft = c.mode === 'warm' ? Math.max(0, 60 - c.idleMin) / 60 : 0
      return (
        (v.mascot ? tuzzoShapes(x + 8, y + (CHIP_H - MASCOT) / 2, MASCOT, c.mode) : '') +
        line(x0, y + CHIP_LABEL, head) +
        (hour.length > 0 ? line(x1, y + CHIP_LABEL, hour, 'end') : '') +
        line(x0, y + CHIP_VALUE, value) +
        (n > 0 ? dotsEndingAt(x1, valueCy(y), n, litOf(hourLeft, n), hue) : '')
      )
    },
  }
}

/** A row of chips, `w` wide, equal widths, `gap` px apart. */
const chipRow = (chips: Chip[], x: number, y: number, w: number, gap = CHIP_GAP): string => {
  const cw = (w - (chips.length - 1) * gap) / chips.length
  return chips.map((c, i) => chipRect(x + i * (cw + gap), y, cw, c.tint) + c.draw(x + i * (cw + gap), y, cw)).join('')
}

// ---------- The band: six chips ----------
// The engine's band frame is the card, so the Svg draws the chips alone. Its
// Buttons are native, in a column Box beside the Svg; nothing here draws them.
const bandAlt = (v: BandView): string => {
  const g = (name: string, x: Gauge | null) =>
    x ? `${name} ${x.used}% used${x.used >= 85 ? ', high' : ''}${x.reset ? `, resets in ${x.reset}` : ''}.` : `${name} unknown.`
  const cache = v.cache ? (v.cache.mode === 'warm' ? `Cache warm, ${v.cache.time} left.` : `Cache cold, idle ${v.cache.time}.`) : 'Cache: none yet.'
  return `${g('5H', v.h5)} ${g('7D', v.d7)} ${cache} Spent $${v.usd.toFixed(2)}. ${fmtTok(totalOf(v))} tokens. ${v.prompts} prompts.`
}

/**
 * NEXT: what one more message costs now on the current model, warm at the cache
 * read price, cold re-writing the cache. The model's name rides on the label line
 * (dropped when tight), and a cold cache adds "cold" after the price.
 */
const nextChip = (v: BandView, fit: Fit): Chip => {
  const mine = v.prices.find(p => p.isMine)
  if (!mine) return plainChip([sLabel('next')], [sSoft('--')], undefined, fit.pad)
  const cold = v.cache?.mode === 'cold'
  const value = [...sMoney(mine.usd), ...(cold && !fit.short ? [sSoft('cold', PAL.cold, 5)] : [])]
  const named = [sLabel('next'), sLabel('·', PAL.muted, 5), sLabel(mine.name, PAL.muted, 5)]
  const forms = fit.short ? [[sLabel('next')]] : [named, [sLabel('next')]]
  const last = forms[forms.length - 1] ?? []
  return {
    min: 2 * fit.pad + Math.max(lw(last), spansW(value)),
    draw: (x, y, w) =>
      line(x + fit.pad, y + CHIP_LABEL, forms.find(f => lw(f) <= w - 2 * fit.pad) ?? last) + line(x + fit.pad, y + CHIP_VALUE, value),
  }
}

const bandChips = (v: BandView, fit: Fit): Chip[] => [
  gaugeChip('5H', v.h5, PAL.h5, fit),
  gaugeChip('7D', v.d7, PAL.d7, fit),
  cacheChip(v, fit),
  plainChip([sLabel('spent')], sMoney(v.usd), undefined, fit.pad),
  plainChip([sLabel('tokens')], [sVal(fmtTok(totalOf(v)))], undefined, fit.pad),
  nextChip(v, fit),
]

/**
 * The band for its width in CSS pixels: six chips in a row, drawn as loosely as
 * the width allows (see FITS), else two rows of three, else three rows of two.
 * Laid out afresh on every call from the width alone, so a pane that narrows and
 * widens again gets the right rows back.
 */
export const bandSvg = (v: BandView, widthPx: number, most = 6): { source: string; w: number; h: number; alt: string; rows: number } => {
  const W = Math.max(120, Math.floor(widthPx))
  const area = W - 2 * B_PAD
  let per = 2
  let fit = FITS[FITS.length - 1] ?? FITS[0]
  let chips: Chip[] = []
  search: for (const p of [6, 3, 2].filter(n => n <= most)) {
    for (const f of FITS) {
      const tried = bandChips(v, f)
      if (tried.every(c => c.min <= (area - (p - 1) * f.gap) / p)) {
        per = p
        fit = f
        chips = tried
        break search
      }
    }
  }
  if (chips.length === 0 || fit === undefined) {
    fit = FITS[FITS.length - 1] as Fit
    chips = bandChips(v, fit)
  }
  const step = fit.gap
  const rows = Math.ceil(chips.length / per)
  const H = 2 * B_PAD + rows * CHIP_H + (rows - 1) * step
  let body = ''
  for (let r = 0; r < rows; r++) body += chipRow(chips.slice(r * per, r * per + per), B_PAD, B_PAD + r * (CHIP_H + step), area, step)
  return { source: svgDoc(W, H, body), w: W, h: H, alt: bandAlt(v), rows }
}

// ---------- The menu: the same chips, drawn above the band ----------
// Two drawings for two native cards: the fixed figures (tokens, resets, the cache, and
// the next message's price on each model), and the subagents, one page at a time.
const M_PAD = 5
/** The least content width a menu chip reads in. */
const MENU_MIN = 66

/** One group's chips, all in their long labels if every one fits, else all short. */
const group = (forms: [Chip[], Chip[]], room: number): Chip[] => (forms[0].every(c => c.min <= room) ? forms[0] : forms[1])

/** When the main thread last sent a request. No countdown here: the band's cache chip has it. */
const lastReplyChip = (v: BandView): Chip => {
  const c = v.cache
  const ago = !c ? '--' : c.mode === 'cold' ? `${c.time} ago` : `${c.idleMin}m ago`
  return plainChip([sLabel('last reply')], [sVal(ago)])
}

/** In cache: "108k · 11%" of the context window, with a dot bar of the share. */
const inCacheChip = (v: BandView, room: number): Chip => {
  const hue = tone(v.cache?.mode ?? 'warm')
  const word = v.cache?.mode === 'cold' ? 're-cache' : 'in cache'
  const long = [sLabel(`${word} · of ${fmtWindow(v.window)}`)]
  const head = v.window > 0 && lw(long) <= room ? long : [sLabel(word)]
  const value = [sVal(fmtTok(v.tokens)), ...(v.share === null ? [] : [sDot(), sSoft(`${Math.round(v.share * 100)}%`, PAL.muted, 5)])]
  return {
    min: 2 * CHIP_PX + Math.max(lw(head), spansW(value)),
    draw: (x, y, w) => {
      const x1 = x + w - CHIP_PX
      const n = v.share === null ? 0 : Math.min(MAX_DOTS, dotsIn(x + CHIP_PX + spansW(value) + 8, x1))
      return (
        line(x + CHIP_PX, y + CHIP_LABEL, head) +
        line(x + CHIP_PX, y + CHIP_VALUE, value) +
        (n >= MIN_DOTS && v.share !== null ? dotsEndingAt(x1, valueCy(y), n, litOf(v.share, n), hue) : '')
      )
    },
  }
}

/** The four models, long ("NEXT OPUS" over "$0.02") or short ("OPUS" over "$0.02 next"). Yours is tinted. */
const nextForms = (v: BandView): [Chip[], Chip[]] => {
  const hue = tone(v.cache?.mode ?? 'warm')
  const make = (long: boolean) =>
    v.prices.map(p =>
      plainChip(
        [sLabel(long ? `next ${p.name}` : p.name, p.isMine ? hue : PAL.muted)],
        [...sMoney(p.usd, p.isMine ? PAL.ink : PAL.muted), ...(long ? [] : [sSoft('next', PAL.muted, 4)])],
        p.isMine ? hue : undefined,
      ),
    )
  return [make(true), make(false)]
}

/**
 * The session's tokens. SENT is every input token (new, cache read, cache write),
 * NEW the input the cache did not serve; then the cache's share, the output, and
 * the prompts. The band's TOKENS chip is the grand total.
 */
const tokenForms = (v: BandView): [Chip[], Chip[]] => {
  const figures = [v.input + v.cacheRead + v.cacheWrite, v.input, v.cacheRead, v.cacheWrite, v.output]
  const make = (names: string[]) => [
    ...figures.map((n, i) => plainChip([sLabel(names[i] ?? '')], [sVal(fmtTok(n))])),
    plainChip([sLabel('prompts')], [sVal(String(v.prompts))]),
  ]
  return [make(['sent', 'new', 'cache read', 'cache write', 'out']), make(['sent', 'new', 'read', 'write', 'out'])]
}

const resetChips = (v: BandView): Chip[] => [
  plainChip([sLabel('5H resets')], [sVal(v.h5?.at || v.h5?.reset || '--', PAL.h5)]),
  plainChip([sLabel('7D resets')], [sVal(v.d7?.at || v.d7?.reset || '--', PAL.d7)]),
]

/** Height of a block of chip rows, with the card padding above and below. */
const rowsH = (rows: number): number => 2 * M_PAD + rows * CHIP_H + Math.max(0, rows - 1) * CHIP_GAP

/** Equal-width chips, `cols` to a row. */
const toRows = (chips: Chip[], cols: number): Chip[][] => {
  const rows: Chip[][] = []
  for (let i = 0; i < chips.length; i += cols) rows.push(chips.slice(i, i + cols))
  return rows
}

/** The menu's fixed figures: tokens, resets, the cache, and the next message's price on each model. */
const statsPlan = (v: BandView, W: number): { cols: number; rows: Chip[][] } => {
  const inner = W - 2 * M_PAD
  const cols = Math.max(2, Math.floor((inner + CHIP_GAP) / (MENU_MIN + 2 * CHIP_PX + CHIP_GAP)))
  const room = (inner - (cols - 1) * CHIP_GAP) / cols - 2 * CHIP_PX
  const fixed = [...group(tokenForms(v), room), ...resetChips(v), inCacheChip(v, room), lastReplyChip(v), ...group(nextForms(v), room)]
  return { cols, rows: toRows(fixed, cols) }
}

/** The least width a subagent chip takes, so a name can be read. */
const AGENT_MIN = 150

/** The subagents, by cost, one row of them per page: as many to a row as the width holds, up to six. */
const agentsPlan = (v: BandView, W: number, page: number): { cols: number; row: Chip[]; pages: number; page: number } => {
  const inner = W - 2 * M_PAD
  const cols = Math.max(1, Math.min(6, Math.floor((inner + CHIP_GAP) / (AGENT_MIN + CHIP_GAP))))
  const agents = [...v.agents].sort((a, b) => b.usd - a.usd)
  const pages = Math.max(1, Math.ceil(agents.length / cols))
  const p = Math.max(0, Math.min(pages - 1, page))
  const row = agents.slice(p * cols, p * cols + cols).map(
    (g): Chip => ({
      min: 0,
      draw: (x, y, w) =>
        line(x + CHIP_PX, y + CHIP_LABEL, [sLabel(fit(g.name.toUpperCase(), LS, 500, (w - 2 * CHIP_PX) / MARGIN - g.name.length * TRACK))]) +
        line(x + CHIP_PX, y + CHIP_VALUE, sMoney(g.usd, PAL.ink)),
    }),
  )
  return { cols, row, pages, page: p }
}

/** How many pages of subagents the menu shows at this width. */
export const menuPages = (v: BandView, widthPx: number): number => agentsPlan(v, Math.max(120, Math.floor(widthPx)), 0).pages

/** The open menu's fixed figures at the band's width. They never page: only the subagents do. */
export const menuSvg = (v: BandView, widthPx: number): { source: string; w: number; h: number; alt: string } => {
  const W = Math.max(120, Math.floor(widthPx))
  const plan = statsPlan(v, W)
  const H = rowsH(plan.rows.length)
  let body = ''
  plan.rows.forEach((row, r) => {
    body += chipRow(row, M_PAD, M_PAD + r * (CHIP_H + CHIP_GAP), W - 2 * M_PAD)
  })
  const alt = [
    `Tokens ${fmtTok(v.input)} new, ${fmtTok(v.output)} out, cache read ${fmtTok(v.cacheRead)}, write ${fmtTok(v.cacheWrite)}.`,
    `5H resets ${v.h5?.at || 'unknown'}, 7D ${v.d7?.at || 'unknown'}.`,
    `${fmtTok(v.tokens)} tokens in cache${v.share === null ? '' : `, ${Math.round(v.share * 100)}% of the context`}.`,
    `Next message if sent now: ${v.prices.map(p => `${p.name.toLowerCase()} $${p.usd.toFixed(2)}${p.isMine ? ' (this model)' : ''}`).join(', ')}.`,
  ].join(' ')
  return { source: svgDoc(W, H, body), w: W, h: H, alt }
}

/** One page of subagents, by cost, for the menu's own subagents card. */
export const agentsSvg = (
  v: BandView,
  widthPx: number,
  page: number,
): { source: string; w: number; h: number; alt: string; page: number; pages: number } => {
  const W = Math.max(120, Math.floor(widthPx))
  const plan = agentsPlan(v, W, page)
  const H = rowsH(1)
  const body = chipRow(plan.row, M_PAD, M_PAD, W - 2 * M_PAD)
  const alt = plan.row.length === 0 ? 'No subagents yet.' : `Subagents, page ${plan.page + 1} of ${plan.pages}.`
  return { source: svgDoc(W, H, body), w: W, h: H, alt, page: plan.page, pages: plan.pages }
}
