
export enum TaskSchedulerMessage{
    RUN_TASK="RUN_TASK",
    TASK_STATUS="TASK_STATUS",
    CLEAR_TASK_THEM="CLEAR_TASK_THEM",
    PHASE_CHANGE="PHASE_CHANGE"
}

export const TASK_THEM_DB = "TASK_THEM_DB";
export const task_them_os = "_task_them_entries";

//Object.freeze(TaskSchedulerMessage);