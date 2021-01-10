export enum TaskManagerMessage{
    INIT_WEBWORKER="INIT_WEBWORKER",
    CHANGE_TASK_STATE="CHANGE_TASK_STATE",
    CHANGE_TASK_PHASE="CHANGE_TASK_PHASE",
    CREATE_TASK="CREATE_TASK",
}

//Object.freeze(TaskManagerMessage);

export enum TaskSchedulerMessage{
    RUN_TASK="RUN_TASK"
}

//Object.freeze(TaskSchedulerMessage);
