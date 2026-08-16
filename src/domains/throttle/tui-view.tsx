/** @jsxImportSource @opentui/solid */
import type {JSX} from "@opentui/solid";
import type {ThrottleStatus} from "./tui-state";

export const renderThrottleStatus = (
    status: ThrottleStatus | undefined,
): JSX.Element => {
    if (!status) {
        return <box height={0} />;
    }

    return (
        <box height={1} paddingLeft={1} paddingRight={1}>
            <text truncate>
                <span style={{fg: "cyan"}}>throttle</span>
                {" "}
                <span>{status.active}/{status.capacity}</span>
                {" active, "}
                <span style={{fg: status.queued > 0 ? "yellow" : undefined}}>
                    {status.queued} queued
                </span>
                {status.active > 0 ? " (" : ""}
                {status.active > 0 ? <span style={{fg: "green"}}>fg {status.foreground}</span> : ""}
                {status.active > 0 ? ", " : ""}
                {status.active > 0 ? <span style={{fg: "magenta"}}>bg {status.background}</span> : ""}
                {status.active > 0 ? ")" : ""}
            </text>
        </box>
    );
};
