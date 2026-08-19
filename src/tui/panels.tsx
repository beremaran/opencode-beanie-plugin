/** @jsxImportSource @opentui/solid */
import type {TuiThemeCurrent} from "@opencode-ai/plugin/tui";
import type {JSX} from "@opentui/solid";
import type {TuiHealthSummary} from "./types";

export type PanelColors = Pick<TuiThemeCurrent,
    "accent" | "backgroundPanel" | "borderSubtle" | "error" | "success" | "text" | "textMuted" | "warning">;

export const statusColor = (colors: PanelColors, status: string) => {
    if (status === "connected" || status === "completed" || status === "idle") {return colors.success;}
    if (status === "error" || status === "failed" || status === "blocked" || status === "cancelled") {return colors.error;}
    return colors.warning;
};

export const Empty = (props: {children: string}): JSX.Element => <text fg="#888888">{props.children}</text>;

export const Panel = (props: {title: string; colors: PanelColors; children: JSX.Element}): JSX.Element => (
    <box
        border={true}
        borderColor={props.colors.borderSubtle}
        backgroundColor={props.colors.backgroundPanel}
        title={props.title}
        titleColor={props.colors.accent}
        padding={1}
        flexGrow={1}
        minWidth={32}
        minHeight={7}
    >
        {props.children}
    </box>
);

export const HealthRows = (props: {summary: TuiHealthSummary; colors: PanelColors}): JSX.Element =>
    props.summary.rows.length === 0 ? (
        <Empty>Nothing reported</Empty>
    ) : (
        <box flexDirection="column" gap={0}>
            {props.summary.rows.slice(0, 4).map((row): JSX.Element => (
                <text>
                    <span style={{fg: statusColor(props.colors, row.status)}}>●</span> {row.id}{" "}
                    <span style={{fg: props.colors.textMuted}}>{row.status}</span>
                </text>
            ))}
            {props.summary.count > 4 && (
                <text fg={props.colors.textMuted}>+ {props.summary.count - 4} more</text>
            )}
        </box>
    );
