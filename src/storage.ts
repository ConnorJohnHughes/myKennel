import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { publicProject } from './projectConfig';
import { emptyRecords, validateLitter, validatePuppy, validateWeight, replaceRecord, type Litter, type Puppy, type Records, type Weight } from './domain';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || publicProject.url;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || publicProject.publishableKey;
export const supabase = process.env.EXPO_PUBLIC_LOCAL_PREVIEW !== 'true' && url && key ? createClient(url, key, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
}) : null;
const localKey = 'mykennel-preview-v1';
export async function loadRecords(): Promise<Records> {
  if (!supabase) {
    const saved = await AsyncStorage.getItem(localKey);
    return saved ? JSON.parse(saved) : emptyRecords;
  }
  const membership = await supabase.from('staff').select('user_id').limit(1);
  if (membership.error) throw membership.error;
  if (!membership.data?.length) throw Object.assign(new Error('Enter your shared kennel code to connect.'),{code:'KENNEL_ACCESS_REQUIRED'});
  const results = await Promise.all(['litters','puppies','weights'].map(t => supabase!.from(t).select('*')));
  for (const result of results) if (result.error) throw result.error;
  return {
    litters: results[0].data!.map(r => ({id:r.id,version:r.version,name:r.name,mother:r.mother,father:r.father,born:r.born})),
    puppies: results[1].data!.map(r => ({id:r.id,version:r.version,litterId:r.litter_id,name:r.name})),
    weights: results[2].data!.map(r => ({id:r.id,version:r.version,puppyId:r.puppy_id,date:r.date,grams:Number(r.grams)})),
  };
}
export async function addLitter(records: Records, litter: Omit<Litter,'id'>): Promise<void> {
  litter = validateLitter(records,litter);
  if (supabase) {
    const {error} = await supabase.from('litters').insert(litter);
    if (error) throw error;
  } else await AsyncStorage.setItem(localKey, JSON.stringify({...records,litters:[...records.litters,{...litter,id:localId()}]}));
}
export async function addPuppy(records: Records, puppy: Omit<Puppy,'id'>): Promise<void> {
  puppy = validatePuppy(records,puppy);
  if (supabase) {
    const {error} = await supabase.from('puppies').insert({name:puppy.name,litter_id:puppy.litterId});
    if (error) throw error;
  } else await AsyncStorage.setItem(localKey, JSON.stringify({...records,puppies:[...records.puppies,{...puppy,id:localId()}]}));
}
export async function saveWeight(records: Records, weight: Omit<Weight,'id'>): Promise<void> {
  weight = validateWeight(records,weight);
  if (supabase) {
    const {error} = await supabase.from('weights').insert({puppy_id:weight.puppyId,date:weight.date,grams:weight.grams});
    if (error) throw error;
  } else await AsyncStorage.setItem(localKey, JSON.stringify({...records,weights:[...records.weights,{...weight,id:localId()}]}));
}
function localId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export async function updateLitter(records: Records, litter: Litter): Promise<void> {
  const updated={...validateLitter(records,litter,litter.id),id:litter.id};
  const litters=replaceRecord(records.litters,updated);
  if (supabase) {
    const {id,...fields}=updated;
    await updateCloud('litters',id,litter.version,fields);
  } else await AsyncStorage.setItem(localKey,JSON.stringify({...records,litters}));
}
export async function updatePuppy(records: Records, puppy: Puppy): Promise<void> {
  const updated={...validatePuppy(records,puppy,puppy.id),id:puppy.id};
  const puppies=replaceRecord(records.puppies,updated);
  if (supabase) {
    await updateCloud('puppies',updated.id,puppy.version,{name:updated.name});
  } else await AsyncStorage.setItem(localKey,JSON.stringify({...records,puppies}));
}
export async function updateWeight(records: Records, weight: Weight): Promise<void> {
  const updated={...validateWeight(records,weight,weight.id),id:weight.id};
  const weights=replaceRecord(records.weights,updated);
  if (supabase) {
    await updateCloud('weights',updated.id,weight.version,{date:updated.date,grams:updated.grams});
  } else await AsyncStorage.setItem(localKey,JSON.stringify({...records,weights}));
}

async function updateCloud(table:string,id:string,version:number|undefined,fields:Record<string,unknown>) {
  if(!Number.isInteger(version))throw new Error('The shared database needs its latest setup SQL. Apply the shared realtime migration first.');
  const {data,error}=await supabase!.from(table).update(fields).eq('id',id).eq('version',version!).select('id').maybeSingle();
  if(error)throw error;
  if(!data)throw Object.assign(new Error('This record changed on another device. Cancel this edit and reopen the latest record.'),{code:'EDIT_CONFLICT'});
}
export async function joinKennel(code:string) {
  if(!supabase)throw new Error('Configure the Supabase project first.');
  if(!code.trim())throw new Error('Enter the shared kennel code.');
  const current=await supabase.auth.getSession();
  if(current.error)throw current.error;
  if(!current.data.session){
    const {error}=await supabase.auth.signInAnonymously();
    if(error)throw new Error('Unable to connect. Enable anonymous sign-ins in your Supabase Authentication settings and try again.');
  }
  const {error}=await supabase.rpc('join_kennel',{access_code:code.trim()});
  if(error)throw error;
}
