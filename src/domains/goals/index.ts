import type {Domain} from "../../shared/domain";
import {createGoalHooks} from "./hooks";
import {resolveOptions} from "./options";
import {FileGoalStore, type FileGoalStoreOptions, type GoalStore} from "./store";
import {createGoalTools} from "./tools";

export type GoalStoreFactory = (options: FileGoalStoreOptions) => GoalStore;

const defaultStore: GoalStoreFactory = (options) => new FileGoalStore(options);

const makeStoreFactory = (
    input: Parameters<Domain>[0],
    stateRoot: string | undefined,
    createStore: GoalStoreFactory,
) => {
    const stores = new Map<string, GoalStore>();

    const storeFor = (sessionID: string) => {
        const existing = stores.get(sessionID);

        if (existing) {return existing;}

        const store = createStore({projectID: input.project.id, worktree: input.worktree, sessionID, stateRoot});
        stores.set(sessionID, store);
        return store;
    };

    return {storeFor, clear: () => {stores.clear();}};
};

export const createGoalsDomain = (
    input: Parameters<Domain>[0],
    rawOptions?: Parameters<Domain>[1],
    createStore = defaultStore,
) => {
    const options = resolveOptions(rawOptions);

    const {storeFor, clear} = makeStoreFactory(input, options.stateDirectory, createStore);

    const tools = createGoalTools(storeFor, options);

    return Promise.resolve(createGoalHooks({
        client: input.client, storeFor, tools, options, disposeStores: clear,
    }));
};

export const GoalsDomain: Domain = (input, rawOptions) =>
    createGoalsDomain(input, rawOptions);
