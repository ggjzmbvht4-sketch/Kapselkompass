import {describe,it,expect} from 'vitest';
import {average,validateTasting,sameVersion,type Tasting,type LocalRow} from './domain';
const t:Tasting={capsule_id:'c',date:'2026-11-15',method:'Espresso',notes:'',tags:[],rebuy:'yes',aroma:4,intensity:5,acidity:6,bitterness:7,body:8,overall:9};
const row=(id:string,score:number,deleted=false)=>({id,kind:'tastings',user_id:'u',data:{...t,overall:score},version:1,baseVersion:1,deleted,updated_at:''} as LocalRow);
describe('Geschmacksprofil',()=>{
 it('requires every criterion to be deliberately selected',()=>{expect(validateTasting(t)).toBe(true);expect(validateTasting({...t,aroma:undefined!})).toBe(false);expect(validateTasting({...t,overall:11})).toBe(false);expect(validateTasting({...t,acidity:2.5})).toBe(false);});
 it('averages quality independently of intensity and ignores deleted entries',()=>{expect(average([row('1',9),row('2',5),row('3',1,true)],'c')).toBe(7);expect(average([row('1',9)],'c','acidity')).toBe(6);expect(average([],'c')).toBeNull();});
 it('recognizes remote version conflicts',()=>{const r=row('1',8);expect(sameVersion({...r,version:2},r)).toBe(false);expect(sameVersion(r,r)).toBe(true);});
});
