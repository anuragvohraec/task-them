import { DAO } from "./dao";

export enum TaskManagerMessage{
    INIT_WEBWORKER="INIT_WEBWORKER",
    CHANGE_TASK_STATE="CHANGE_TASK_STATE",
    CHANGE_TASK_PHASE="CHANGE_TASK_PHASE",
    CREATE_TASK="CREATE_TASK",
    RUN_A_TASK="RUN_A_TASK"
}

//Object.freeze(TaskManagerMessage);

export enum TaskSchedulerMessage{
    RUN_TASK="RUN_TASK"
}

export const TASK_THEM_DB = "TASK_THEM_DB";
export const task_them_os = "_task_them_entries";

//Object.freeze(TaskSchedulerMessage);
export const dao:DAO = new DAO(TASK_THEM_DB,1,[{name:task_them_os,primaryKeyName:"_id",indexes:["task_name","ended","created_date","updated_date"]}])