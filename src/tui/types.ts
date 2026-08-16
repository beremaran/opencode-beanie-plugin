import type {TuiPluginModule, TuiSlotContext} from "@opencode-ai/plugin/tui";
import type {JSX} from "@opentui/solid";

export type TuiApi = Parameters<NonNullable<TuiPluginModule["tui"]>>[0];
export type SidebarFooter = (context: TuiSlotContext, props: {session_id: string}) => JSX.Element;
export type TuiIdentity = {projectID: string; worktree: string};
