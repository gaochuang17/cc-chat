# Project Instructions

## Source Of Truth

For every code change, base implementation decisions on the current source
code, types, tests, migrations, and observed runtime behavior. Do not use
existing development documents as the source of truth because they may be
outdated or incorrect. Treat those documents as historical records only.

## Code Change Checklist

For every task that changes code under `frontend/`, unless the user explicitly
excludes one of these steps:

1. Update code comments in the changed areas. Add or revise comments only for
   non-obvious behavior, contracts, async ownership/race conditions, and complex
   data flows. Do not add comments that merely restate the code.
2. Update the development documentation for the current date. Use the local
   date and write to `docs/YYYY-MM-DD/`.
3. If `docs/YYYY-MM-DD/开发概览.md` already exists, append or revise the
   relevant sections instead of creating a duplicate overview. If it does not
   exist, create it.
4. The overview must record the task goal, main code changes, affected modules,
   and verification commands/results. Keep earlier daily documents unchanged
   unless the user explicitly asks for a retrospective rewrite.
5. If the change belongs to an existing topic document in that day's directory,
   update that document as well. For a substantial frontend or backend topic
   without an existing document, create a focused module document and link it
   from the overview's document index.
6. Before finishing, verify that code and documentation agree with the actual
   implementation and report which documentation files were updated.

## Comment Maintenance

This rule applies to both `frontend/` and `backend/` changes.

When code behavior changes, update, add, or delete outdated comments so they
stay synchronized with the implementation.

Write comments in concrete, observable terms. Name the relevant field, function,
request, component, or timing, and explain what happens and why. Avoid
design-discussion shorthand such as "single source", "selection intent",
"ownership", "optimistic update", "projection", "snapshot", or "guard" unless
the comment first defines it concretely. A reader should understand the comment
without knowing the earlier design conversation.

## Unrelated Refactoring

This rule applies to both `frontend/` and `backend/` changes.

Do not perform unrelated refactoring. Keep each change limited to the files,
modules, and behavior directly required by the current task. Do not
incidentally reformat code, rename identifiers, move files, or modify unrelated
modules.

## Backend Comment Requirements

For every task that changes code under `backend/`, update comments thoroughly
in the changed areas. Cover the relevant business rules, API contracts,
database transactions and query effects, error-handling branches, ownership
boundaries, and async/background lifecycles. Keep comments concrete and
current; do not add comments that merely restate individual lines of code.
