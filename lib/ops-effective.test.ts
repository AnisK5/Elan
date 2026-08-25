import { describe, expect, it } from "vitest";
import { filterEffectiveOps, parseThreadOps } from "./ops";
import type { ThreadOp } from "./store";

const threads = [
  {
    id: "a",
    text: "Relancer Paul",
    status: "open",
    note: "papa attend",
    due: "2026-08-20T00:00:00.000Z",
    kind: "suivi",
  },
  {
    id: "b",
    text: "Coffre",
    status: "done",
  },
];

describe("filterEffectiveOps", () => {
  it("écarte une note déjà identique", () => {
    const ops: ThreadOp[] = [{ op: "note", id: "a", note: "papa attend" }];
    expect(filterEffectiveOps(threads, ops)).toEqual([]);
  });

  it("garde une vraie nouvelle note", () => {
    const ops: ThreadOp[] = [{ op: "note", id: "a", note: "relancé le 03/08" }];
    expect(filterEffectiveOps(threads, ops)).toHaveLength(1);
  });

  it("écarte un done déjà fait et un add doublon", () => {
    const raw = [
      { op: "done", id: "b" },
      { op: "add", text: "Relancer Paul", kind: "action" },
      { op: "done", id: "a" },
    ];
    const ops = parseThreadOps(
      raw,
      new Set(threads.map((t) => t.id)),
      threads,
    );
    const effective = filterEffectiveOps(threads, ops);
    expect(effective).toEqual([{ op: "done", id: "a" }]);
  });

  it("écarte un set qui ne change rien", () => {
    const ops: ThreadOp[] = [
      { op: "set", id: "a", due: "2026-08-20T12:00:00.000Z", kind: "suivi" },
    ];
    expect(filterEffectiveOps(threads, ops)).toEqual([]);
  });
});
