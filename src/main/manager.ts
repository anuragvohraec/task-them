import { Task } from "./task";
import {TaskManagerMessage, TaskRunnerEntry, TaskSchedulerMessage, TASK_BEHAVIOR, TASK_STATE} from '../lib';

export  interface TaskExtensionType{
    new(): Task
}


export class TaskManager{
    private static taskReg:{[task_name:string]:TaskExtensionType}
    private static initCalled=false;
    private static worker:Worker;

    /**
     * 
     * @param taskClass 
     * @param task_name : Default value will be Class.name 
     */
    static registerTaskClass<T extends Task>(taskClass: TaskExtensionType, task_name?:string){
        if(!task_name){
            task_name=taskClass.name;
        }
        this.taskReg[task_name]=taskClass;
    }

    /**
     * All task classes must be registered prior to calling this function.
     * All which are registered after this will not be picked.
     * This function will only work once. that is even if you call init again, it will not have no effect.
     */
    static init(scheduler_worker_stringUrl: string | URL="task-runner-ww.js"){
        if(!this.initCalled){
            this.worker = new Worker(scheduler_worker_stringUrl);
            //TODO handler at the worker end
            this.worker.postMessage({type:TaskManagerMessage.INIT_WEBWORKER});
            this.worker.onmessage=async(e)=>{
                    switch(e.data.type){
                        case TaskSchedulerMessage.RUN_TASK:{
                            const t:TaskRunnerEntry = e.data.data;
                            const task_name = t.task_name;
                            try{
                                if(!this.taskReg[task_name]){
                                    console.warn(`No such tasks!: ${task_name}`);
                                }else{
                                    const task:Task = Reflect.construct(this.taskReg[task_name],[]);
                                    const p = await task._execute(t._id,t.task_name,t.task_desc,t.current_state_of_task,t.current_phase,t.current_phase_data);
                                    if(p){
                                        this.change_task_state(t._id,"COMPLETED");
                                    }else{
                                        this.change_task_state(t._id,"FAILED");
                                    }
                                }
                            }catch(e){
                                console.warn(`Very bad Task ${task_name}! Your must catch all your exception in your run method!`);
                                console.error(e);
                                return this.change_task_state(t._id,"FAILED");
                            }
                        }
                    }
            }
            this.initCalled=true;
        }
    }

    private static change_task_state(task_id:string, state: TASK_STATE){
        this.worker.postMessage({type:TaskManagerMessage.CHANGE_TASK_STATE, data: {task_id,state}})
    }

    static change_task_phase(task_id:string, phase:string, phase_data:any){
        this.worker.postMessage({type: TaskManagerMessage.CHANGE_TASK_PHASE,data:{task_id,phase,phase_data}});
    }

    /**
     * 
     * @param task_name This name should be same as registered using TaskManager.registerTaskClass, which uses class name as the default name of the task.
     * @param task_desc Task description it can be different for same task, clarifying intent of the Task
     * @param init_phase Init phase to be used by our task. This is the phase your app will stored to when rollback is called.
     * @param init_phase_data init data to be used by roll back.
     */
    static create_task(task_name:string,task_desc:string,init_phase:string, init_phase_data?:any){
        const t = this.taskReg[task_name];
        if(!t){
            throw `No such task registered with TaskManager. You must register task classes to use them!`;
        }
        //@ts-ignore
        const behaves: TASK_BEHAVIOR = t.behavior;
        this.worker.postMessage({type: TaskManagerMessage.CREATE_TASK,data:{task_name, task_desc, init_phase,init_phase_data,behaves}});
    }
}