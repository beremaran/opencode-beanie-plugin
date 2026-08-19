/** @jsxImportSource @opentui/solid */
import type {JSX} from "@opentui/solid";
import type {TuiApi} from "./types";

const GOAL_COMMANDS = {
    status: "beanie.goal.status",
    pause: "beanie.goal.pause",
    resume: "beanie.goal.resume",
    clear: "beanie.goal.clear",
} as const;
type GoalAction = keyof typeof GOAL_COMMANDS;

const currentSessionId = (api: TuiApi): string | undefined => {
    const {current} = api.route;

    if (!("params" in current && current.params)) {return undefined;}

    const sessionID = current.params.sessionID;

    return typeof sessionID === "string" && sessionID.length > 0 ? sessionID : undefined;
};

const toast = (api: TuiApi, message: string, variant: "success" | "error") =>
    { api.ui.toast({title: "Goal", message, variant}); };

const executeGoal = async (api: TuiApi, action: GoalAction): Promise<void> => {
    const sessionID = currentSessionId(api);

    if (!sessionID) {
        toast(api, "No active session", "error");
        return;
    }
    try {
        const response = await api.client.session.command({sessionID, command: "goal", arguments: action});

        if (response.error) {toast(api, "Goal command failed", "error"); return;}
        toast(api, action === "status" ? "Goal status requested" : `Goal ${action} requested`, "success");
    } catch {
        toast(api, "Goal command failed", "error");
    }
};

const createClearDialog = (api: TuiApi, close: () => void): JSX.Element =>
    api.ui.DialogConfirm({
        title: "Clear goal?",
        message: "This removes the goal for the current session.",
        onConfirm: () => {
            close();
            void executeGoal(api, "clear");
        },
        onCancel: close,
    });

const confirmClear = (api: TuiApi) => {
    let open = true;

    const close = () => {
        open = false;
        api.ui.dialog.clear();
    };

    const renderDialog = (): JSX.Element => createClearDialog(api, close);

    api.ui.dialog.replace(renderDialog, close);
    api.lifecycle.onDispose(() => {
        if (open) {api.ui.dialog.clear();}
    });
};

const titleize = (action: GoalAction) => `${action.charAt(0).toUpperCase()}${action.slice(1)}`;

export const registerGoalControls = (api: TuiApi) => {
    const unregister = api.keymap.registerLayer({
        commands: (Object.keys(GOAL_COMMANDS) as GoalAction[]).map((action) => ({
            name: GOAL_COMMANDS[action],
            title: `${titleize(action)} goal`,
            desc: `${titleize(action)} the goal for the current session`,
            category: "Beanie",
            namespace: "palette",
            run: () => {
                if (action === "clear") {
                    confirmClear(api);
                    return;
                }
                void executeGoal(api, action);
            },
        })),
    });
    api.lifecycle.onDispose(unregister);
};
