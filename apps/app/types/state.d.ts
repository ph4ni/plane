import { IProject, IProjectLite, IWorkspaceLite } from "types";

export type TStateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export interface IState {
  readonly id: string;
  color: string;
  readonly created_at: Date;
  readonly created_by: string;
  default: boolean;
  description: string;
  group: TStateGroup;
  name: string;
  project: string;
  readonly project_detail: IProjectLite;
  sequence: number;
  readonly slug: string;
  readonly updated_at: Date;
  readonly updated_by: string;
  workspace: string;
  workspace_detail: IWorkspaceLite;
}

export interface IStateLite {
  color: string;
  group: TStateGroup;
  id: string;
  name: string;
}

export interface IStateResponse {
  [key: string]: IState[];
}
