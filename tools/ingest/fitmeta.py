"""Session totals and timer pauses from a FIT file, as JSON on stdout.

Runs under ROUTR's interpreter, not rocket's: it imports routr's own FIT parser
rather than reimplementing one. routr is read-only from here -- nothing is
written into that checkout and nothing is imported into rocket's process.

Why this exists at all. The CropSummary contract the approval screen renders
needs elapsed time, moving time and distance, before and after. The cropper
prints elapsed and timer time on stdout but never distance, so the contract
cannot be filled by parsing its output, and writing a second FIT parser to get
one number is how two parsers start disagreeing.

Usage:  <routr-venv>/bin/python fitmeta.py <file.fit>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: fitmeta.py <routr-backend-dir> <file.fit>", file=sys.stderr)
        return 2
    backend, fit = Path(argv[1]), Path(argv[2])
    sys.path.insert(0, str(backend / "scripts"))
    sys.path.insert(0, str(backend))

    from crop_fit_pauses import (  # noqa: PLC0415 -- path must be set first
        analyse,
        extract_timer_pauses,
        parse_header,
        walk_records,
    )

    data = fit.read_bytes()
    s = analyse(data)

    # Asserted rather than assumed: this script's whole contract is these three
    # fields, and a rename upstream should fail loudly here rather than silently
    # produce a summary of zeroes that the approval screen renders as a crop
    # that removed nothing.
    for field in ("total_elapsed_s", "total_timer_s", "total_distance_m"):
        if not hasattr(s, field):
            print(f"error: routr Summary has no {field}", file=sys.stderr)
            return 2

    hdr, dsz = parse_header(data)
    pauses = extract_timer_pauses(data, walk_records(data, hdr, dsz))

    print(
        json.dumps(
            {
                "firstTs": s.first_ts,
                "elapsedSeconds": s.total_elapsed_s,
                "movingSeconds": s.total_timer_s,
                "distanceKm": round(s.total_distance_m / 1000, 3),
                "pauses": [
                    {
                        "startOffsetS": p.stop_ts - s.first_ts,
                        "durationS": p.duration_s,
                    }
                    for p in pauses
                ],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
