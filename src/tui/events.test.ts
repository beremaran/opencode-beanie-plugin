import {expect, test} from "bun:test";
import {isTuiRefreshEvent, TUI_REFRESH_EVENT_NAMES} from "./events";

test("every refresh event name is recognized", () => {
    for (const name of TUI_REFRESH_EVENT_NAMES) {
        expect(isTuiRefreshEvent(name)).toBe(true);
    }
});

test("unknown or non-string names are rejected", () => {
    expect(isTuiRefreshEvent("unknown.event")).toBe(false);
    expect(isTuiRefreshEvent(42)).toBe(false);
    expect(isTuiRefreshEvent(undefined)).toBe(false);
});
