/** @jsxImportSource @opentui/solid */
import type {JSX} from "@opentui/solid";
import type {ThrottleStatus} from "./tui-state";

const fgSpan = (status: ThrottleStatus): JSX.Element => <span style={{fg: "green"}}>fg {status.foreground}</span>;

const bgSpan = (status: ThrottleStatus): JSX.Element => <span style={{fg: "magenta"}}>bg {status.background}</span>;

const statusPrefix = (status: ThrottleStatus) => status.active > 0 ? " (" : "";

const statusSuffix = (status: ThrottleStatus) => status.active > 0 ? ")" : "";

export const renderThrottleStatus = (status: ThrottleStatus | undefined): JSX.Element => {
    if (!status) {return <box height={0}/>;}
    return (
        <box height={1} paddingLeft={1} paddingRight={1}>
            <text truncate>
                <span style={{fg: "cyan"}}>throttle</span>
                {" "}
                <span>{status.active}/{status.capacity}</span>
                {" active, "}
                <span style={{fg: status.queued > 0 ? "yellow" : undefined}}>{status.queued} queued</span>
                {statusPrefix(status)}
                {status.active > 0 ? fgSpan(status) : ""}
                {status.active > 0 ? ", " : ""}
                {status.active > 0 ? bgSpan(status) : ""}
                {statusSuffix(status)}
            </text>
        </box>
    );
};
