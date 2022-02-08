import { Task } from "./task";
import {TaskManagerMessage, TaskRunnerEntry, TaskSchedulerMessage, TASK_BEHAVIOR, TASK_STATE, StateChangeHandler, PhaseChangeData} from '../lib';
import {RandoEngine,ENDING_STATES,task_them_os} from '../lib';

export interface BasicTaskInfo{
    _id:string;
    task_name:string;
    task_desc:string;
    state: TASK_STATE;
}

export interface ActOnPhaseChange{
    (phaseChangeData:PhaseChangeData):void
}

export class TaskManager{
    private static taskRegistry:{[task_name:string]:typeof Task}={};
    private static taskActionOnPhaseChangeReg:Record<string,ActOnPhaseChange>={};
    
    private static initCalled=false;
    private static worker:Worker;
    private static changeHandlerRegistry:{[key:string]:StateChangeHandler}={};
    private static activeTask:Record<string,BasicTaskInfo>={};
    private static pausedTask:Record<string,BasicTaskInfo>={};
    private static getTaskStatusMap:Record<string,Function>={};

    private static taskThemClearResolverFunc:Function;

    /**
     * 
     * @param taskClass 
     * @param task_name : Default value will be Class.name 
     */
    static registerTaskClass(taskClass: typeof Task, task_name?:string,actOnPhaseChange?:ActOnPhaseChange){
        if(!task_name){
            task_name=taskClass.name;
        }
        this.taskRegistry[task_name]=taskClass;
        if(task_name && actOnPhaseChange){
            this.taskActionOnPhaseChangeReg[task_name]=actOnPhaseChange;
        }
    }

    /**
     * All task classes must be registered prior to calling this function.
     * All which are registered after this will not be picked.
     * This function will only work once. that is even if you call init again, it will not have no effect.
     * @param scheduler_worker_stringUrl 
     * @param archive_ended_task_before : if -1 then it will do no archiving, else it will archive all ended task before this time. Since Unix Epoch time
     */
    static init(scheduler_worker_stringUrl: string | URL="task-runner-ww.js",archive_ended_task_before:number=-1){
        if(!this.initCalled){
            this.worker = new Worker(scheduler_worker_stringUrl);
            this.worker.onmessage=async(e)=>{
                    switch(e.data.type){
                        case TaskSchedulerMessage.PHASE_CHANGE:{
                            const t:PhaseChangeData = e.data.data;
                            try{
                                const actionOnPhaseChange=this.taskActionOnPhaseChangeReg[t.task_name];
                                actionOnPhaseChange?.(t);
                            }catch(e){
                                console.error(`[TASK-THEM] throws error in actionOnPhaseChange function`);
                            }
                        }break;
                        case TaskSchedulerMessage.RUN_TASK:{
                            const t:TaskRunnerEntry = e.data.data;
                            const task_name = t.task_name;
                            this.activeTask[t._id]={...t};
                            delete this.pausedTask[t._id];
                            try{
                                if(!this.taskRegistry[task_name]){
                                    console.warn(`No such tasks!: ${task_name}`);
                                }else{
                                    const task:Task = Reflect.construct(this.taskRegistry[task_name],[]);
                                    const p = await task._execute(t._id,t.task_name,t.task_desc,t.state,t.phase,t.phase_data);
                                    if(ENDING_STATES.has(p)){
                                        delete this.activeTask[t._id];
                                    }else{
                                        this.pausedTask[t._id]={...t,state:p};
                                    }
                                    await this.change_task_state(t._id,p);
                                }
                            }catch(e){
                                console.warn(`Very bad Task ${task_name}! Your must catch all your exception in your run method!`);
                                console.error(e);
                                return await this.change_task_state(t._id,"FAILED");
                            }
                        }break;
                        case TaskSchedulerMessage.TASK_STATUS:{
                            const t:TaskRunnerEntry = e.data.data;
                            this.getTaskStatusMap[t._id](t);
                        }break;
                        case TaskSchedulerMessage.CLEAR_TASK_THEM:{
                            await this.taskThemClearResolverFunc(e.data.data);
                            //@ts-ignore
                            this.taskThemClearResolverFunc=undefined;
                        }
                    }
            };
            this.worker.postMessage({type:TaskManagerMessage.INIT_WEBWORKER, archive_ended_task_before});
            this.initCalled=true;
        }
    }

    /**
     * Gives ID of all task that are active and running currently.
     */
    public static get activeTasks():Record<string, BasicTaskInfo>{
        return this.activeTask;
    }

    /**
     * Gives ID of all task which are not ended, but have been paused from running (by user **run** code returning say CONTINUE).
     */
    public static get pausedTasks():Record<string, BasicTaskInfo>{
        return this.pausedTask;
    }

    /**
     * Check if the task is active
     * @param task_id 
     */
    public static isTaskActive(task_id:string):boolean{
        return this.activeTask[task_id]?true:false;
    }

    /**
     * check if the task is paused. Paused task is the one which has not ended , but is not run by te manager.
     * @param task_id 
     */
    public static isTaskPaused(task_id:string):boolean{
        return this.pausedTask[task_id]?true:false;
    }

    /**
     * The task which has ended.
     * @param task_id 
     */
    public static hasTaskEnded(task_id:string):boolean{
        return (!this.isTaskActive(task_id) && !this.isTaskPaused(task_id))?true:false;
    }

    /**
     * One can implement a continues progress detector using isTaskActive, isTaskPaused and runAPausedTask.
     * @param task_id 
     */
    public static runAPausedTask(task_id:string,stateChangeHandler?:StateChangeHandler){
        if(this.pausedTask[task_id]){
            if(stateChangeHandler){
                this.changeHandlerRegistry[task_id]=stateChangeHandler;
            }
            this.worker.postMessage({type:TaskManagerMessage.RUN_A_TASK, data:{task_id}});
        }
    }

    /**
     * Gets current task status
     * @param task_id 
     */
    public static getTaskStatus(task_id:string):Promise<TaskRunnerEntry>{
        return new Promise<TaskRunnerEntry>(res=>{
            this.worker.postMessage({type:TaskManagerMessage.GET_TASK_STATUS, data:{task_id}});
            this.getTaskStatusMap[task_id]=res;
        });
    }

    
    public static clearTaskThem(clearTaskRegistry:boolean=false){
        this.activeTask={};
        this.pausedTask={};
        if(clearTaskRegistry){
            this.taskRegistry={};
        }
        return new Promise<boolean>(res=>{
            this.taskThemClearResolverFunc=res;
            this.worker.postMessage({type:TaskManagerMessage.CLEAR_TASK_THEM});
        });
    }

    // /**
    //  * If you want to run some advanced query on TaskDB than this DAO can help.
    //  */
    // static get tsDAO():DAO{
    //     return dao;
    // }

    private  static async change_task_state(task_id:string, state: TASK_STATE){
        this.worker.postMessage({type:TaskManagerMessage.CHANGE_TASK_STATE, data: {task_id,state}});
        try{
            const stateChangeHandler = this.changeHandlerRegistry[task_id];
            //@ts-ignore
            if(stateChangeHandler){
                await stateChangeHandler(state, task_id);
                this.remove_stateChangeHandler(task_id);
            }
        }catch(e){
            console.warn(`Very bad!, your TaskStateChangeHandler for task_id:${task_id} do not catches its errors!`);
            console.error(e);
        }
    }

    /**
     * Is sparingly used separately. In run change_phase method is available. But this method can be helpful in some special case.
     * @param task_id 
     * @param phase 
     * @param phase_data 
     */
    static change_task_phase(task_id:string, phase:string, phase_data?:any){
        this.worker.postMessage({type: TaskManagerMessage.CHANGE_TASK_PHASE,data:{task_id,phase,phase_data}});
    }

    /**
     * 
     * @param task_name This name should be same as registered using TaskManager.registerTaskClass, which uses class name as the default name of the task.
     * @param task_desc Task description it can be different for same task, clarifying intent of the Task
     * @param init_phase Init phase to be used by our task. This is the phase your app will stored to when rollback is called.
     * @param init_phase_data init data to be used by roll back.
     * @param stateChangeHandler handler function to run on task state change
     */
    static async create_task(task_info:{task_name:string,task_desc:string,init_phase:string, 
        init_phase_data?:any, stateChangeHandler?:StateChangeHandler,run_time_behavior?:TASK_BEHAVIOR}){
        const t = this.taskRegistry[task_info.task_name];
        if(!t){
            throw `No such task registered with TaskManager. You must register task classes to use them!`;
        }
        const _id= await RandoEngine.getuuid();
        //@ts-ignore
        const behaves: TASK_BEHAVIOR = task_info.run_time_behavior??t.behavior;
        if(task_info.stateChangeHandler){
            this.changeHandlerRegistry[_id]=task_info.stateChangeHandler;
        }
        this.worker.postMessage({type: TaskManagerMessage.CREATE_TASK,data:{_id, task_name:task_info.task_name, 
            task_desc:task_info.task_desc, init_phase:task_info.init_phase,
            init_phase_data: task_info.init_phase_data,behaves}});
        return _id;
    }

    private static remove_stateChangeHandler(task_id:string){
        delete this.changeHandlerRegistry[task_id];
    }
}