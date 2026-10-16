import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNursery } from './src/useNursery';
import DateField from './src/DateField';
import { formatDate, displayWeight, history, today, weightToGrams, weightInput, type WeightUnit, type Litter, type Puppy, type Weight } from './src/domain';
import { addLitter, addPuppy, saveWeight, updateLitter, updatePuppy, updateWeight, supabase } from './src/storage';

function Button({label,onPress,secondary=false,disabled=false,accessibilityLabel,expanded}:{expanded?:boolean;accessibilityLabel?:string;label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{disabled,expanded}} aria-expanded={expanded} disabled={disabled} onPress={onPress} style={[s.button,secondary && s.secondary,disabled && {opacity:.45}]}><Text style={[s.buttonText,secondary && {color:'#244c40'}]}>{label}</Text></Pressable>;
}
function Field({label,value,onChangeText,placeholder,secure=false,numeric=false}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder?:string;secure?:boolean;numeric?:boolean}) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#7b8580" secureTextEntry={secure} keyboardType={numeric?'decimal-pad':'default'} autoCapitalize="none" autoCorrect={false}/></View>;
}
export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><NurseryApp/></SafeAreaProvider>;
}
function NurseryApp() {
  const {records,session,authReady,hasAccess,loading,connection,syncError,refresh,connect}=useNursery();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [expandedHistories,setExpandedHistories] = useState<Record<string,boolean>>({});
  const [selected,setSelected] = useState<string|null>(null);
  const [form,setForm] = useState<'litter'|'puppy'|'weight'|null>(null);
  const [editingVersion,setEditingVersion] = useState<number|undefined>(undefined);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [weightUnit,setWeightUnit] = useState<WeightUnit>('oz');
  const scroll = useRef<ScrollView>(null);
  const [puppyId,setPuppyId] = useState<string|null>(null);
  const [pounds,setPounds] = useState('');
  const [originalWeight,setOriginalWeight] = useState<Weight|null>(null);
  const [weightDirty,setWeightDirty] = useState(false);
  const [name,setName] = useState(''); const [mother,setMother] = useState(''); const [father,setFather] = useState('');
  const [date,setDate] = useState(today()); const [weight,setWeight] = useState('');
  const [accessCode,setAccessCode] = useState('');
  const lock = useRef(false);
  const litter = records.litters.find(l => l.id === selected);
  const puppies = records.puppies.filter(p => p.litterId === selected);
  const puppy = records.puppies.find(p => p.id === puppyId);

  useEffect(()=>{setSelected(null);setForm(null);setError('');},[session?.user.id]);

  useEffect(()=>{setExpandedHistories({});},[selected,session?.user.id]);

  async function run(action:()=>Promise<void>) {
    if(lock.current) return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try {await action();} catch(e:any) {
      setError(e.message || 'Unable to save. Please try again.');
      if(e.code==='EDIT_CONFLICT')try{await refresh();}catch{}
    }
    finally {lock.current=false;setBusy(false);}
  }
  function open(kind:'litter'|'puppy'|'weight',id?:string) {
    setEditingId(null);setEditingVersion(undefined);setWeightUnit('oz');setPounds('');setOriginalWeight(null);setWeightDirty(false);
    setForm(kind);setName('');setMother('');setFather('');setDate(today());setWeight('');setError('');setNotice('');setPuppyId(id ?? null);
    requestAnimationFrame(()=>scroll.current?.scrollTo({y:0,animated:true}));
  }
  function editLitter(item: Litter) {
    open('litter');setEditingVersion(item.version);setEditingId(item.id);setName(item.name);setMother(item.mother);setFather(item.father);setDate(item.born);
  }
  function editPuppy(item: Puppy) {
    open('puppy',item.id);setEditingVersion(item.version);setEditingId(item.id);setName(item.name);
  }
  function editWeight(item: Weight) {
    open('weight',item.puppyId);setEditingVersion(item.version);setEditingId(item.id);setDate(item.date);
    setOriginalWeight(item);setWeightDirty(false);
    const next=weightInput(item.grams,'oz');setWeight(next.ounces);
  }
  function changeWeightUnit(next: WeightUnit) {
    if(next===weightUnit) return;
    if(weight.trim() || pounds.trim()) {
      try {
        const grams=originalWeight && !weightDirty ? originalWeight.grams : weightToGrams(weight,weightUnit==='lb'?pounds:undefined);
        const fields=weightInput(grams,next);setWeight(fields.ounces);setPounds(fields.pounds);
      } catch(e:any) {setError(e.message);return;}
    } else setPounds('');
    setError('');setWeightUnit(next);
  }
  async function submit() {
    await run(async () => {
      if(form==='litter') {
        const values={name,mother,father,born:date};
        if(editingId) await updateLitter(records,{...values,id:editingId,version:editingVersion});
        else await addLitter(records,values);
      } else if(form==='puppy' && litter) {
        const values={litterId:litter.id,name};
        if(editingId) await updatePuppy(records,{...values,id:editingId,version:editingVersion});
        else await addPuppy(records,values);
      } else if(form==='weight' && puppy && litter) {
        const values={puppyId:puppy.id,date,grams:originalWeight && !weightDirty ? originalWeight.grams : weightToGrams(weight,weightUnit==='lb'?pounds:undefined)};
        if(editingId) await updateWeight(records,{...values,id:editingId,version:editingVersion});
        else await saveWeight(records,values);
      } else throw new Error('Choose a litter and puppy first.');
      // Close before refreshing so a failed refresh cannot invite a duplicate submission.
      setForm(null);setNotice('Saved.');await refresh();
    });
  }
  const authenticated = !supabase || hasAccess;
  return <SafeAreaView style={s.safe}><StatusBar style="dark"/><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView ref={scroll} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <View style={s.header}><View><Text style={s.brand}>myKennel <Text style={{color:'#769484'}}> / </Text> Nursery</Text><Text style={s.small}>A little care. Every day.</Text></View>{session && <Button label="Leave kennel" secondary disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.signOut();if(error)throw error;setAccessCode('');})}/>}</View>
    {!supabase && <View style={s.banner}><Text style={s.bannerTitle}>LOCAL PREVIEW</Text><Text style={s.body}>Saved only on this device. This preview has no staff login or shared backup. Connect Supabase before entering real kennel records.</Text></View>}
    {!!(error || syncError) && <View accessibilityRole="alert" style={s.error}><Text style={{color:'#8e302b'}}>{error || syncError}</Text></View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.success}>{notice}</Text>}
    {!authReady || (supabase && !!session && loading && !hasAccess) ? <ActivityIndicator accessibilityLabel="Connecting to kennel"/> : !authenticated ? <View style={s.card}>
      <Text style={s.title}>Your shared kennel</Text><Text style={s.body}>Enter the same kennel code on each device. No personal account or password is needed. This device will remember its connection.</Text>
      <Field label="Kennel code" value={accessCode} onChangeText={setAccessCode} secure/>
      <Button label={busy?'Connecting…':'Connect to kennel'} disabled={busy} onPress={()=>void run(async()=>{await connect(accessCode);setAccessCode('');})}/>
      <Button label="Retry connection" secondary disabled={busy} onPress={()=>void run(refresh)}/>
    </View> : <>
      {!!supabase && <Text accessibilityLiveRegion="polite" style={s.small}>{connection==='live'?'Live updates connected':connection==='connecting'?'Connecting live updates…':'Reconnecting live updates… Checking for changes automatically.'}{syncError?' Data may be out of date.':''}</Text>}

      <View style={s.heading}><View style={{flex:1}}><Text style={s.eyebrow}>THE NURSERY</Text><Text style={s.title}>{litter ? litter.name : 'Growing, together.'}</Text><Text style={s.body}>{litter ? `${litter.mother} × ${litter.father} · Born ${formatDate(litter.born)}` : 'Keep every litter and every little milestone in one place.'}</Text></View></View>
      <View style={s.toolbar}>{litter ? <Button label="← All litters" secondary disabled={busy} onPress={()=>{setSelected(null);setForm(null);setError('');}}/> : <Button label="+ Add litter" disabled={busy} onPress={()=>open('litter')}/>}<Button label="Refresh" secondary disabled={busy || loading} onPress={()=>void run(refresh)}/>{litter && <><Button label="Edit litter" secondary disabled={busy} onPress={()=>editLitter(litter)}/><Button label="+ Add puppy" disabled={busy} onPress={()=>open('puppy')}/></>}</View>
      {form && <View style={s.card}><Text style={s.subtitle}>{editingId ? (form==='litter'?'Edit litter':form==='puppy'?'Edit puppy':`Edit weight for ${puppy?.name ?? 'puppy'}`) : (form==='litter'?'New litter':form==='puppy'?'Meet the new arrival':`Weigh ${puppy?.name ?? 'puppy'}`)}</Text>
        {form!=='weight' && <Field label={form==='litter'?'Litter name':'Puppy name or identifier'} placeholder={form==='litter'?'e.g. Willow’s spring litter':'e.g. Blue collar or Daisy'} value={name} onChangeText={setName}/>}
        {form==='litter' && <><Field label="Mother (dam)" value={mother} onChangeText={setMother} placeholder="Mother’s name"/><Field label="Father (sire)" value={father} onChangeText={setFather} placeholder="Father’s name"/></>}
        {form!=='puppy' && <DateField key={`${form}-${editingId ?? 'new'}`} label={form==='litter'?'Birth date':'Weigh-in date'} value={date} onChange={setDate} minimum={form==='weight'?litter?.born:undefined} disabled={busy}/>}
        {form==='weight' && <>
          <View style={s.toolbar}>
            <Button label="Ounces (oz)" secondary={weightUnit!=='oz'} disabled={busy} onPress={()=>changeWeightUnit('oz')}/>
            <Button label="Pounds + ounces" secondary={weightUnit!=='lb'} disabled={busy} onPress={()=>changeWeightUnit('lb')}/>
          </View>
          {weightUnit==='lb' && <Field label="Pounds (lb)" value={pounds} onChangeText={value=>{setPounds(value);setWeightDirty(true);}} placeholder="e.g. 1" numeric/>}
          <Field label={weightUnit==='lb'?'Remaining ounces (oz)':'Weight (oz)'} value={weight} onChangeText={value=>{setWeight(value);setWeightDirty(true);}} placeholder={weightUnit==='lb'?'e.g. 14.34':'e.g. 18.00'} numeric/>
          <Text style={s.small}>{weightUnit==='lb'?'Enter whole pounds and 0–15.99 ounces.':'Enter total ounces, with up to two decimal places.'} Recorded weights automatically show pounds and ounces from 16 oz.</Text>
          <Text style={s.small}>One entry per puppy per day. Editing corrects the selected entry.</Text>
        </>}

        <View style={s.toolbar}><Button label={busy?'Saving…':editingId?'Save changes':'Save'} disabled={busy} onPress={()=>void submit()}/><Button label="Cancel" secondary disabled={busy} onPress={()=>setForm(null)}/></View>
      </View>}
      {loading ? <ActivityIndicator accessibilityLabel="Loading nursery"/> : !litter ? <>
        <View style={s.stats}><View><Text style={s.stat}>{records.litters.length}</Text><Text style={s.small}>Litters</Text></View><View><Text style={s.stat}>{records.puppies.length}</Text><Text style={s.small}>Puppies</Text></View><View><Text style={s.stat}>{records.weights.filter(w=>w.date===today()).length}</Text><Text style={s.small}>Weighed today</Text></View></View>
        {!records.litters.length && <View style={s.empty}><Text style={s.subtitle}>Room for your first litter</Text><Text style={s.body}>Add the parents and birth date, then give each puppy a name or collar identifier.</Text></View>}
        {[...records.litters].sort((a,b)=>b.born.localeCompare(a.born)).map(l=><Pressable accessibilityRole="button" accessibilityLabel={`Open ${l.name}`} key={l.id} style={s.card} onPress={()=>{setSelected(l.id);setForm(null);}}><Text style={s.eyebrow}>BORN {formatDate(l.born)}</Text><Text style={s.subtitle}>{l.name}  →</Text><Text style={s.body}>{l.mother} × {l.father}</Text><Text style={s.small}>{records.puppies.filter(p=>p.litterId===l.id).length} puppies</Text></Pressable>)}
      </> : <>
        <View style={s.toolbar}><Text style={s.eyebrow}>PUPPIES · {puppies.length}</Text></View>
        {!puppies.length && <View style={s.empty}><Text style={s.subtitle}>Who’s in the litter?</Text><Text style={s.body}>Add each puppy by name or collar identifier to start tracking daily weights.</Text></View>}
        {puppies.map(p=>{const entries=history(records,p.id);const latest=entries[0];const expanded=!!expandedHistories[p.id];const visibleEntries=expanded?entries:entries.slice(0,3);return <View style={s.card} key={p.id}><View style={s.heading}><View style={{flexGrow:1,flexBasis:180}}><Text style={s.subtitle}>{p.name}</Text><Text style={s.small}>{entries.some(w=>w.date===today())?'✓ Weighed today':'No weight logged today'}</Text></View><Button label="Edit puppy" accessibilityLabel={`Edit ${p.name}`} secondary disabled={busy} onPress={()=>editPuppy(p)}/><Button label="+ Weight" disabled={busy} onPress={()=>open('weight',p.id)}/></View>{latest && <Text style={s.latest}>{displayWeight(latest.grams)} <Text style={s.small}>on {formatDate(latest.date)}</Text></Text>}{!entries.length && <Text style={s.body}>The first weigh-in starts their story.</Text>}{visibleEntries.map((w,i)=>{const previous=entries[i+1];const change=previous?w.grams-previous.grams:null;return <View key={w.id} style={s.history}><Text style={s.body}>{formatDate(w.date)}</Text><Text style={s.historyWeight}>{displayWeight(w.grams)}</Text><Text style={[s.delta,{color:change!==null&&change<0?'#a33c31':'#547864'}]}>{change===null?'First entry':`${change!>0?'+':''}${displayWeight(change!)}`}</Text><Button label="Edit" accessibilityLabel={`Edit weight for ${p.name} on ${formatDate(w.date)}`} secondary disabled={busy} onPress={()=>editWeight(w)}/></View>;})}{entries.length>1 && <Text style={s.small}>Change is from the previous recorded weigh-in.</Text>}{entries.length>3 && <Button label={expanded?'Show recent 3':`View all weights (${entries.length})`} accessibilityLabel={expanded?`Show recent 3 weights for ${p.name}`:`View all weights for ${p.name}`} expanded={expanded} secondary disabled={busy} onPress={()=>setExpandedHistories(current=>({...current,[p.id]:!current[p.id]}))}/>}</View>;})}
      </>}
    </>}
    <Text style={s.footer}>myKennel · Made for the everyday care that matters.</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f6f5ef'},page:{padding:24,paddingTop:24,maxWidth:850,width:'100%',alignSelf:'center',gap:20,paddingBottom:60},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',paddingBottom:16,borderBottomWidth:1,borderColor:'#dce2d8'},brand:{fontSize:23,fontWeight:'700',color:'#244c40'},small:{fontSize:13,color:'#69766e',lineHeight:20},banner:{backgroundColor:'#e9eee0',padding:16,borderRadius:12,gap:5},bannerTitle:{fontSize:11,fontWeight:'800',letterSpacing:2,color:'#526347'},body:{fontSize:15,color:'#59695f',lineHeight:23},title:{fontSize:34,fontWeight:'700',color:'#244c40',letterSpacing:-1,marginVertical:8},eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:2,color:'#6f826a'},subtitle:{fontSize:21,fontWeight:'600',color:'#244c40',marginBottom:6},heading:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},toolbar:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},button:{backgroundColor:'#285845',borderRadius:10,paddingVertical:13,paddingHorizontal:18,alignItems:'center',minHeight:46},secondary:{backgroundColor:'#e7ecdf'},buttonText:{fontSize:14,color:'#fff',fontWeight:'600'},card:{backgroundColor:'#fffefb',borderWidth:1,borderColor:'#e0e5da',borderRadius:18,padding:22,gap:10},field:{gap:7,marginVertical:5},label:{fontSize:13,fontWeight:'600',color:'#3d5648'},input:{borderWidth:1,borderColor:'#cbd6c6',borderRadius:10,padding:14,fontSize:16,color:'#244c40',backgroundColor:'#fff',minHeight:48},stats:{flexDirection:'row',justifyContent:'space-around',paddingVertical:18,backgroundColor:'#e9eee3',borderRadius:16},stat:{fontSize:30,fontWeight:'600',color:'#285845'},empty:{padding:30,borderWidth:1,borderStyle:'dashed',borderColor:'#c3cebb',borderRadius:18,gap:8},error:{padding:16,backgroundColor:'#fce9e3',borderRadius:12},success:{color:'#285845',fontWeight:'600'},latest:{fontSize:26,color:'#285845',fontWeight:'600',marginVertical:8},history:{flexDirection:'row',gap:10,flexWrap:'wrap',borderTopWidth:1,borderColor:'#edf0e7',paddingTop:12,alignItems:'center'},historyWeight:{fontSize:15,fontWeight:'600',color:'#244c40',flex:1,minWidth:80,textAlign:'right'},delta:{fontSize:12,minWidth:75,textAlign:'right'},footer:{fontSize:12,color:'#7e8a7f',textAlign:'center',marginTop:20},
});
