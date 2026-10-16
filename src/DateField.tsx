import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDate, today, validDate } from './domain';

const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function iso(year: number, month: number, day: number) {
  return `${String(year).padStart(4,'0')}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
type Props = {label:string;value:string;onChange:(date:string)=>void;minimum?:string;maximum?:string;disabled?:boolean};
export default function DateField({label,value,onChange,minimum='1900-01-01',maximum=today(),disabled=false}:Props) {
  const [open,setOpen]=useState(false);
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${formatDate(value)}`} disabled={disabled} onPress={()=>setOpen(true)} style={s.input}>
      <Text style={s.value}>{formatDate(value)}</Text><Text style={s.action}>Choose date</Text>
    </Pressable>
    {open && <Calendar label={label} value={value} minimum={minimum} maximum={maximum} onCancel={()=>setOpen(false)} onSelect={date=>{onChange(date);setOpen(false);}}/>}
  </View>;
}
function Calendar({label,value,minimum,maximum,onSelect,onCancel}:{label:string;value:string;minimum:string;maximum:string;onSelect:(date:string)=>void;onCancel:()=>void}) {
  const initial=validDate(value) ? value : today();
  const [year,setYear]=useState(Number(initial.slice(0,4)));
  const [month,setMonth]=useState(Number(initial.slice(5,7))-1);
  const [mode,setMode]=useState<'days'|'months'|'years'>('days');
  const [yearStart,setYearStart]=useState(Math.floor(year/12)*12);
  const minYear=Number(minimum.slice(0,4)); const maxYear=Number(maximum.slice(0,4));
  const first=iso(year,month,1);
  const last=iso(year,month,new Date(year,month+1,0).getDate());
  function moveMonth(offset:number) {
    const next=new Date(year,month+offset,1,12);setYear(next.getFullYear());setMonth(next.getMonth());
  }
  function chooseYear(next:number) {
    setYear(next);
    // Keep the displayed month within the allowed range after changing years.
    const low=next===minYear?Number(minimum.slice(5,7))-1:0;
    const high=next===maxYear?Number(maximum.slice(5,7))-1:11;
    setMonth(Math.max(low,Math.min(high,month)));setMode('months');
  }
  function choice(text:string,name:string,onPress:()=>void,disabled=false,selected=false,grid=false) {
    return <Pressable key={name} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={[grid?s.cell:s.control,selected && s.selected,disabled && s.disabled]}><Text style={[s.text,selected && s.selectedText]}>{text}</Text></Pressable>;
  }
  return <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
    <View style={s.overlay}><ScrollView style={s.calendar} contentContainerStyle={s.calendarContent} accessibilityViewIsModal>
      <Text style={s.title}>{label}</Text><Text style={s.hint}>Select a day. Tap the month or year to jump.</Text>
      <View style={s.navigation}>
        {choice('‹',mode==='years'?'Previous years':'Previous month',()=>mode==='years'?setYearStart(yearStart-12):moveMonth(-1),mode==='years'?yearStart<=minYear:mode==='months'||first<=minimum)}
        {choice(months[month],'Choose month',()=>setMode(mode==='months'?'days':'months'))}
        {choice(String(year),'Choose year',()=>{setYearStart(Math.floor(year/12)*12);setMode(mode==='years'?'days':'years');})}
        {choice('›',mode==='years'?'Next years':'Next month',()=>mode==='years'?setYearStart(yearStart+12):moveMonth(1),mode==='years'?yearStart+11>=maxYear:mode==='months'||last>=maximum)}
      </View>
      {mode==='years' ? <View style={s.options}>{Array.from({length:12},(_,i)=>yearStart+i).map(y=><View key={y} style={s.option}>{choice(String(y),`Year ${y}`,()=>chooseYear(y),y<minYear||y>maxYear,y===year)}</View>)}</View> : mode==='months' ? <View style={s.options}>{months.map((name,m)=><View key={name} style={s.option}>{choice(name,`Month ${name}`,()=>{setMonth(m);setMode('days');},iso(year,m,31)<minimum||iso(year,m,1)>maximum,m===month)}</View>)}</View> : <>
        <View style={s.week}>{['SU','MO','TU','WE','TH','FR','SA'].map(d=><Text key={d} style={s.weekday}>{d}</Text>)}</View>
        <View style={s.days}>
          {Array.from({length:new Date(year,month,1,12).getDay()},(_,i)=><View key={`blank-${i}`} style={s.cell}/>)}
          {Array.from({length:new Date(year,month+1,0).getDate()},(_,i)=>{const date=iso(year,month,i+1);return choice(String(i+1),`Select ${formatDate(date)}`,()=>onSelect(date),date<minimum||date>maximum,date===value,true);})}
        </View>
      </>}
      <Pressable accessibilityRole="button" onPress={onCancel} style={s.cancel}><Text style={s.text}>Cancel date selection</Text></Pressable>
    </ScrollView></View>
  </Modal>;
}
const s=StyleSheet.create({
  field:{gap:7,marginVertical:5},label:{fontSize:13,fontWeight:'600',color:'#3d5648'},input:{borderWidth:1,borderColor:'#cbd6c6',borderRadius:10,padding:14,minHeight:48,backgroundColor:'#fff',flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},value:{fontSize:16,color:'#244c40'},action:{fontSize:13,color:'#547864'},overlay:{flex:1,backgroundColor:'rgba(20,42,31,0.4)',justifyContent:'center',alignItems:'center',padding:16},calendar:{backgroundColor:'#fffefb',borderRadius:20,width:'100%',maxWidth:400,maxHeight:'100%',flexGrow:0,flexShrink:1},calendarContent:{padding:16,gap:14},title:{fontSize:22,fontWeight:'600',color:'#244c40'},hint:{fontSize:13,color:'#69766e'},navigation:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4},control:{minWidth:46,minHeight:46,paddingHorizontal:10,alignItems:'center',justifyContent:'center',backgroundColor:'#e7ecdf',borderRadius:8},text:{fontSize:15,fontWeight:'600',color:'#244c40'},week:{flexDirection:'row'},weekday:{width:'14.285714%',textAlign:'center',fontSize:11,fontWeight:'700',color:'#69766e'},days:{flexDirection:'row',flexWrap:'wrap'},cell:{width:'14.285714%',height:46,alignItems:'center',justifyContent:'center',borderRadius:8},selected:{backgroundColor:'#285845'},selectedText:{color:'#fff'},disabled:{opacity:.25},options:{flexDirection:'row',flexWrap:'wrap',gap:8},option:{width:'30%',flexGrow:1},cancel:{alignItems:'center',justifyContent:'center',minHeight:46,borderRadius:8,backgroundColor:'#e7ecdf'},
});
