import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from './storage';
import {emptyHeatRecords,validateHeatName,validateHeatDate,validHeatDate,type HeatRecords,type HeatDog,type HeatCycle} from './heatDomain';
const key='mykennel-heat-preview-v1';
export async function loadHeatRecords():Promise<HeatRecords> {
  if(!supabase){const saved=await AsyncStorage.getItem(key);return saved?JSON.parse(saved):emptyHeatRecords;}
  const [dogs,cycles]=await Promise.all([supabase.from('heat_dogs').select('*'),supabase.from('heat_cycles').select('*')]);
  if(dogs.error||cycles.error)throw dogs.error||cycles.error;
  return {dogs:dogs.data!.map(d=>({id:d.id,name:d.name,version:d.version})),cycles:cycles.data!.map(c=>({id:c.id,dogId:c.dog_id,detected:c.detected,version:c.version}))};
}
function id(){return `${Date.now()}-${Math.random().toString(36).slice(2)}`;}
export async function addHeatDog(records:HeatRecords,name:string,date:string) {
  name=validateHeatName(records,name);validHeatDate(date);
  if(supabase){const {error}=await supabase.rpc('add_heat_dog',{dog_name:name,detected_date:date});if(error)throw error;}
  else {const dogId=id();await AsyncStorage.setItem(key,JSON.stringify({dogs:[...records.dogs,{id:dogId,name}],cycles:[...records.cycles,{id:id(),dogId,detected:date}]}));}
}
export async function saveHeatCycle(records:HeatRecords,dogId:string,date:string,original?:HeatCycle) {
  validateHeatDate(records,dogId,date,original?.id);
  if(supabase){
    if(original){const {data,error}=await supabase.from('heat_cycles').update({detected:date}).eq('id',original.id).eq('version',original.version!).select('id').maybeSingle();if(error)throw error;if(!data)throw conflict();}
    else{const {error}=await supabase.from('heat_cycles').insert({dog_id:dogId,detected:date});if(error)throw error;}
  }else await AsyncStorage.setItem(key,JSON.stringify({...records,cycles:original?records.cycles.map(c=>c.id===original.id?{...c,detected:date}:c):[...records.cycles,{id:id(),dogId,detected:date}]}));
}
export async function renameHeatDog(records:HeatRecords,dog:HeatDog,name:string) {
  name=validateHeatName(records,name,dog.id);
  if(supabase){const {data,error}=await supabase.from('heat_dogs').update({name}).eq('id',dog.id).eq('version',dog.version!).select('id').maybeSingle();if(error)throw error;if(!data)throw conflict();}
  else await AsyncStorage.setItem(key,JSON.stringify({...records,dogs:records.dogs.map(d=>d.id===dog.id?{...d,name}:d)}));
}
function conflict(){return Object.assign(new Error('This record changed on another device. Cancel and reopen it to edit the latest version.'),{code:'EDIT_CONFLICT'});}
