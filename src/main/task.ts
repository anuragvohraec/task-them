import { TASK_BEHAVIOR, TASK_STATE } from "../lib";
import { TaskManager } from "./manager";

/**
 * * All Derivatives of Task must be no Argument constructors.
 * * Default task behavior is "WILL_QUEUE", if you want to change it. Than you need to wite a no arg constructor and override the value in it.
 * * default cron expression is undefined, which means a task will not be repetitive.
 */
export abstract class Task{
    protected static behaves: TASK_BEHAVIOR="WILL_QUEUE";
    
    protected _id?:string;

    static get behavior() : string {
        return this.behaves;
    }
    

    /**
     * This method will be instead be called by the manager. Do not call this from your code.
     * @param _id 
     * @param task_name 
     * @param task_desc 
     * @param state 
     * @param phase 
     * @param phase_data 
     */
    _execute(_id:string, task_name:string,task_desc:string, state:TASK_STATE, phase:string, phase_data:any):Promise<boolean>{
        this._id=_id;
        return this.run(task_name,task_desc,state,phase,phase_data);
    }

    /**
     * returns true if completed, if failed returns false;
     * @param task_name 
     * @param task_desc 
     * @param state 
     * @param phase 
     * @param phase_data 
     * 
     */
    protected abstract run(task_name:string,task_desc:string, state:TASK_STATE, phase:string, phase_data:any):Promise<boolean>;
    
    /**
     * * Use this in your run function to report phase change to back end.
     * * Reports phase change to scheduler.
     * * Every phase change will automatically make the state change to continue [unless the task is in ended state].
     * @param new_phase 
     * @param new_phase_data 
     */
    change_phase(new_phase:string, new_phase_data:any){
        TaskManager.change_task_phase(this._id!,new_phase,new_phase_data);
    }
}