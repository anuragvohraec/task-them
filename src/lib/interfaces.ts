/**
 * * WILL_QUEUE : Multiple task can exist in processing queue.
 * * ONLY_ONCE_IN_LIFE: One can create only one such task. Unless you delete the task runner task, which you don't do ever!
 */
export type TASK_BEHAVIOR = "WILL_QUEUE"|"ONLY_ONCE_IN_LIFE";
/**
 * This state is used by the Task runner to check which task needs to be picked. For example:
 * * COMPLETED: means that all went good as desired. Completed task are not picked up again.
 * * FAILED: Means that task is in state of no recovery and has failed.
 * 
 */
export type TASK_STATE="INIT"|"CONTINUE"|"COMPLETED"|"FAILED";

export interface TaskRunnerEntry{
    _id:string;
    /**
     * Short unique name which make its intent clear.
     */
    task_name: string;
    /**
     * Detailed description of what task is intended to do
     */
    task_desc:string;
    
    /**
     * Date on which this task was created, in milliseconds since Unix Epoch.
     */
    created_date: number;


    behaves: TASK_BEHAVIOR;
    

    current_state_of_task: TASK_STATE;
    /**
     * if set true task will no more be picked. Its set as true on failed or complete.
     */
    ended:boolean;


    init_phase:string;
    /**
     * Cannot be falsy.\
     * This are Task specific phase , for example for initializing an app following can be its phase
     * * INITIALIZE_DB
     * * SYNC_DATA
     * * DO_SANITY_CHECKS
     * Its suggested to use this phase like this:
     * ```js
     * switch(phase){
     *  case "INITIALIZE_DB":
     *         this.initializeDB()
     *  case "SYNC_DATA":
     *          this.sync_data();
     * }
     * ```
     */
    current_phase: string;

    /**
     * Any _init data to be passed to task. This data cannot be modified by the task.
     */
    init_phase_data: any;
    /**
     * Each phase once completes has a state of data, which can be saved in here. Its can be used to start a task from whee ever it left off.
     */
    current_phase_data: any;
    /**
     * Date on which this task was modified, in milliseconds since Unix Epoch.
     */
    updated_date:number;
    /**
     * Update logs will be saved in here.
     * {
     *  1231231123:["updated something1","updated something 2"]
     * }
     */
    updates_logs: UpdateLogs;
}

export interface UpdateLogs{[date:number]:string}