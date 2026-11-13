import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { Btn } from '../../../src/components/shared/Btn';
import { Dialog, Menu, MessageBar, Popover, Segmented, Select, SplitButton, Tooltip } from '../../../src/components/shared/Controls';
import { ToastProvider, useToast } from '../../../src/stores/toast-store';
function Harness() {
 const [value,setValue]=useState('rows'); const [open,setOpen]=useState(false); const {show}=useToast();
 return <main style={{padding:24,display:'grid',gap:16,alignContent:'start',overflow:'auto',height:'100vh'}}><h1>Shared controls</h1><div style={{display:'flex',gap:8}}><Btn>Neutral</Btn><Btn variant="chip" tone="marker" active>Marker</Btn><Btn variant="slate" active>Armed</Btn><Btn variant="solid">Confirm</Btn><Btn variant="secondary">Secondary</Btn><Btn variant="solid" danger>Delete</Btn></div>
 <Segmented label="Layout" value={value} onChange={setValue} options={[{value:'rows',label:'Rows'},{value:'columns',label:'Columns'},{value:'grid',label:'Grid',disabled:true,reason:'Needs four panes'}]}/>
 <div style={{display:'flex',gap:8}}><Select aria-label="Trace"><option>Auto</option></Select><Tooltip text="Requires a trace"><Btn disabled>Fit</Btn></Tooltip><Menu label="Actions" items={[{label:'Open',onSelect:()=>{}},{label:'Export',onSelect:()=>{},disabled:true,reason:'No data'}]}/><SplitButton label="New" onClick={()=>{}} items={[{label:'Delta',onSelect:()=>{}}]}/><Menu label="Long menu" items={Array.from({length: 80}, (_,i) => ({label:`Item ${i}`,onSelect:()=>{}}))}/><Popover label="Settings">Popover content</Popover></div>
 <MessageBar status="warning">The action needs a trace.</MessageBar><div><Btn onClick={()=>setOpen(true)}>Open dialog</Btn> <Btn onClick={()=>show({message:'Opened 2 files',undo:()=>{}})}>Show toast</Btn> <Btn onClick={()=>show({message:'Could not open file',kind:'error'})}>Show error</Btn></div><Dialog open={open} title="Replace workspace?" confirmLabel="Replace" onConfirm={()=>setOpen(false)} onClose={()=>setOpen(false)} secondary={{label:'Save first',onClick:()=>{}}}><p>Unsaved changes will be replaced.</p></Dialog></main>;
}
const root=document.getElementById('root'); if(root) createRoot(root).render(<ToastProvider><Harness/></ToastProvider>);
