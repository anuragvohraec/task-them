import { Task } from "./task";
import { TaskRunnerEntry, TaskSchedulerMessage, TASK_BEHAVIOR, TASK_STATE, StateChangeHandler, PhaseChangeData, DAO, TASK_THEM_DB, UpdateLogs} from '../lib';
import {RandoEngine,ENDING_STATES,task_them_os as dbname} from '../lib';

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
    private static dao:DAO = new DAO(TASK_THEM_DB,1,[{name:dbname,primaryKeyName:"_id",indexes:["task_name","ended","created_date","updated_date"]}]);

    private static taskRegistry:{[task_name:string]:typeof Task}={};
    private static taskActionOnPhaseChangeReg:Record<string,ActOnPhaseChange>={};
    
    
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
     * @param archive_ended_task_before : if -1 then it will do no archiving, else it will archive all ended task before this time. Since Unix Epoch time
     */
    static init(archive_ended_task_before:number=-1){
        return this.runOldAndArchivedEndedTaskBefore(archive_ended_task_before);
    }

    private static async handleTaskSchedulerMessages(type:TaskSchedulerMessage,data:any){
        switch(type){
            case TaskSchedulerMessage.PHASE_CHANGE:{
                const t:PhaseChangeData =data;
                try{
                    const actionOnPhaseChange=this.taskActionOnPhaseChangeReg[t.task_name];
                    actionOnPhaseChange?.(t);
                }catch(e){
                    console.error(`[TASK-THEM] throws error in actionOnPhaseChange function`);
                }
            }break;
            case TaskSchedulerMessage.RUN_TASK:{
                const t:TaskRunnerEntry = data;
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
                            delete this.activeTask[t._id];
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
                const t:TaskRunnerEntry = data;
                this.getTaskStatusMap[t._id](t);
            }break;
            case TaskSchedulerMessage.CLEAR_TASK_THEM:{
                await this.taskThemClearResolverFunc(data);
                //@ts-ignore
                this.taskThemClearResolverFunc=undefined;
            }
        }
    }

    /**
     * runs task which were incomplete before now.
     * And archive task which are no longer runnable.
     * @param archive_ended_task_before 
     */
    private static async runOldAndArchivedEndedTaskBefore(archive_ended_task_before:number){
         //query database for all task where ended=false and 
         const found_net: TaskRunnerEntry[]=await this.dao.findNotEndedTask(dbname);
         if(found_net.length>0){
            //  found_net.sort((a,b)=>{
            //      return a.created_date-b.created_date;
            //  })
             for(let te of found_net){
                 await this.handleTaskSchedulerMessages(TaskSchedulerMessage.RUN_TASK,te);
             }
         }
 
         //deleting ended task before the given date
         if(archive_ended_task_before>-1){
             const found_et: TaskRunnerEntry[] = await this.dao.find(dbname,"ended","true");
             if(found_et.length>0){
                 found_et.sort((a,b)=>{
                     return a.created_date-b.created_date;
                 });
                 for(let et of found_et){
                     if(et.created_date<=archive_ended_task_before){
                         //lets delete them
                         await this.dao.delete(dbname,et._id);
                     }
                 }
             }
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
    public static async runAPausedTask(task_id:string,stateChangeHandler?:StateChangeHandler){
        if(this.pausedTask[task_id]){
            if(stateChangeHandler){
                this.changeHandlerRegistry[task_id]=stateChangeHandler;
            }
            const te:TaskRunnerEntry = await this.dao.read(dbname,task_id);
            if(te && te.ended!=="true"){
                return await this.handleTaskSchedulerMessages(TaskSchedulerMessage.RUN_TASK,te);
            }
        }
    }

    /**
     * Gets current task status
     * @param task_id 
     */
    public static async getTaskStatus(task_id:string):Promise<TaskRunnerEntry>{
        let te:TaskRunnerEntry = await this.dao.read(dbname,task_id);
        return await new Promise<TaskRunnerEntry>(res=>{
            this.getTaskStatusMap[task_id]=res;
            this.handleTaskSchedulerMessages(TaskSchedulerMessage.TASK_STATUS,te);
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

            this.dao.cleanAllObjectStores().then(e=>{
                if(e){
                    this.handleTaskSchedulerMessages(TaskSchedulerMessage.CLEAR_TASK_THEM,true);
                }else{
                    this.handleTaskSchedulerMessages(TaskSchedulerMessage.CLEAR_TASK_THEM,false);
                }
                
            });
        });
    }

    // /**
    //  * If you want to run some advanced query on TaskDB than this DAO can help.
    //  */
    // static get tsDAO():DAO{
    //     return dao;
    // }

    private  static async change_task_state(task_id:string, state: TASK_STATE){
        const new_state: TASK_STATE = state;
        await this.dao.update(dbname,task_id,(oldObject:TaskRunnerEntry)=>{
            if(ENDING_STATES.has(new_state)){
                oldObject.ended="true";
            }
            
            const now = new Date().getTime();
            oldObject.updated_date=now;
            oldObject.updates_logs[now]=`STATE CHANGED: ${new_state} , from: <${oldObject.state}>`;
            
            if(new_state==="INIT"){
                const old_phase=oldObject.phase;
                oldObject.phase=oldObject.init_phase;
                oldObject.phase_data=oldObject.init_phase_data;
                oldObject.updates_logs[now+1]=`PHASE CHANGED: ${oldObject.init_phase} , from: <${old_phase}>`;
            }
            oldObject.state=new_state;

            return oldObject;
        });
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
     * To be called only inside task runner
     * @param task_id 
     * @param details 
     */
    static async addLog(task_id:string,details:string){
        return await this.dao.update(dbname,task_id,(oldObject:TaskRunnerEntry)=>{
            const now = new Date().getTime();
            oldObject.updated_date=now;
            oldObject.updates_logs[now]=details;
            return oldObject;
        });
    }

    /**
     * Is sparingly used separately. In run change_phase method is available. But this method can be helpful in some special case.
     * @param task_id 
     * @param phase 
     * @param phase_data 
     */
    static async change_task_phase(task_id:string, phase:string, phase_data?:any){
        
        const te = await this.getTaskStatus(task_id);
        const new_phase: string = phase;
        const new_phase_data:any = phase_data;

        await this.dao.update(dbname,task_id,(oldObject:TaskRunnerEntry)=>{
            const now = new Date().getTime();
            oldObject.updated_date=now;
            oldObject.updates_logs[now]=`PHASE CHANGED: ${new_phase} , from: <${oldObject.phase}>`;
            oldObject.state="CONTINUE";
            oldObject.phase=new_phase;
            oldObject.phase_data=new_phase_data;
            return oldObject;
        });

        const phaseChangeData:PhaseChangeData={
            task_name:te.task_name,
            new_phase,
            new_phase_data
        };
        return await this.handleTaskSchedulerMessages(TaskSchedulerMessage.PHASE_CHANGE,phaseChangeData);
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
        // this.worker.postMessage({type: TaskManagerMessage.CREATE_TASK,data:{_id, task_name:task_info.task_name, 
        //     task_desc:task_info.task_desc, init_phase:task_info.init_phase,
        //     init_phase_data: task_info.init_phase_data,behaves}});
        const task_name:string= task_info.task_name;
        if(behaves === "ONLY_ONCE_IN_LIFE"){
            //check if once such task is already present in DB.
            const found_entries = await this.dao.find(dbname,"task_name",task_name);
            if(found_entries.length>0){
                return;
            }
        }else if(behaves === "ONLY_ONE_ACTIVE_IN_QUEUE"){
            const found_entries = await this.dao.find<{name:string}>(dbname,"ended","false");
            if(found_entries.length>0){
                //lets search if queue already have one active member of this
                let f = found_entries.filter(e=>e.name===task_name);
                if(f.length>0){
                    return;
                }
            }
        }
        const task_desc:string = task_info.task_desc;
        const init_phase:string=task_info.init_phase;
        const init_phase_data:String=task_info.init_phase_data;
        

        const now = new Date().getTime();
        const updates_logs:UpdateLogs={};
        updates_logs[now]="STATE CHANGED: INIT";
        updates_logs[now+1]=`PHASE CHANGED: ${init_phase}`;

        const te: TaskRunnerEntry={
            task_name,task_desc,init_phase,init_phase_data,behaves,
            _id,
            created_date:now,
            phase:init_phase,
            phase_data:init_phase_data,
            state:"INIT",
            ended:"false",
            updated_date:now,
            updates_logs
        }

        if(await this.dao.create(dbname,te)){
            await this.handleTaskSchedulerMessages(TaskSchedulerMessage.RUN_TASK,te);
        }
        return _id;
    }

    private static remove_stateChangeHandler(task_id:string){
        delete this.changeHandlerRegistry[task_id];
    }
}