import {RandoEngine} from './engines/rando-engine';
import {DAO} from './engines/dao';
import { TaskRunnerEntry, TASK_BEHAVIOR, TASK_STATE, UpdateLogs, TaskManagerMessage, TaskSchedulerMessage } from '../lib';

const TASK_THEM_DB = "TASK_THEM_DB";
const dbname = "_task_them_entries";

const ENDING_STATE:Set<TASK_STATE>=new Set<TASK_STATE>(["COMPLETED","FAILED"]);

class TaskScheduler{
    private static dao:DAO = new DAO(TASK_THEM_DB,1,[{name:dbname,primaryKeyName:"_id",indexes:["task_name","ended"]}])
    static onmessage=async (e:MessageEvent)=>{
            const data = e.data.data;
            const msgType:TaskManagerMessage = e.data.type;
            switch (msgType) {
                case TaskManagerMessage.INIT_WEBWORKER: await TaskScheduler.init();
                break;
                
                case TaskManagerMessage.CHANGE_TASK_STATE:{
                    const task_id:string = data.task_id;
                    const new_state: TASK_STATE = data.state;
                    await TaskScheduler.dao.update(dbname,task_id,(oldObject:TaskRunnerEntry)=>{
                        if(ENDING_STATE.has(new_state)){
                            oldObject.ended="true";
                        }
                        const now = new Date().getTime();
                        oldObject.updated_date=now;
                        oldObject.updates_logs[now]=`STATE CHANGED: ${new_state} , from: <${oldObject.current_state_of_task}>`;
                        oldObject.current_state_of_task=new_state;
                        
                        return oldObject;
                    });
                };
                break;

                case TaskManagerMessage.CHANGE_TASK_PHASE: {
                    const task_id:string = data.task_id;
                    const new_phase: string = data.phase;
                    const new_phase_data:any = data.phase_data;

                    await TaskScheduler.dao.update(dbname,task_id,(oldObject:TaskRunnerEntry)=>{
                        const now = new Date().getTime();
                        oldObject.updated_date=now;
                        oldObject.updates_logs[now]=`PHASE CHANGED: ${new_phase} , from: <${oldObject.current_phase}>`;
                        oldObject.current_state_of_task="CONTINUE";
                        oldObject.current_phase=new_phase;
                        oldObject.current_phase_data=new_phase_data;

                        return oldObject;
                    });
                };
                break;

                case TaskManagerMessage.CREATE_TASK: {
                    const task_name:string= data.task_name;
                    const behaves:TASK_BEHAVIOR = data.behaves;
                    if(behaves === "ONLY_ONCE_IN_LIFE"){
                        //check if once such task is already present in DB.
                        const found_entries = await TaskScheduler.dao.find(dbname,"task_name",task_name);
                        if(found_entries.length>0){
                            break;
                        }
                    }
                    const task_desc:string = data.task_desc;
                    const init_phase:string=data.init_phase;
                    const init_phase_data:String=data.init_phase_data;
                    

                    const now = new Date().getTime();
                    const updates_logs:UpdateLogs={};
                    updates_logs[now]="STATE CHANGED: INIT";
                    updates_logs[now+1]=`PHASE CHANGED: ${init_phase}`;

                    const _id= await RandoEngine.getuuid();
                    const te: TaskRunnerEntry={
                        task_name,task_desc,init_phase,init_phase_data,behaves,
                        _id,
                        created_date:now,
                        current_phase:init_phase,
                        current_phase_data:init_phase_data,
                        current_state_of_task:"INIT",
                        ended:"false",
                        updated_date:now,
                        updates_logs
                    }

                    if(await TaskScheduler.dao.create(dbname,te)){
                        postMessage({type:TaskSchedulerMessage.RUN_TASK, data:te});
                    }
                }
                break;
                default: throw `No such case: ${msgType} registered with scheduler!`;break;
            }
    }

    static async init(){
        //query database for all task where ended=false and 
        const found_te: TaskRunnerEntry[]=await TaskScheduler.dao.find(dbname,"ended","false");
        if(found_te.length>0){
            found_te.sort((a,b)=>{
                return a.created_date-b.created_date;
            })
            for(let te in found_te){
                postMessage({type:TaskSchedulerMessage.RUN_TASK, data:te});
            }
        }
    }
}

onmessage=TaskScheduler.onmessage;
