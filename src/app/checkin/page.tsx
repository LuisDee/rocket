/**
 * The thirty-second check-in.
 *
 * Phone first, one screen, no JavaScript: a plain form posting to a server
 * action, radio inputs styled with `peer-checked`. Nothing here is interactive
 * beyond what the browser does on its own, which is why it works on a 5G-less
 * commute and cannot break in a way a test would not see.
 *
 * It writes through `recordCheckIn`, the SAME function `rocket_daily_checkin`
 * calls. Two write paths would mean two sets of defaults, and they drift the
 * first time one is edited.
 *
 * Colours are stated on every element. The scaffold once rendered light text on
 * a white page here and every gate passed it (see `globals.css`); a screenshot
 * caught it, so nothing on this page inherits a colour it could lose.
 */

import { redirect } from 'next/navigation';

import { READINESS } from '../../../config/training';
import {
  parseCheckInForm,
  recordCheckIn,
  SORENESS_LOCATIONS,
  type SorenessLocation,
} from '../../domain/checkin';
import { postgresStore } from '../../domain/store';
import { formatShortDate, todayInLondon } from '../../lib/block';

export const dynamic = 'force-dynamic';

const scales = READINESS.inputScales;
const RPE = range(scales.rpeYesterday.min, scales.rpeYesterday.max);
const SEVERITY = range(scales.soreness.min, scales.soreness.max);
const MOTIVATION = range(scales.motivation.min, scales.motivation.max);

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export default async function CheckInPage({
  searchParams,
}: PageProps<'/checkin'>) {
  const params = await searchParams;
  const saved = typeof params['band'] === 'string' ? params['band'] : null;
  const today = todayInLondon();

  async function submit(form: FormData): Promise<void> {
    'use server';

    const { readiness } = await recordCheckIn(
      postgresStore(),
      parseCheckInForm(form),
      todayInLondon(),
    );

    redirect(`/checkin?band=${readiness.band}`);
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8 text-zinc-100">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Check-in
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
          This morning
        </h1>
        <p className="mt-1 text-sm text-zinc-400">{formatShortDate(today)}</p>
      </header>

      {saved === null ? null : (
        <p
          className={[
            'mt-5 rounded-xl px-4 py-3 text-sm ring-1',
            saved === 'green'
              ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
              : saved === 'amber'
                ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30'
                : 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
          ].join(' ')}
        >
          Logged. Readiness reads{' '}
          <strong className="font-semibold">{saved}</strong> — on subjective
          terms only, with no load history behind it yet.
        </p>
      )}

      <form action={submit} className="mt-7 space-y-8">
        <Field
          label="Yesterday"
          hint={`How hard it felt, ${scales.rpeYesterday.min}-${scales.rpeYesterday.max}. Leave it if you did not run.`}
        >
          <Pills name="rpe_yesterday" values={RPE} columns="grid-cols-5" />
        </Field>

        <Field
          label="Soreness"
          hint={`Tap only what hurts. ${READINESS.sorenessBlocksQuality} or more gates quality work.`}
        >
          <div className="space-y-3">
            {SORENESS_LOCATIONS.map((location) => (
              <SorenessRow key={location} location={location} />
            ))}
          </div>
        </Field>

        <Field label="Sleep" hint="Hours. Half hours are fine.">
          <input
            type="number"
            name="sleep"
            inputMode="decimal"
            step="0.5"
            min={scales.sleep.min}
            max={24}
            placeholder="7.5"
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 font-mono text-lg tabular-nums text-zinc-100 ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-2 focus:ring-sky-500/60 focus:outline-none"
          />
        </Field>

        <Field
          label="Motivation"
          hint={`Appetite for training today, ${scales.motivation.min}-${scales.motivation.max}.`}
        >
          <Pills name="motivation" values={MOTIVATION} columns="grid-cols-5" />
        </Field>

        <Field label="Anything else" hint="One sentence is plenty.">
          <textarea
            name="note"
            rows={3}
            placeholder="Slept badly, left calf a bit tight."
            className="w-full resize-none rounded-xl bg-zinc-900 px-4 py-3 text-base text-zinc-100 ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-2 focus:ring-sky-500/60 focus:outline-none"
          />
        </Field>

        <button
          type="submit"
          className="w-full rounded-xl bg-sky-500 px-4 py-4 text-base font-semibold text-zinc-950 ring-1 ring-sky-400 active:bg-sky-400"
        >
          Log check-in
        </button>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-zinc-500">
        Check-ins are append-only. Once this is logged it cannot be edited or
        deleted — what you felt on a given morning exists nowhere else, so a
        rough answer beats a tidy one.
      </p>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-400">
        {label}
      </h2>
      <p className="mt-1 mb-3 text-xs text-zinc-500">{hint}</p>
      {children}
    </section>
  );
}

/** Radio buttons drawn as tap targets. No JavaScript: `peer-checked` does it. */
function Pills({
  name,
  values,
  columns,
}: {
  name: string;
  values: number[];
  columns: string;
}) {
  return (
    <div className={`grid gap-1.5 ${columns}`}>
      {values.map((value) => (
        <label key={value} className="block">
          <input
            type="radio"
            name={name}
            value={value}
            className="peer sr-only"
          />
          {/*
            min-h-[44px] rather than padding: this is tapped one-handed, half
            awake, and `py-3` measured 36px. Stating the floor keeps it 44 even
            if the font size changes underneath it.
          */}
          <span className="flex min-h-[44px] items-center justify-center rounded-lg bg-zinc-900 text-center font-mono text-base tabular-nums text-zinc-400 ring-1 ring-zinc-800 peer-checked:bg-sky-500/20 peer-checked:text-sky-200 peer-checked:ring-sky-500/60 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400">
            {value}
          </span>
        </label>
      ))}
    </div>
  );
}

function SorenessRow({ location }: { location: SorenessLocation }) {
  return (
    <div>
      <span className="text-sm capitalize text-zinc-300">{location}</span>
      {/*
        The label used to sit beside the pills at `w-20`, which left six pills
        sharing 270px -- 42px each at 390px wide, 39px at 375px. Under the 44px
        minimum by construction, at every phone width, so no amount of padding
        would have fixed it. Putting the label on its own line gives the row the
        full width and the pills come out at 53px.
      */}
      <div className="mt-1 grid grid-cols-6 gap-1">
        {SEVERITY.map((severity) => (
          <label key={severity} className="block">
            <input
              type="radio"
              name={`soreness-${location}`}
              value={severity}
              defaultChecked={severity === 0}
              className="peer sr-only"
            />
            <span
              className={[
                'flex min-h-[44px] items-center justify-center rounded-md bg-zinc-900 text-center font-mono text-sm tabular-nums ring-1 ring-zinc-800',
                severity === 0 ? 'text-zinc-600' : 'text-zinc-400',
                // Zero is the default and means "fine". Highlighting it in the
                // warning colour made every untouched row read as a complaint.
                severity === 0
                  ? 'peer-checked:bg-zinc-800 peer-checked:text-zinc-300 peer-checked:ring-zinc-600'
                  : severity >= READINESS.sorenessBlocksQuality
                    ? 'peer-checked:bg-rose-500/20 peer-checked:text-rose-200 peer-checked:ring-rose-500/60'
                    : 'peer-checked:bg-amber-500/20 peer-checked:text-amber-200 peer-checked:ring-amber-500/60',
              ].join(' ')}
            >
              {severity}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
