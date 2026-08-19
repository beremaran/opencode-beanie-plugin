import {expect, test} from "bun:test";
import {registerDashboardNavigation} from "./navigation";
import {at, createMockTuiApi} from "./test-helpers";

test("registers keymap commands and the leader binding", () => {
    const mock = createMockTuiApi();
    registerDashboardNavigation(mock.api);

    expect(mock.keymapLayers).toHaveLength(1);
    expect(at(mock.keymapLayers, 0).commands.map((command) => command.name))
        .toEqual(["beanie.dashboard.open", "beanie.dashboard.refresh"]);
    expect(at(mock.keymapLayers, 0).bindings).toEqual([
        {key: "<leader>d", cmd: "beanie.dashboard.open", desc: "Open Beanie dashboard"},
    ]);
});

test("open navigates to the dashboard with the current session", () => {
    const mock = createMockTuiApi();
    registerDashboardNavigation(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "s1"}});

    at(at(mock.keymapLayers, 0).commands, 0).run();

    expect(mock.navigations).toHaveLength(1);
    expect(at(mock.navigations, 0).name).toBe("beanie.dashboard");
    expect(at(mock.navigations, 0).params).toEqual({sessionID: "s1"});
});

test("refresh navigates without a session when none is current", () => {
    const mock = createMockTuiApi();
    registerDashboardNavigation(mock.api);

    at(at(mock.keymapLayers, 0).commands, 1).run();

    expect(at(mock.navigations, 0).name).toBe("beanie.dashboard");
    expect(at(mock.navigations, 0).params?.sessionID).toBeUndefined();
});

test("dispose unregisters the keymap layer", () => {
    const mock = createMockTuiApi();
    registerDashboardNavigation(mock.api);
    mock.disposers.forEach((dispose) => { dispose(); });

    expect(mock.keymapLayers).toHaveLength(0);
});
