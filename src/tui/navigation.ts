import type {TuiApi} from "./types";

const DASHBOARD_ROUTE = "beanie.dashboard";

const OPEN_COMMAND = "beanie.dashboard.open";

const REFRESH_COMMAND = "beanie.dashboard.refresh";

const DASHBOARD_BINDING = "<leader>d";

const currentSessionId = (api: TuiApi): string | undefined => {
    const {current} = api.route;

    if (!("params" in current) || !current.params) {return undefined;}

    const sessionID = current.params.sessionID;

    return typeof sessionID === "string" && sessionID.length > 0 ? sessionID : undefined;
};

const openDashboard = (api: TuiApi) => {
    api.route.navigate(DASHBOARD_ROUTE, {sessionID: currentSessionId(api)});
};

const navigationCommands = (api: TuiApi) => [
    {
        name: OPEN_COMMAND,
        title: "Open Beanie dashboard",
        desc: "Open the Beanie dashboard for the current session",
        category: "Beanie",
        namespace: "palette",
        run: () => { openDashboard(api); },
    },
    {
        name: REFRESH_COMMAND,
        title: "Refresh Beanie dashboard",
        desc: "Refresh and reopen the Beanie dashboard",
        category: "Beanie",
        namespace: "palette",
        run: () => { openDashboard(api); },
    },
];

export const registerDashboardNavigation = (api: TuiApi) => {
    const unregister = api.keymap.registerLayer({
        commands: navigationCommands(api),
        bindings: [{key: DASHBOARD_BINDING, cmd: OPEN_COMMAND, desc: "Open Beanie dashboard"}],
    });

    api.lifecycle.onDispose(unregister);
};
