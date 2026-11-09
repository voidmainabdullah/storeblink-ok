# Architecture Audit Contract

Date: 2026-07-24

This document is the required reporting contract for every Visual Editor Engine phase.

## Required Reports

Every phase must produce two Architecture Audit Reports:

- Start report: `docs/PHASE-<N>-AUDIT.md`
- End report: `docs/PHASE-<N>-SUMMARY.md`

The start report is created before implementation. The end report is updated after implementation and verification. A phase must not be marked complete unless every scoped item is verified or explicitly listed as missing/partial.

## Required Sections

Each report must include these sections:

- Implemented ✓
- Missing ✗
- Partially Implemented △
- Technical Debt
- Regression Risk
- Verification Evidence
- Next Actions

## Completion Gate

A phase can be called complete only when:

- `Missing ✗` is empty for that phase scope.
- `Partially Implemented △` is empty or explicitly accepted as out of scope by the next phase handoff.
- Every implemented item has verification evidence.
- Previous phase regressions were checked.
- Runtime routes touched by the phase were smoke-tested when possible.

## Missing Item Rule

If a required item is missing, do not only report it. The next action must identify:

- Why it is missing.
- Which system owns the fix.
- How it should integrate with existing architecture.
- What verification proves the fix works.

## Status Symbols

- `✓` Implemented and verified.
- `△` Partially implemented, needs follow-up before final completion.
- `✗` Missing.
