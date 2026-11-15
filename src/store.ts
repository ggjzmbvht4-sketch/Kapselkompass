import {openDB} from 'idb';
import {supabase} from './backend';
import type {Kind,LocalRow,RecordData,Row} from './domain';
const db=openDB('kapselkompass',1,{upgrade(db){db.createObjectStore('records',{keyPath:'id'});}});
export const events=new EventTarget();
const generations=new Map<string,number>();
function changed(){events.dispatchEvent(new Event('change'));}
export async function list(user:string):Promise<LocalRow[]> {return (await (await db).getAll('records')).filter((r:LocalRow)=>r.user_id===user);}
export async function clear(user:string){generations.set(user,(generations.get(user)||0)+1);const d=await db,tx=d.transaction('records','readwrite');for(const r of await tx.store.getAll())if(r.user_id===user)await tx.store.delete(r.id);await tx.done;changed();}
export async function save(user:string,kind:Kind,data:RecordData,previous?:LocalRow,blob?:Blob){ const row:LocalRow={id:previous?.id||crypto.randomUUID(),user_id:user,kind,data,version:previous?.version||0,baseVersion:previous?.baseVersion||0,deleted:previous?.deleted||false,updated_at:new Date().toISOString(),dirty:true,blob:blob||previous?.blob};if(previous?.conflict)throw Error('Bitte zuerst den Änderungskonflikt lösen.');await (await db).put('records',row);changed();return row;}
export async function remove(row:LocalRow){await (await db).put('records',{...row,dirty:true,deleted:true});changed();}
export async function resolve(row:LocalRow,choice:'local'|'remote'){if(!row.conflict)return;const r=choice==='local'?{...row,baseVersion:row.conflict.version,version:row.conflict.version,conflict:undefined,error:undefined,dirty:true}:{...row.conflict,kind:row.kind,baseVersion:row.conflict.version};await (await db).put('records',r);changed();}
let syncing:Promise<void>|null=null;
export function sync(user:string){if(syncing)return syncing;syncing=perform(user).finally(()=>{syncing=null;changed();});return syncing;}
async function perform(user:string){if(!supabase||!navigator.onLine)return;const generation=generations.get(user)||0;const valid=()=>generation===(generations.get(user)||0);const d=await db;
 for(const kind of ['capsules','tastings','photos'] as Kind[]){
  for(const row of (await list(user)).filter(r=>r.kind===kind&&r.dirty&&!r.conflict)){
   if(!valid())return;
   try{
    if(kind==='photos'&&row.blob&&!row.deleted){const path=(row.data as {path:string}).path;const {error}=await supabase.storage.from('coffee-photos').upload(path,row.blob,{upsert:true,contentType:row.blob.type});if(error)throw error;}
    const {data,error}=await supabase.rpc('coffee_save_record',{p_kind:kind,p_id:row.id,p_data:row.data,p_expected:row.baseVersion,p_deleted:row.deleted});
    if(!valid())return;
    if(error){if(error.code==='40001'){const remote=await supabase.from('coffee_'+kind).select('*').eq('id',row.id).single();if(remote.error)throw remote.error;if(!valid())return;await d.put('records',{...row,conflict:remote.data,error:'Auf einem anderen Gerät geändert.'});continue;}throw error;}
    if(kind==='photos'&&row.deleted){const {error:storageError}=await supabase.storage.from('coffee-photos').remove([(row.data as {path:string}).path]);if(storageError)throw storageError;}
    if(!valid())return;
    // A concurrent local edit must remain queued against the new server version.
    const tx=d.transaction('records','readwrite');const current:LocalRow|undefined=await tx.store.get(row.id);
    if(current){const edited=JSON.stringify(current.data)!==JSON.stringify(row.data)||current.deleted!==row.deleted;await tx.store.put(edited?{...current,version:data.version,baseVersion:data.version,dirty:true}:{...data,kind,baseVersion:data.version,blob:row.deleted?undefined:row.blob});}await tx.done;
   }catch(e){if(!valid())return;const current=await d.get('records',row.id);if(current)await d.put('records',{...current,error:e instanceof Error?e.message:String((e as {message?:string}).message||e)});}
  }
  const {data,error}=await supabase.from('coffee_'+kind).select('*').eq('user_id',user);if(error)throw error;if(!valid())return;
  for(const remote of data||[]){const tx=d.transaction('records','readwrite');const local:LocalRow|undefined=await tx.store.get(remote.id);if(!local?.dirty)await tx.store.put({...remote,kind,baseVersion:remote.version,blob:remote.deleted?undefined:local?.blob});await tx.done;}
 }
}
export async function addPhotos(user:string,parent:string,files:File[]){for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Bitte JPEG, PNG oder WebP verwenden.');if(file.size>10*1024*1024)throw Error('Ein Foto darf höchstens 10 MB groß sein.');await save(user,'photos',{parent_id:parent,path:`${user}/${crypto.randomUUID()}`,caption:file.name},undefined,file);}}
export async function photoUrl(row:LocalRow,shared=false){if(row.blob&&!shared)return URL.createObjectURL(row.blob);if(!supabase)return '';const {data,error}=await supabase.storage.from('coffee-photos').download((row.data as {path:string}).path);if(error)throw error;if(!shared){const d=await db,tx=d.transaction('records','readwrite');const current=await tx.store.get(row.id);if(current&&!current.deleted)await tx.store.put({...current,blob:data});await tx.done;}return URL.createObjectURL(data);}
