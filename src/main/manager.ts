import { Task } from "./task";
import {TaskManagerMessage, TaskRunnerEntry, TaskSchedulerMessage, TASK_BEHAVIOR, TASK_STATE, TaskStateChangeHandler} from '../lib';
import {RandoEngine} from '../lib/rando-engine';

export class TaskManager{
    private static taskRegistry:{[task_name:string]:typeof Task}={};
    private static initCalled=false;
    private static worker:Worker;
    private static changeHandlerRegistry:{[key:string]:TaskStateChangeHandler}={};

    /**
     * 
     * @param taskClass 
     * @param task_name : Default value will be Class.name 
     */
    static registerTaskClass(taskClass: typeof Task, task_name?:string){
        if(!task_name){
            task_name=taskClass.name;
        }
        this.taskRegistry[task_name]=taskClass;
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
                                if(!this.taskRegistry[task_name]){
                                    console.warn(`No such tasks!: ${task_name}`);
                                }else{
                                    const task:Task = Reflect.construct(this.taskRegistry[task_name],[]);
                                    const p = await task._execute(t._id,t.task_name,t.task_desc,t.state,t.phase,t.phase_data);
                                    await this.change_task_state(t._id,p, t.phase, t.phase_data);
                                }
                            }catch(e){
                                console.warn(`Very bad Task ${task_name}! Your must catch all your exception in your run method!`);
                                console.error(e);
                                return await this.change_task_state(t._id,"FAILED", t.phase, t.phase_data);
                            }
                        }
                    }
            }
            this.initCalled=true;
        }
    }

    private  static async change_task_state(task_id:string, state: TASK_STATE, phase:string, phase_data?:any){
        this.worker.postMessage({type:TaskManagerMessage.CHANGE_TASK_STATE, data: {task_id,state}});
        try{
            const stateChangeHandler = this.changeHandlerRegistry[task_id];
            //@ts-ignore
            if(stateChangeHandler){
                await stateChangeHandler(state,phase,phase_data);
            }
        }catch(e){
            console.warn(`Very bad!, your TaskStateChangeHandler for task_id:${task_id} do not catches its errors!`);
            console.error(e);
        }
    }

    static change_task_phase(task_id:string, phase:string, phase_data?:any){
        this.worker.postMessage({type: TaskManagerMessage.CHANGE_TASK_PHASE,data:{task_id,phase,phase_data}});
    }

    /**
     * 
     * @param task_name This name should be same as registered using TaskManager.registerTaskClass, which uses class name as the default name of the task.
     * @param task_desc Task description it can be different for same task, clarifying intent of the Task
     * @param init_phase Init phase to be used by our task. This is the phase your app will stored to when rollback is called.
     * @param init_phase_data init data to be used by roll back.
     */
    static async create_task(task_info:{task_name:string,task_desc:string,init_phase:string, 
        init_phase_data?:any, stateChangeHandler?:TaskStateChangeHandler}){
        const t = this.taskRegistry[task_info.task_name];
        if(!t){
            throw `No such task registered with TaskManager. You must register task classes to use them!`;
        }
        const _id= await RandoEngine.getuuid();
        //@ts-ignore
        const behaves: TASK_BEHAVIOR = t.behavior;
        if(task_info.stateChangeHandler){
            this.changeHandlerRegistry[_id]=task_info.stateChangeHandler;
        }
        this.worker.postMessage({type: TaskManagerMessage.CREATE_TASK,data:{_id, task_name:task_info.task_name, 
            task_desc:task_info.task_desc, init_phase:task_info.init_phase,
            init_phase_data: task_info.init_phase_data,behaves}});
        return _id;
    }

    static remove_stateChangeHandler(task_id:string){
        delete this.changeHandlerRegistry[task_id];
    }
}