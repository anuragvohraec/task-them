import { DAO } from "./dao";

export enum TaskManagerMessage{
    INIT_WEBWORKER="INIT_WEBWORKER",
    CHANGE_TASK_STATE="CHANGE_TASK_STATE",
    CHANGE_TASK_PHASE="CHANGE_TASK_PHASE",
    CREATE_TASK="CREATE_TASK",
    RUN_A_TASK="RUN_A_TASK",
    GET_TASK_STATUS="GET_TASK_STATUS",
    /**
     * Clears all tasks.
     */
    CLEAR_TASK_THEM="CLEAR_TASK_THEM"
}

//Object.freeze(TaskManagerMessage);

export enum TaskSchedulerMessage{
    RUN_TASK="RUN_TASK",
    TASK_STATUS="TASK_STATUS",
    CLEAR_TASK_THEM="CLEAR_TASK_THEM"
}

export const TASK_THEM_DB = "TASK_THEM_DB";
export const task_them_os = "_task_them_entries";

//Object.freeze(TaskSchedulerMessage);