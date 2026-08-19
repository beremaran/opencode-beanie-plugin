/** @jsxImportSource @opentui/solid */
import {expect, mock, test} from "bun:test";
import {Empty, HealthRows, Panel, statusColor} from "./panels";
import {createMockTuiApi} from "./test-helpers";

const element = (type: unknown, props: Record<string, unknown>) =>
    typeof type === "function" ? (type as (props: Record<string, unknown>) => unknown)(props) : {type, props};
await mock.module("@opentui/solid/jsx-runtime", () => ({
    Fragment: "fragment", jsx: element, jsxs: element, jsxDEV: element,
}));

const colors = createMockTuiApi().api.theme.current;

test("statusColor maps statuses to theme colors", () => {
    expect(statusColor(colors, "connected")).toBe(colors.success);
    expect(statusColor(colors, "completed")).toBe(colors.success);
    expect(statusColor(colors, "error")).toBe(colors.error);
    expect(statusColor(colors, "blocked")).toBe(colors.error);
    expect(statusColor(colors, "pending")).toBe(colors.warning);
});

test("Empty renders muted text", () => {
    const output = JSON.stringify(<Empty>Nothing here</Empty>);

    expect(output).toContain("Nothing here");
    expect(output).toContain("#888888");
});

test("Panel renders a titled box", () => {
    const output = JSON.stringify(
        <Panel title="HEADING" colors={colors}>
            <Empty>body</Empty>
        </Panel>,
    );

    expect(output).toContain("HEADING");
    expect(output).toContain("body");
});

test("HealthRows renders rows and truncates beyond four", () => {
    const rows = [
        {id: "a", status: "connected"},
        {id: "b", status: "error"},
        {id: "c", status: "connected"},
        {id: "d", status: "connected"},
        {id: "e", status: "connected"},
    ];
    const summary = {rows, count: rows.length, healthy: 4, unhealthy: 1};

    const output = JSON.stringify(<HealthRows summary={summary} colors={colors} />);

    expect(output).toContain('"b"');
    expect(output).toContain('"fg":"error"');
    expect(output).toContain('" more"');
});

test("HealthRows renders all rows when within the limit", () => {
    const rows = [
        {id: "a", status: "connected"},
        {id: "b", status: "connected"},
        {id: "c", status: "connected"},
        {id: "d", status: "connected"},
    ];
    const summary = {rows, count: rows.length, healthy: 4, unhealthy: 0};

    const output = JSON.stringify(<HealthRows summary={summary} colors={colors} />);

    expect(output).toContain('"d"');
    expect(output).not.toContain('" more"');
});

test("HealthRows renders the empty state", () => {
    const summary = {rows: [], count: 0, healthy: 0, unhealthy: 0};

    const output = JSON.stringify(<HealthRows summary={summary} colors={colors} />);

    expect(output).toContain("Nothing reported");
});
