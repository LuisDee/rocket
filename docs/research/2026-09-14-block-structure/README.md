# Block structure research, 14-15 Sep 2026

Why this exists: rocket generated the week of 14 Sep as 7.6 / 7.6 / 7.6 / 7.6 / 7.6 / 22 / rest. Luis
called it out as nothing like a real marathon plan. He was right, and the cause was worse than missing
research: an earlier pass (`prior-design-extract.md`) had already laid out varied day-by-day weeks, and
`placement.distribute()` ignored it by splitting leftover kilometres evenly.

What was run: a 16-agent workflow. Six web research sweeps (coaching systems, short blocks, session library,
distribution science, adaptive software, what runners at this level are prescribed); one adversarial
verifier per sweep; an architect that read the rocket code; a coach critic and an engineering critic; a
final revision.

Verification tally: 217 sources raised, 179 verified, 24 wrong URL but the work exists, 14 misquoted,
1 not found. 153 prescriptions checked: 94 confirmed, 52 corrected, 1 rejected, 6 unverifiable. The design
uses only confirmed or corrected values; anything else is labelled a judgement call.

| File | What it is |
|---|---|
| `BLOCK_GENERATION_DESIGN.md` | The final design: paces, session library, week rules, algorithm, block and multi-block management, adaptation, questions for Luis |
| `SIX_WEEKS_REGENERATED.md` | Every day of the block as the new algorithm produces it, with totals checked |
| `RULE_SOURCES.md` | Every rule, its intended config field, its source and evidence grade |
| `IMPLEMENTATION_STAGES.md` | Staged TDD plan against the real files |
| `CRITIQUE_RESOLUTION.md` | Each coach and engineer critique point and what was done with it |
| `sweeps.json` | Raw research plus verification, per sweep |
| `critiques.json`, `design-first-draft.json` | The review trail |
| `prior-design-extract.md` | The earlier design the code never used |
| `scripts/` | The generator prototype (`gen2.py`) and probes the tables were produced from |

Status: DESIGN ONLY. Nothing in `src/` or `config/` has changed. Six questions in section 10 of the design
need Luis's answers before implementation.
