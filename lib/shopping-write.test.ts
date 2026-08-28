import { describe, expect, it } from "vitest";
import type { Thread } from "./types";
import {
  itemLabelForCourses,
  mergeShoppingWrites,
  shoppingOpsForThreads,
  upsertCoursesOps,
} from "./shopping-write";

function thread(p: Partial<Thread> & { id: string; text: string }): Thread {
  return {
    status: "open",
    kind: "action",
    createdAt: "2026-08-01T10:00:00Z",
    ...p,
  };
}

describe("shopping-write", () => {
  it("extrait patins chaises pour Courses", () => {
    const t = thread({
      id: "p",
      text: "Changer les patins des chaises",
      note: "Patins à acheter — pas en stock.",
    });
    expect(itemLabelForCourses(t)).toBe("patins chaises");
  });

  it("crée le fil Courses avec l'article", () => {
    const ops = upsertCoursesOps(
      [
        thread({
          id: "p",
          text: "Changer les patins des chaises",
          note: "à acheter",
        }),
      ],
      ["patins chaises"],
    );
    expect(ops).toEqual([
      {
        op: "add",
        text: "Courses",
        kind: "action",
        note: "patins chaises",
      },
    ]);
  });

  it("bloque un done greffier tant qu'il faut acheter", () => {
    const threads = [
      thread({
        id: "p",
        text: "Changer les patins des chaises",
        note: "Patins à acheter — pas en stock.",
      }),
    ];
    const filtered = mergeShoppingWrites(
      threads,
      [],
      [{ op: "done", id: "p" }],
    );
    expect(filtered).toEqual([]);
  });

  it("ajoute Courses après une note greffier", () => {
    const threads = [
      thread({
        id: "p",
        text: "Changer les patins des chaises",
        note: "À faire vite.",
      }),
    ];
    const greffier = [
      {
        op: "note",
        id: "p",
        note: "Patins à acheter — pas en stock. À faire vite.",
      },
    ];
    const ops = shoppingOpsForThreads(threads, greffier);
    expect(ops).toEqual([
      {
        op: "add",
        text: "Courses",
        kind: "action",
        note: "patins chaises",
      },
    ]);
  });
});
