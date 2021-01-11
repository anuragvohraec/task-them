# Task-them

## Usage


## Algo
```
title Task-Them
# actors: task, manager, scheduler , idb
group Register task: "All Task muts be registered as the
first call to task manager"
  task -> manager: "Add task by calling add on manager:
manager.add(Task1)"
end

group Initialize taskthem
  user-code -> manager: "Call manager.init() 
to initialize the scheduler"
  manager -> scheduler:"Create Scheduler service worker"
  scheduler -> scheduler : "Calls init method, pulling out
all task which
are not marked as ended=true"
  scheduler -> manager :"call task with current 
state stored in task manager"
end

group Creating task
  user-code ->  manager: create_task(TaskClass, init_data and all other info)
  manager -> scheduler : record initiation
  scheduler -> manager : Instantiate the task and run.
end

group Run task
  scheduler -> manager : Provides current state of Task
  manager -> task : Instantiate and run , by calling task.run(current-state)
  divider tear with height 20: Manager keep running the async task
  manager -> task: will keep runing the task
  task -> manager : record phase
  manager -> scheduler : delegate phase received from task
end

terminators box
theme monospace
```

## Sequence Diagram
![Seq Diagram](./des/SequenceDiagram.svg)

## TODO 
* one time call back on task completion
* Force overwrite "TASK_STATE:ONCE_IN_LIFE"
* cron
