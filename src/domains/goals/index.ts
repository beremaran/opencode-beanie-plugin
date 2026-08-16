import type {Domain} from "../../shared/domain";
import {createGoalHooks} from "./hooks";
import {createGoalPublisher} from "./publisher";
import {createGoalTools} from "./tools";

export type {Goal, GoalStatus} from "./model";

export const GoalsDomain: Domain = (input) => {
    const goals = new Map<string, import("./model").Goal>();

    const publisher = createGoalPublisher(input);

    const tools = createGoalTools(goals, publisher);

    return Promise.resolve(createGoalHooks(goals, publisher, tools));
};
