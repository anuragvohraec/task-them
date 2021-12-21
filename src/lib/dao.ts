
export interface DBDetails{
    name: string,
    primaryKeyName?: string;
    indexes?:string[];
}

/**
 * UpdateObjectFunction are used to update the object in DB.
 * the update function of a DAO, is given primarykey for object and this update function.
 * update function first searches for the object if found it passes it to the update function and expect to receive the modified doc, which it then saves to db.
 * If no object is returned it skips the update [so business logic can can be implemented inside to abort or perform an update]
 * if no object is found , than it will simply ignore this function.
 */
export interface UpdateObjectFunction {
    (oldObject: any): any;
}

export class DAO {
    req!: IDBOpenDBRequest;
    db!: IDBDatabase;
    isInitialized!: Promise<boolean>;

    constructor(private databaseName:string, version: number, listofDBDetails: DBDetails[]) {
        if (indexedDB) {
            this.req = indexedDB.open(databaseName, version);

            this.req.onupgradeneeded = (e) => {
                this.db = this.req.result;
                listofDBDetails.forEach(element => {
                    this.createObjectStore(element);
                });
            };

            this.isInitialized = new Promise<boolean>((res, rej) => {
                this.req.onsuccess = (e) => {
                    this.db = this.req.result;
                    res(true);
                };
            });
        }
    }

    public closeTheDB() {
        this.db.close();
    }

    public static async checkIfDBExist(dbname: string) {
        //@ts-ignore
        return (await indexedDB.databases()).map(e => e.name).includes(dbname) as boolean;
    }

    /**
     * returns -1 when store do no exist
     * @param storeName 
     */
    public async getCountInStore(storeName: string) {
        try {
            const tx = this.db.transaction([storeName]);
            const os = tx.objectStore(storeName);
            const resp = os.count();
            return await new Promise<number>((res)=>{
                resp.onsuccess=()=>{
                    res(resp.result);
                }
            });
        } catch (e) {
            console.error(e);
            return -1;
        }
    }

    public async getLastObjectFromObjectStore(storeName: string) {
        try {
            const tx = this.db.transaction([storeName]);
            const os = tx.objectStore(storeName);

            const cr = os.openCursor(null, "prev");
            const cursor = await new Promise<IDBCursorWithValue>((res, rej) => {
                cr.onsuccess = (ev) => {
                    //@ts-ignore
                    res(ev.target.result);
                };
                cr.onerror = rej;
            });
            return cursor?.value;
        } catch (e) {
            console.error(e);
            return;
        }
    }

    public async deleteTheDB() {
        if (await this.isInitialized) {
            try {
                this.closeTheDB();
                const req = indexedDB.deleteDatabase(this.databaseName);
                const event = await (async () => {
                    return new Promise<{ type: string }>((res, rej) => {
                        req.onsuccess = res;
                        req.onerror = rej;
                    });
                })();
                return event.type === 'success';
            } catch (e) {
                console.error("Failed to delete the database");
                console.error(e);
                return false;
            }
        }
    }

    createObjectStore(dbdetail:DBDetails) {
        if (!this.db.objectStoreNames.contains(dbdetail.name)) {
            let os:IDBObjectStore;
            if (dbdetail.primaryKeyName) {
                os = this.db.createObjectStore(dbdetail.name, { keyPath: dbdetail.primaryKeyName })
            } else {
                os = this.db.createObjectStore(dbdetail.name, { autoIncrement: true })
            }
            if(dbdetail.indexes){
                for(let i of dbdetail.indexes){
                    os.createIndex(i,i);
                }
            }
        }
    }

    async cleanAllObjectStores(){
        let allGood=false;
        if (await this.isInitialized) {
            const l = this.db.objectStoreNames.length;
            try{
                for(let i=0;i<l;i++){
                    const osName = this.db.objectStoreNames.item(i);
        
                    const os = this.db.transaction([osName!], 'readwrite').objectStore(osName!);
                    const req = os.clear();
                    
                    if(!await new Promise<boolean>(res=>{
                            req.onsuccess=(e:Event)=>{
                                res(true);
                            }
                            req.onerror=(e:Event)=>{
                                res(false);
                            }
                        })
                    ){
                        throw `${osName} not cleared`;
                    }
                }
                allGood=true;
            }catch(e){
                console.error(e);
            }
        }
        return allGood;
    }

    async create(dbname: string, objectToSave: any) {
        if (await this.isInitialized) {
            try {
                const req = this.db.transaction([dbname], 'readwrite')
                    .objectStore(dbname)
                    .add(objectToSave);

                return await new Promise<boolean>((res, rej) => {
                    req.onsuccess =()=>{
                        res(true);
                    };
                    req.onerror = ()=>{
                        res(false);
                    }
                });
            } catch (e) {
                console.error("Failed to create");
                console.error(e);
                return false
            }
        }
    }

    /**
     * creates if no present, else updates the existing doc
     * @param dbname 
     * @param key 
     * @param doc 
     */
    async updateItemWithKey(dbname: string, key: string, doc: any) {
        //check if it exist
        const objectStore = this.db.transaction([dbname], 'readwrite').objectStore(dbname);

        if (objectStore) {
            const doKeyExist = await (new Promise<boolean>((res, rej) => {
                objectStore.getKey(key).onsuccess = (e) => {
                    //@ts-ignore
                    let key = objectStore.result;
                    key ? res(true) : res(false);
                }
            }));
            //if do key exist
            if (doKeyExist) {
                //we will need to update the existing doc
                return await (new Promise<boolean>((res, rej) => {
                    const req = objectStore.put(doc, key);

                    req.onsuccess = (e) => {
                        res(true);
                    }

                    req.onerror = (e) => {
                        console.error(`Failed to save attachment ${this.databaseName}/${key}`);
                        console.error(e);
                        res(false);
                    }
                }));
            } else {
                return await (new Promise<boolean>((res, rej) => {
                    const req = objectStore.add(doc, key);
                    req.onsuccess = (e) => {
                        res(true);
                    }

                    req.onerror = (e) => {
                        console.error(`Failed to save attachment ${this.databaseName}/${key}`);
                        console.error(e);
                        res(false);
                    }
                }));
            }
        } else {
            console.log("No such DB: ", dbname);
            return false;
        }
    }

    async read(dbname: string, indexValue?: any) {
        if (await this.isInitialized) {
            return await this._read(dbname, indexValue);
        }
    }

    /**
     * Do not check is initialized, used during onupgrade needed by the derivative classes.
     * @param dbname 
     * @param indexValue 
     */
    private async _read(dbname: string, indexValue?: any) {
        try {
            const transaction = this.db.transaction([dbname]);
            const objectStore = transaction.objectStore(dbname);
            if (indexValue) {
                const req = objectStore.get(indexValue);
                return await new Promise<any>((res)=>{
                    req.onsuccess=(e:Event)=>{
                        //@ts-ignore
                        res(e.target.result);
                    }
                    req.onerror=(e)=>{
                        res(undefined);
                    }
                });
            } else {
                return await new Promise<any>((res)=>{
                    let t =objectStore.getAll();
                    t.onsuccess=(e:Event)=>{
                        //@ts-ignore
                        res(e.target.result);
                    };
                    t.onerror=(e:Event)=>{
                        res(undefined);
                    }
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    private async _update(dbname: string, newUpdatedObject: any) {
        if (await this.isInitialized) {
            try {
                const req = this.db.transaction([dbname], 'readwrite')
                    .objectStore(dbname)
                    .put(newUpdatedObject);

                return await new Promise<boolean>(res=>{
                    req.onsuccess=(e:Event)=>{
                        res(true);
                    }
                    req.onerror=(e:Event)=>{
                        res(false);
                    }
                });
            } catch (e) {
                console.error("Failed to update");
                console.error(e);
                return false
            }
        }
    }


    async update(dbname: string, primaryKey: string, updateObjectFunction: UpdateObjectFunction, docToCreate?:any) {
        const doc = await this.read(dbname, primaryKey);
        if (!doc) {
            if(docToCreate){
                return await this.create(dbname,docToCreate);
            }else{
                return false;
            }
            
        } else {
            const newUpdatedObject = await updateObjectFunction(doc);
            if (!newUpdatedObject) {
                return false;
            } else {
                return await this._update(dbname, newUpdatedObject);
            }
        }
    }


    async delete(dbname: string, indexValue: any) {
        if (await this.isInitialized) {
            const req = this.db.transaction([dbname], 'readwrite')
                .objectStore(dbname)
                .delete(indexValue);
            
            return await new Promise<boolean>(res=>{
                req.onsuccess=(e:Event)=>{
                    res(true);
                }
                req.onerror=(e:Event)=>{
                    res(false);
                }
            });
        }
    }

    async find<T>(dbname:string,index_name:string,value:any){
        const result:T[]=[];
        if(await this.isInitialized){
            const os= this.db.transaction([dbname],'readonly').objectStore(dbname);
            const index = os.index(index_name);
            if(index){
                const range = IDBKeyRange.only(value);
                await new Promise<void>(res=>{
                    index.openCursor(range).onsuccess=(e)=>{
                        //@ts-ignore
                        const cursor: IDBCursor = e.target.result;
                        if(cursor){
                            //@ts-ignore
                            result.push(cursor.value);
                            cursor.continue();
                        }else{
                            res();
                        }
                    }
                });
            }
        }
        return result;
    }


}

/*usage
         const dao = new DAO('myapp','1.0',[{name: 'test1', primaryKeyName: 'name'}]);
        (async ()=>{
           try{
            if(await dao.isInitialized){
                const t0= await dao.create('test1', {name: 'Anurag Vohra', age: 30});
                console.log(t0);
                const t15 = await dao.update('test1',{name: 'Anurag Vohra', age: 31})
                console.log(t15);
                const t = await dao.read('test1', 'Anurag Vohra');
                console.log(t);
                const t01 = await dao.read('test1');
                console.log(t01);
                const t1 =  await dao.delete('test1','Anurag Vohra');
                console.log(t1);
                const t2 = await dao.read('test1', 'Adf');
                console.log(t2);
            }
           }catch(e){
               console.log(e);
           }
        })();
*/
