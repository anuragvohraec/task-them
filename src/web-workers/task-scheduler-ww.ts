import {ENDING_STATES,DAO} from '../lib';
import { TaskRunnerEntry, TASK_BEHAVIOR, TASK_STATE, UpdateLogs, TaskManagerMessage, TaskSchedulerMessage,task_them_os as dbname, dao } from '../lib';

const msgEventStream = new ReadableStream<MessageEvent>({
    start:(controller)=>{
        onmessage=(e)=>{
            controller.enqueue(e);
        }
    }  
});

async function* messageEventGenerator(){
    const reader = msgEventStream.getReader();
    try{
        while(true){
            const {done, value} = await reader.read();
            if(done){
                console.warn("This should not end and should keep running!");
                break;
            }else{
                yield value;
            }
        }
    }finally{
        reader.releaseLock();
    }
}

class TaskScheduler{
    static process=async ()=>{
            for await(let e of messageEventGenerator()){
                if(e){
                    const data = e.data.data;
                    const msgType:TaskManagerMessage = e.data.type;
                    switch (msgType) {
                        case TaskManagerMessage.INIT_WEBWORKER: await TaskScheduler.init();
                        break;
                        
                        case TaskManagerMessage.CHANGE_TASK_STATE:{
                            const task_id:string = data.task_id;
                            const new_state: TASK_STATE = data.state;
                            await dao.update(dbname,task_id,(oldObject:TaskRunnerEntry)=>{
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
                        };
                        break;

                        case TaskManagerMessage.CHANGE_TASK_PHASE: {
                            const task_id:string = data.task_id;
                            const new_phase: string = data.phase;
                            const new_phase_data:any = data.phase_data;

                            await dao.update(dbname,task_id,(oldObject:TaskRunnerEntry)=>{
                                const now = new Date().getTime();
                                oldObject.updated_date=now;
                                oldObject.updates_logs[now]=`PHASE CHANGED: ${new_phase} , from: <${oldObject.phase}>`;
                                oldObject.state="CONTINUE";
                                oldObject.phase=new_phase;
                                oldObject.phase_data=new_phase_data;

                                return oldObject;
                            });
                        };
                        break;

                        case TaskManagerMessage.CREATE_TASK: {
                            const task_name:string= data.task_name;
                            const behaves:TASK_BEHAVIOR = data.behaves;
                            if(behaves === "ONLY_ONCE_IN_LIFE"){
                                //check if once such task is already present in DB.
                                const found_entries = await dao.find(dbname,"task_name",task_name);
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

                            const _id= data._id;
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

                            if(await dao.create(dbname,te)){
                                postMessage({type:TaskSchedulerMessage.RUN_TASK, data:te});
                            }
                        }
                        break;
                        case TaskManagerMessage.RUN_A_TASK:{
                            //check if task is ended
                            const {task_id}=data;
                            const te:TaskRunnerEntry = await dao.read(dbname,task_id);
                            if(te && !te.ended){
                                postMessage({type:TaskSchedulerMessage.RUN_TASK, data:te});
                            }
                        }
                        default: throw `No such case: ${msgType} registered with scheduler!`;break;
                    }
                }
            }
            
    }

    static async init(){
        //query database for all task where ended=false and 
        const found_te: TaskRunnerEntry[]=await dao.find(dbname,"ended","false");
        if(found_te.length>0){
            found_te.sort((a,b)=>{
                return a.created_date-b.created_date;
            })
            for(let te of found_te){
                postMessage({type:TaskSchedulerMessage.RUN_TASK, data:te});
            }
        }
    }
}

TaskScheduler.process();