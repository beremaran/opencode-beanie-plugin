import type {Domain} from "../../shared/domain";
import {createGoalHooks} from "./hooks";
import {FileGoalStore, type FileGoalStoreOptions, type GoalStore} from "./store";
import {createGoalTools} from "./tools";

export type {Goal, GoalStatus} from "./model";

export type GoalStoreFactory = (options: FileGoalStoreOptions) => GoalStore;

const defaultStore: GoalStoreFactory = (options) => new FileGoalStore(options);

export const createGoalsDomain = (input: Parameters<Domain>[0], createStore = defaultStore) => {
    const stores = new Map<string, GoalStore>();

    const storeFor = (sessionID: string) => {
        const existing = stores.get(sessionID);

        if (existing) {return existing;}

        const store = createStore({projectID: input.project.id, worktree: input.worktree, sessionID});

        stores.set(sessionID, store);
        return store;
    };

    return Promise.resolve(createGoalHooks(storeFor, createGoalTools(storeFor), () => {stores.clear();}));
};

export const GoalsDomain: Domain = (input) => createGoalsDomain(input);
