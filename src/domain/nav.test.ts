import { describe, expect, it } from "vitest";
import { back, clean, MAX_TRAIL, peek, push, reset, sameLoc } from "./nav";

const prod = {
  view: "production",
  line: "L1",
  period: "1",
  date: "2026-11-10",
};

describe("nav trail", () => {
  it("pushes the place being left", () => {
    const t = push([], prod, { view: "tasks" });
    expect(t).toEqual([prod]);
  });
  it("does not push the same place twice in a row", () => {
    const t1 = push([], prod, { view: "tasks" });
    const t2 = push(t1, prod, { view: "line", line: "L1" });
    expect(t2).toEqual([prod]);
    expect(
      push(t2, { view: "line", line: "L1" }, { view: "line", line: "L1" }),
    ).toEqual(t2);
  });
  it("treats missing and empty selections as equal", () => {
    expect(
      sameLoc({ view: "a", line: undefined }, { view: "a", line: "" }),
    ).toBe(true);
    expect(clean({ view: "a", line: undefined, date: "x" })).toEqual({
      view: "a",
      date: "x",
    });
    expect(push([], { view: "a" }, { view: "a", line: "" })).toEqual([]);
  });
  it("pops the latest place and restores all its params", () => {
    const t = push([], prod, { view: "tasks" });
    const r = back(t, "overview");
    expect(r.loc).toEqual(prod);
    expect(r.trail).toEqual([]);
    expect(r.fromTrail).toBe(true);
  });
  it("walks a chain back one step at a time", () => {
    let t = push([], { view: "overview" }, { view: "line", line: "L2" });
    t = push(t, { view: "line", line: "L2" }, { view: "tasks", line: "L2" });
    expect(back(t, "x").loc).toEqual({ view: "line", line: "L2" });
    const next = back(back(t, "x").trail, "x");
    expect(next.loc).toEqual({ view: "overview" });
    expect(next.trail).toEqual([]);
  });
  it("going to where you came from pops instead of looping", () => {
    const t = push([], { view: "overview" }, { view: "line", line: "L2" });
    expect(push(t, { view: "line", line: "L2" }, { view: "overview" })).toEqual(
      [],
    );
  });
  it("resets on a tab press", () => {
    expect(reset()).toEqual([]);
  });
  it("falls back to the fixed parent when the trail is empty", () => {
    const r = back([], "people");
    expect(r.loc).toEqual({ view: "people" });
    expect(r.fromTrail).toBe(false);
    expect(peek([], "people")).toEqual({ view: "people" });
  });
  it("caps the depth and keeps the newest", () => {
    let t: ReturnType<typeof push> = [];
    for (let i = 0; i < 30; i++)
      t = push(t, { view: "v", line: String(i) }, { view: "w", line: "z" + i });
    expect(t.length).toBe(MAX_TRAIL);
    expect(t[t.length - 1]).toEqual({ view: "v", line: "29" });
    expect(t[0]).toEqual({ view: "v", line: "10" });
  });
  it("flow: Production -> Day setup -> Back restores Production filters", () => {
    const here = { ...prod, captain: "C1" };
    const t = push([], here, { view: "tasks" });
    expect(back(t, "people").loc).toEqual(here);
  });
  it("flow: Overview -> Line -> Day setup -> Back -> Back -> Overview", () => {
    let t = push([], { view: "overview" }, { view: "line", line: "L1" });
    const line = { view: "line", line: "L1", date: "2026-11-10" };
    t = push(t, line, { view: "tasks", line: "L1", date: "2026-11-10" });
    const first = back(t, "x");
    expect(first.loc).toEqual(line);
    const second = back(first.trail, "x");
    expect(second.loc).toEqual({ view: "overview" });
    expect(back(second.trail, "overview").fromTrail).toBe(false);
  });
  it("flow: Production -> Operations breakdown -> Back keeps period and day", () => {
    const here = { view: "production", period: "1", date: "2026-11-09" };
    const t = push([], here, { ...here, view: "operations" });
    expect(back(t, "overview").loc).toEqual(here);
  });
  it("peek does not change the trail", () => {
    const t = push([], prod, { view: "tasks" });
    expect(peek(t, "x")).toEqual(prod);
    expect(t).toEqual([prod]);
  });
});
