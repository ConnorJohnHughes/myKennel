import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import DateField from './DateField';
import PhoneReminders from './PhoneReminders';
import {formatDate,today} from './domain';
import {heatHistory,reminderDates,type HeatDog,type HeatCycle} from './heatDomain';
import {addHeatDog,renameHeatDog,saveHeatCycle} from './heatStorage';
import {useHeatRecords} from './useHeatRecords';
function Action({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,disabled&&{opacity:.45}]}><Text style={s.buttonText}>{label}</Text></Pressable>;}
export default function HeatCycles({onEditingChange,onFormOpen}:{onEditingChange:(editing:boolean)=>void;onFormOpen:()=>void}) {
  const {records,error:syncError,loading,refresh}=useHeatRecords();
  const [form,setForm]=useState<'dog'|'name'|'cycle'|null>(null);const [dog,setDog]=useState<HeatDog|null>(null);const [cycle,setCycle]=useState<HeatCycle|undefined>();
  const [name,setName]=useState('');const [date,setDate]=useState(today());const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  useEffect(()=>{onEditingChange(!!form||busy);return()=>onEditingChange(false);},[form,busy,onEditingChange]);
  function open(kind:'dog'|'name'|'cycle',selected?:HeatDog,entry?:HeatCycle){setForm(kind);setDog(selected||null);setCycle(entry);setName(selected?.name||'');setDate(entry?.detected||today());setError('');setNotice('');requestAnimationFrame(onFormOpen);}
  async function save(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      if(form==='dog')await addHeatDog(records,name,date);
      else if(form==='name'&&dog)await renameHeatDog(records,dog,name);
      else if(form==='cycle'&&dog)await saveHeatCycle(records,dog.id,date,cycle);
      setForm(null);setNotice('Saved.');await refresh();
    }catch(e:any){setError(e.message||'Unable to save.');if(e.code==='EDIT_CONFLICT')try{await refresh();}catch{}}
    finally{setBusy(false);lock.current=false;}
  }
  return <View style={s.section}>
    <Text style={s.eyebrow}>R2GD · HEAT CYCLES</Text><Text style={s.title}>Know what’s coming.</Text>
    <Text style={s.body}>Track detected heats and estimate the next one six calendar months later. Actual cycles can vary.</Text>
    <PhoneReminders/>
    {!!(error||syncError)&&<Text accessibilityRole="alert" style={s.error}>{error||syncError}</Text>}
    {!!notice&&<Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    <View style={s.row}><Action label="+ Track a dog" disabled={busy||!!syncError} onPress={()=>open('dog')}/><Action label="Refresh heat cycles" disabled={busy} onPress={()=>void refresh().catch(()=>{})}/></View>
    {form&&<View style={s.card}>
      <Text style={s.subtitle}>{form==='dog'?'Track a female dog':form==='name'?'Edit dog name':cycle?`Correct heat date for ${dog?.name}`:`Record new heat for ${dog?.name}`}</Text>
      {form!=='cycle'&&<><Text style={s.label}>Dog name</Text><TextInput accessibilityLabel="Dog name" style={s.input} value={name} onChangeText={setName} placeholder="e.g. Willow"/></>}
      {form!=='name'&&<DateField label="Detected heat date" value={date} onChange={setDate} disabled={busy}/>}
      <View style={s.row}><Action label={busy?'Saving…':'Save heat record'} disabled={busy} onPress={()=>void save()}/><Action label="Cancel heat edit" disabled={busy} onPress={()=>{setForm(null);setError('');}}/></View>
    </View>}
    {loading?<ActivityIndicator accessibilityLabel="Loading heat cycles"/>:!records.dogs.length&&!syncError?<View style={s.card}><Text style={s.subtitle}>Start with her last detected heat</Text><Text style={s.body}>Add her name and the date you noticed her heat. Future detected dates build her history.</Text></View>:null}
    {[...records.dogs].sort((a,b)=>a.name.localeCompare(b.name)).map(item=>{
      const history=heatHistory(records,item.id);const latest=history[0];const forecast=latest?reminderDates(latest.detected):null;
      return <View style={s.card} key={item.id}>
        <Text style={s.subtitle}>{item.name}</Text>
        {forecast&&<><Text style={s.body}>Last detected: {formatDate(latest.detected)}</Text><Text style={s.estimate}>Estimated next heat: {formatDate(forecast.expected)}</Text>
          <Text style={s.body}>{forecast.expected<today()?'Estimate passed. Record the next heat when you detect it.':'Estimated from the most recent detected date.'}</Text>
          <Text style={s.small}>Reminder dates: {formatDate(forecast.month)} · {formatDate(forecast.week)} · {formatDate(forecast.day)}</Text></>}
        <View style={s.row}><Action label={`Record heat for ${item.name}`} disabled={busy} onPress={()=>open('cycle',item)}/><Action label={`Edit name for ${item.name}`} disabled={busy} onPress={()=>open('name',item)}/></View>
        <Action label={expanded[item.id]?`Hide heat history for ${item.name}`:`View heat history for ${item.name} (${history.length})`} disabled={busy} onPress={()=>setExpanded(value=>({...value,[item.id]:!value[item.id]}))}/>
        {expanded[item.id]&&history.map(entry=><View style={s.history} key={entry.id}><Text style={s.body}>{formatDate(entry.detected)}</Text><Action label={`Edit heat for ${item.name} on ${formatDate(entry.detected)}`} disabled={busy} onPress={()=>open('cycle',item,entry)}/></View>)}
      </View>;
    })}
  </View>;
}
const s=StyleSheet.create({section:{gap:16},eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:2,color:'#6f826a'},title:{fontSize:32,fontWeight:'700',color:'#244c40'},body:{fontSize:15,color:'#59695f',lineHeight:23},small:{fontSize:13,color:'#69766e',lineHeight:20},subtitle:{fontSize:22,fontWeight:'600',color:'#244c40'},card:{padding:20,gap:12,borderWidth:1,borderColor:'#e0e5da',borderRadius:18,backgroundColor:'#fffefb'},row:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{backgroundColor:'#e7ecdf',paddingVertical:12,paddingHorizontal:14,minHeight:46,borderRadius:10,justifyContent:'center',alignSelf:'flex-start'},buttonText:{fontSize:14,fontWeight:'600',color:'#244c40'},estimate:{fontSize:19,fontWeight:'600',color:'#285845'},input:{borderWidth:1,borderColor:'#cbd6c6',borderRadius:10,padding:14,minHeight:48,fontSize:16,color:'#244c40',backgroundColor:'#fff'},label:{fontSize:13,fontWeight:'600',color:'#3d5648'},error:{padding:14,borderRadius:10,color:'#8e302b',backgroundColor:'#fce9e3'},history:{borderTopWidth:1,borderColor:'#edf0e7',paddingTop:12,gap:8}});
