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

    protected name?:string;

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
    _execute(_id:string, task_name:string,task_desc:string, state:TASK_STATE, phase:string, phase_data:any):Promise<TASK_STATE>{
        this._id=_id;
        this.name=task_name;
        return this.run(task_name,task_desc,state,phase,phase_data);
    }

    /**
     * returns next task state.
     * @param task_name 
     * @param task_desc 
     * @param state 
     * @param phase 
     * @param phase_data 
     * 
     */
    protected abstract run(task_name:string,task_desc:string, state:TASK_STATE, phase:string, phase_data:any):Promise<TASK_STATE>;
    
    /**
     * * Use this in your run function to report phase change to scheduler. This is vital to keep reporting scheduler about phase change so it can persist the phase change and resume it later if required.
     * * Every phase change will automatically make the state change to continue [unless the task is in ended state].
     * @param new_phase 
     * @param new_phase_data 
     */
    record_phase_change(new_phase:string, new_phase_data?:any){
        return TaskManager.change_task_phase(this._id!,new_phase,new_phase_data);
    }

    addLog(details:string){
        return TaskManager.addLog(this._id!,details);
    }
}