import type {TuiApi, TuiIdentity} from "./types";

export const resolveTuiIdentity = async (api: TuiApi): Promise<TuiIdentity | undefined> => {
    try {
        const response = await api.client.v2.location.get({location: {directory: api.state.path.worktree}});

        const projectID = response.data?.project.id;

        return projectID ? {projectID, worktree: api.state.path.worktree} : undefined;
    } catch {
        return undefined;
    }
};
