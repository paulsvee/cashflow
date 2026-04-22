"use client";
/* Paulsvee To do — v5 Dream (체크해도 패널에 남음, 공유 카테고리) */

import React, { useEffect, useRef, useState } from "react";
import { loadCategories, saveCategories, createCategory, type Category } from "@/store/categoryStore";
import TopNav from "@/components/TopNav";

const STORAGE_KEY   = "paulsvee_todo_carousel_dream_v2";


const uid = () => globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
const clampText = (s: string) => s.replace(/\s+/g," ").trim();
const formatStamp = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};
const extractPanelSum = (items: TodoItem[]): number | null => {
  let total=0,found=false;
  for(const item of items){ const m=item.text.match(/:\s*([\d,]+)\s*$/); if(m){const n=parseInt(m[1].replace(/,/g,""),10);if(!isNaN(n)){total+=item.done?-n:n;found=true;}} }
  return found?total:null;
};
const formatNumber = (n: number) => n.toLocaleString("ko-KR");

type TodoItem = { id:string;text:string;done:boolean;createdAt:number; };
type Panel = { id:string;title:string;color:string;createdAt:number;items:TodoItem[];categoryId?:string|null;isSpecial?:boolean;bgImage?:string|null; };
type AppState = { version:2;appTitle:string;motto:string;activeCategoryId:string;panels:Panel[]; };

const seedState = (): AppState => ({
  version:2,appTitle:"꿈 목록",motto:"",activeCategoryId:"all",
  panels:[{ id:uid(),title:"꿈",color:"#f0d05a",createdAt:Date.now(),categoryId:null,
    items:[{id:uid(),text:"꿈 항목 예시",done:false,createdAt:Date.now()}] }],
});

function safeParseState(raw: string|null): AppState|null {
  if(!raw) return null;
  try {
    const data=JSON.parse(raw); if(!data||typeof data!=="object") return null;
    const appTitle=typeof data.appTitle==="string"?data.appTitle:"꿈 목록";
    const motto=typeof data.motto==="string"?data.motto:"";
    const activeCategoryId=typeof data.activeCategoryId==="string"?data.activeCategoryId:"all";
    const panels:Panel[]=Array.isArray(data.panels)?data.panels.map((p:any):Panel|null=>{
      if(!p) return null;
      const items:TodoItem[]=Array.isArray(p.items)?p.items.map((t:any)=>t?({
        id:typeof t.id==="string"?t.id:uid(),text:typeof t.text==="string"?t.text:"",
        done:!!t.done,createdAt:typeof t.createdAt==="number"?t.createdAt:Date.now()
      }):null).filter(Boolean) as TodoItem[]:[];
      return {
        id:typeof p.id==="string"?p.id:uid(),title:typeof p.title==="string"?p.title:"패널",
        color:typeof p.color==="string"?p.color:"#7c98ff",createdAt:typeof p.createdAt==="number"?p.createdAt:Date.now(),
        categoryId:typeof p.categoryId==="string"?p.categoryId:null,
        isSpecial:!!p.isSpecial,bgImage:typeof p.bgImage==="string"?p.bgImage:null,items
      };
    }).filter(Boolean) as Panel[]:[];
    return {version:2,appTitle,motto,activeCategoryId,panels};
  } catch { return null; }
}

function useDebouncedSave(state: AppState){
  const latest=useRef(state); latest.current=state;
  useEffect(()=>{
    const t=window.setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(latest.current));}catch{}},220);
    return()=>window.clearTimeout(t);
  },[state]);
}

// ── CategoryModal (간소) ──
function CategoryModal({onConfirm,onCancel}:{onConfirm:(n:string)=>void;onCancel:()=>void}){
  const [val,setVal]=useState(""); const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{ref.current?.focus();},[]);
  return(
    <div onClick={(e)=>{if(e.target===e.currentTarget)onCancel();}} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={(e)=>e.stopPropagation()} style={{background:"#14151c",border:"1px solid rgba(255,255,255,0.14)",borderRadius:16,padding:"22px 22px 18px",minWidth:280}}>
        <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.88)",marginBottom:14}}>새 카테고리</div>
        <input ref={ref} value={val} onChange={(e)=>setVal(e.target.value)} placeholder="카테고리 이름" maxLength={40}
          onKeyDown={(e)=>{if(e.key==="Enter"&&val.trim())onConfirm(val.trim());if(e.key==="Escape")onCancel();}}
          style={{width:"100%",padding:"9px 12px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,color:"rgba(255,255,255,0.88)",fontSize:13,outline:"none"}}/>
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={{padding:"7px 14px",borderRadius:7,border:"1px solid rgba(255,255,255,0.14)",background:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:12}}>취소</button>
          <button onClick={()=>val.trim()&&onConfirm(val.trim())} disabled={!val.trim()}
            style={{padding:"7px 14px",borderRadius:7,border:"none",background:val.trim()?"rgba(124,152,255,0.85)":"rgba(255,255,255,0.08)",color:val.trim()?"#fff":"rgba(255,255,255,0.30)",cursor:val.trim()?"pointer":"default",fontSize:12,fontWeight:700}}>만들기</button>
        </div>
      </div>
    </div>
  );
}

// ── PanelDotsMenu ──
function PanelDotsMenu({panel,categories,onSetCategory,onDelete,onClose}:{panel:Panel;categories:Category[];onSetCategory:(id:string|null)=>void;onDelete:()=>void;onClose:()=>void}){
  return(
    <div className="panelMenuDim" onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="panelMenuBox" onClick={(e)=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span className="panelMenuTitle">패널 옵션</span>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.40)",fontSize:20,lineHeight:1,padding:"2px 6px"}}>×</button>
        </div>
        {categories.length>0&&(<>
          <div className="panelMenuTitle" style={{marginTop:4}}>카테고리 분류</div>
          <div className="panelMenuCategories">
            <button className={`panelMenuCatBtn${!panel.categoryId?" selected":""}`} onClick={()=>{onSetCategory(null);onClose();}}>전체</button>
            {categories.map((cat)=>(
              <button key={cat.id} className={`panelMenuCatBtn${panel.categoryId===cat.id?" selected":""}`} onClick={()=>{onSetCategory(cat.id);onClose();}}>{cat.name}</button>
            ))}
          </div>
          <div className="panelMenuDivider"/>
        </>)}
        <button className="panelMenuDeleteBtn" onClick={()=>{onDelete();onClose();}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3h6m-8 4h10m-9 0l1 14h6l1-14M10 11v7m4-7v7M5 7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          패널 삭제
        </button>
      </div>
    </div>
  );
}

// ── Sidebar ──
function Sidebar({categories,activeCategoryId,panelCount,sidebarOpen,onSelectCategory,onCreateCategory,onDeleteCategory,onRenameCategory,onClose}:{
  categories:Category[];activeCategoryId:string;panelCount:(id:string)=>number;sidebarOpen:boolean;
  onSelectCategory:(id:string)=>void;onCreateCategory:(name:string)=>void;onDeleteCategory:(id:string)=>void;onRenameCategory:(id:string,name:string)=>void;onClose:()=>void;
}){
  const [showCreate,setShowCreate]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editVal,setEditVal]=useState("");
  return(
    <>
      {sidebarOpen&&<div className="sidebarDim" onClick={onClose}/>}
      <div className={`sidebar${sidebarOpen?" open":""}`}>
        <button className={`sidebarItem${activeCategoryId==="all"?" active":""}`} onClick={()=>{onSelectCategory("all");onClose();}}>
          <span style={{fontSize:14,color:activeCategoryId==="all"?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.30)"}}>·</span>
          <span style={{flex:1}}>All</span>
          <span className="sidebarCount">{panelCount("all")}</span>
        </button>
        {categories.length>0&&<div className="sidebarDivider"/>}
        {categories.map((cat)=>{
          const isActive=activeCategoryId===cat.id;
          if(editingId===cat.id) return(
            <input key={cat.id} value={editVal} autoFocus onChange={(e)=>setEditVal(e.target.value)}
              onBlur={()=>{if(editVal.trim()&&editVal.trim()!==cat.name)onRenameCategory(cat.id,editVal.trim());setEditingId(null);}}
              onKeyDown={(e)=>{if(e.key==="Enter"){if(editVal.trim())onRenameCategory(cat.id,editVal.trim());setEditingId(null);}if(e.key==="Escape")setEditingId(null);}}
              style={{width:"100%",padding:"7px 10px",margin:"1px 0",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.20)",borderRadius:8,color:"rgba(255,255,255,0.88)",fontSize:13,outline:"none"}}/>
          );
          return(
            /* ✅ FIX: <button> 안에 <button> 불가 → 외부를 <div>로 변경 */
            <div key={cat.id} className={`sidebarItem${isActive?" active":""}`} role="button" tabIndex={0}
              onClick={()=>{onSelectCategory(cat.id);onClose();}}
              onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){onSelectCategory(cat.id);onClose();}}}
              onDoubleClick={(e)=>{e.stopPropagation();setEditVal(cat.name);setEditingId(cat.id);}}>
              <span style={{fontSize:14,color:isActive?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.30)"}}>·</span>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat.name}</span>
              {panelCount(cat.id)>0&&<span className="sidebarCount">{panelCount(cat.id)}</span>}
              <button className="sidebarDelBtn" onClick={(e)=>{e.stopPropagation();onDeleteCategory(cat.id);}}
                onMouseEnter={(e)=>(e.currentTarget.style.color="#ff6b6b")} onMouseLeave={(e)=>(e.currentTarget.style.color="")}>✕</button>
            </div>
          );
        })}
        <button className="sidebarAddBtn" onClick={()=>setShowCreate(true)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          카테고리 추가
        </button>
      </div>
      {showCreate&&<CategoryModal onConfirm={(name)=>{onCreateCategory(name);setShowCreate(false);}} onCancel={()=>setShowCreate(false)}/>}
    </>
  );
}

function TodoComposer({onAdd}:{onAdd:(text:string)=>void}){
  const [v,setV]=useState("");
  return(
    <div className="composer">
      <input className="todoInput" value={v} placeholder="할 일 입력 후 Enter"
        onChange={(e)=>setV(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"){onAdd(v);setV("");}}}/>
      <button className="secondaryBtn" onClick={()=>{onAdd(v);setV("");}}>추가</button>
    </div>
  );
}

type UndoEntry = AppState;
const MAX_UNDO = 20;

export default function DreamPage(){
  const [hydrated,setHydrated]=useState(false);
  const [state,setState]=useState<AppState>(()=>seedState());
  const [categories,setCategories]=useState<Category[]>([]);
  const [undo,setUndo]=useState<UndoEntry[]>([]);
  const [toast,setToast]=useState<string|null>(null);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [dotsMenuPanelId,setDotsMenuPanelId]=useState<string|null>(null);

  const specialInputRefs=useRef<Record<string,HTMLInputElement|null>>({});
  const dragPanelId=useRef<string|null>(null);
  const dragItem=useRef<{panelId:string;itemId:string}|null>(null);
  const [dropHint,setDropHint]=useState<{panelId:string;beforeItemId:string|null}|null>(null);

  useEffect(()=>{
    const loaded=safeParseState(localStorage.getItem(STORAGE_KEY));
    if(loaded)setState(loaded);
    setCategories(loadCategories("dream"));
    setHydrated(true);
  },[]);

  useDebouncedSave(state);

  const showToast=(msg:string,ms=1200)=>{setToast(msg);window.setTimeout(()=>setToast(null),ms);};
  const pushUndo=(next:AppState)=>{setUndo((prev)=>[state,...prev].slice(0,MAX_UNDO));setState(next);};
  const doUndo=()=>{ setUndo((prev)=>{ if(!prev.length)return prev; const[top,...rest]=prev; setState(top); showToast("되돌림 완료",900); return rest; }); };

  const updateCategories=(next:Category[])=>{ setCategories(next); saveCategories(next,"dream"); };
  const addCategory=(name:string)=>{ updateCategories([...categories,createCategory(name)]); showToast("카테고리 추가됨"); };
  const deleteCategory=(id:string)=>{ updateCategories(categories.filter((c)=>c.id!==id)); pushUndo({...state,panels:state.panels.map((p)=>p.categoryId===id?{...p,categoryId:null}:p),activeCategoryId:state.activeCategoryId===id?"all":state.activeCategoryId}); };
  const renameCategory=(id:string,name:string)=>updateCategories(categories.map((c)=>c.id===id?{...c,name}:c));
  const setActiveCategory=(id:string)=>pushUndo({...state,activeCategoryId:id});

  const panels=state.panels;
  const addPanel=()=>{ const cid=state.activeCategoryId==="all"?null:state.activeCategoryId; pushUndo({...state,panels:[...panels,{id:uid(),title:"P",color:"#7c98ff",createdAt:Date.now(),items:[],categoryId:cid}]}); };
  const addSpecialPanel=()=>{ const cid=state.activeCategoryId==="all"?null:state.activeCategoryId; pushUndo({...state,panels:[...panels,{id:uid(),title:"Special",color:"#7c98ff",createdAt:Date.now(),items:[],isSpecial:true,bgImage:null,categoryId:cid}]}); showToast("스페셜 패널 추가됨"); };
  const deletePanel=(id:string)=>{ pushUndo({...state,panels:panels.filter((p)=>p.id!==id)}); showToast("패널 삭제됨 (되돌림 가능)",1400); };
  const setPanelCategory=(id:string,catId:string|null)=>pushUndo({...state,panels:panels.map((p)=>p.id===id?{...p,categoryId:catId}:p)});
  const setPanelColor=(id:string,color:string)=>pushUndo({...state,panels:panels.map((p)=>p.id===id?{...p,color}:p)});
  const renamePanel=(id:string,title:string)=>pushUndo({...state,panels:panels.map((p)=>p.id===id?{...p,title}:p)});
  const setPanelBgImage=(id:string,dataUrl:string|null)=>pushUndo({...state,panels:panels.map((p)=>p.id===id?{...p,isSpecial:true,bgImage:dataUrl}:p)});
  const onPickPanelImage=(panelId:string,file:File|null)=>{
    if(!file)return; const reader=new FileReader();
    reader.onload=()=>{ const d=typeof reader.result==="string"?reader.result:null; if(d){setPanelBgImage(panelId,d);showToast("배경 이미지 설정됨");} };
    reader.readAsDataURL(file);
  };
  const clearPanelImage=(panelId:string)=>{ setPanelBgImage(panelId,null); const el=specialInputRefs.current[panelId]; if(el)el.value=""; showToast("배경 이미지 제거됨"); };

  const addItem=(panelId:string,text:string)=>{ const t=clampText(text); if(!t)return; pushUndo({...state,panels:panels.map((p)=>p.id===panelId?{...p,items:[{id:uid(),text:t,done:false,createdAt:Date.now()},...p.items]}:p)}); };
  const updateItemText=(panelId:string,itemId:string,text:string)=>pushUndo({...state,panels:panels.map((p)=>p.id===panelId?{...p,items:p.items.map((it)=>it.id===itemId?{...it,text}:it)}:p)});
  // Dream: 체크해도 패널에 남음 — done 토글만
  const toggleItem=(panelId:string,itemId:string)=>{ const p=panels.find((x)=>x.id===panelId); const it=p?.items.find((x)=>x.id===itemId); if(!p||!it)return; const nd=!it.done; pushUndo({...state,panels:panels.map((px)=>px.id===panelId?{...px,items:px.items.map((x)=>x.id===itemId?{...x,done:nd}:x)}:px)}); showToast(nd?"이룸 표시 ✓":"이룸 해제",900); };
  const deleteItem=(panelId:string,itemId:string)=>{ pushUndo({...state,panels:panels.map((p)=>p.id===panelId?{...p,items:p.items.filter((it)=>it.id!==itemId)}:p)}); showToast("항목 삭제됨 (되돌림 가능)",1400); };

  const onPanelDragStart=(id:string)=>{dragPanelId.current=id;};
  const onPanelDrop=(targetId:string)=>{ const fromId=dragPanelId.current; dragPanelId.current=null; if(!fromId||fromId===targetId)return; const fi=panels.findIndex((p)=>p.id===fromId),ti=panels.findIndex((p)=>p.id===targetId); if(fi<0||ti<0)return; const next=[...panels];const[m]=next.splice(fi,1);next.splice(ti,0,m); pushUndo({...state,panels:next}); };
  const reorderItem=(panelId:string,itemId:string,beforeItemId:string|null)=>{ const p=panels.find((x)=>x.id===panelId); if(!p)return; const fi=p.items.findIndex((x)=>x.id===itemId); if(fi<0)return; const items=[...p.items];const[m]=items.splice(fi,1); let ti=beforeItemId?items.findIndex((x)=>x.id===beforeItemId):items.length; if(ti<0)ti=items.length; items.splice(ti,0,m); pushUndo({...state,panels:panels.map((x)=>x.id===panelId?{...x,items}:x)}); };
  const onItemDragStart=(panelId:string,itemId:string)=>{dragItem.current={panelId,itemId};};
  const onItemDragOver=(panelId:string,beforeItemId:string|null)=>{ const cur=dragItem.current; if(!cur||cur.panelId!==panelId)return; setDropHint({panelId,beforeItemId}); };
  const onItemDrop=(panelId:string,beforeItemId:string|null)=>{ const cur=dragItem.current; dragItem.current=null; setDropHint(null); if(!cur||cur.panelId!==panelId)return; reorderItem(panelId,cur.itemId,beforeItemId); };
  const onItemDragEnd=()=>{dragItem.current=null;setDropHint(null);};

  const visiblePanels=state.activeCategoryId==="all"?panels:panels.filter((p)=>p.categoryId===state.activeCategoryId);
  const panelCount=(id:string)=>id==="all"?panels.length:panels.filter((p)=>p.categoryId===id).length;
  const dotsPanel=dotsMenuPanelId?panels.find((p)=>p.id===dotsMenuPanelId)??null:null;

  if(!hydrated) return(
    <main className="app"><div className="topbar"><div className="titleBlock"><div className="skeletonTitle"/><div className="skeletonSub"/></div></div></main>
  );

  return(
    <main className="app">
      <TopNav current="dream" titleValue={state.appTitle} mottoValue={state.motto}
        onChangeTitle={(v)=>pushUndo({...state,appTitle:v})} onChangeMotto={(v)=>pushUndo({...state,motto:v})}
        sidebarToggle={
          <button className="hamburgerBtn" onClick={()=>setSidebarOpen((o)=>!o)} aria-label="메뉴">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        }>
        <button className="iconBtn" onClick={doUndo} disabled={undo.length===0} title="되돌림">↶</button>
        <button className="primaryBtn" onClick={addPanel}>P</button>
        <button className="primaryBtn" onClick={addSpecialPanel}>S</button>
      </TopNav>

      <div className="appBody">
        <Sidebar categories={categories} activeCategoryId={state.activeCategoryId} panelCount={panelCount} sidebarOpen={sidebarOpen}
          onSelectCategory={(id)=>{setActiveCategory(id);setSidebarOpen(false);}} onCreateCategory={addCategory}
          onDeleteCategory={deleteCategory} onRenameCategory={renameCategory} onClose={()=>setSidebarOpen(false)}/>

        <div className="mainContent">
          <section className="panelRow" aria-label="Panels">
            {visiblePanels.map((p)=>{
              const catName=p.categoryId?categories.find((c)=>c.id===p.categoryId)?.name??null:null;
              return(
                <article key={p.id} className="panel"
                  style={{["--panel" as any]:p.color,...(p.bgImage?{backgroundImage:`linear-gradient(180deg,rgba(0,0,0,0.62),rgba(0,0,0,0.62)),url(${p.bgImage})`,backgroundSize:"cover",backgroundPosition:"center",backgroundRepeat:"no-repeat"}:{})}}
                  onDragOver={(e)=>e.preventDefault()} onDrop={()=>onPanelDrop(p.id)}>
                  <header className="panelHeader">
                    <div className="panelTitleWrap">
                      <span className="dot"/>
                      <div style={{minWidth:0}}>
                        <input className="panelTitle" value={p.title} onChange={(e)=>renamePanel(p.id,e.target.value)}/>
                        {catName&&<div className="panelCatBadge" style={{marginTop:2}}>{catName}</div>}
                      </div>
                    </div>
                    <div className="panelRight">
                      <button className="grabBtn" draggable onDragStart={()=>onPanelDragStart(p.id)} title="패널 이동">⠿</button>
                      <label className="colorPill" title="패널 색상">
                        <input type="color" className="colorInput" value={p.color} onChange={(e)=>setPanelColor(p.id,e.target.value)}/>
                      </label>
                      <button className="dotsBtn" onClick={()=>setDotsMenuPanelId(p.id)} title="패널 옵션">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <circle cx="5" cy="12" r="1.8" fill="currentColor"/>
                          <circle cx="12" cy="12" r="1.8" fill="currentColor"/>
                          <circle cx="19" cy="12" r="1.8" fill="currentColor"/>
                        </svg>
                      </button>
                    </div>
                  </header>

                  <div className="panelTools">
                    {p.isSpecial&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <label className="secondaryBtn" style={{height:34,padding:"0 14px",borderRadius:999,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,cursor:"pointer"}}>
                          img
                          <input type="file" accept="image/*" style={{display:"none"}} ref={(el)=>{specialInputRefs.current[p.id]=el;}} onChange={(e)=>onPickPanelImage(p.id,e.currentTarget.files?.[0]??null)}/>
                        </label>
                        {p.bgImage&&<button className="dangerBtn" onClick={()=>clearPanelImage(p.id)} style={{width:34,height:34}}>×</button>}
                      </div>
                    )}
                    <TodoComposer onAdd={(t)=>addItem(p.id,t)}/>
                  </div>

                  <ul className="list">
                    {p.items.map((it)=>{
                      const hintHere=dropHint?.panelId===p.id&&dropHint?.beforeItemId===it.id;
                      return(
                        <React.Fragment key={it.id}>
                          {hintHere&&<div className="dropLine"/>}
                          <li className={`item${it.done?" done":""}`} draggable
                            onDragStart={()=>onItemDragStart(p.id,it.id)}
                            onDragOver={(e)=>{e.preventDefault();onItemDragOver(p.id,it.id);}}
                            onDrop={()=>onItemDrop(p.id,it.id)} onDragEnd={onItemDragEnd}>
                            <button className="itemGrab" title="드래그">⋮⋮</button>
                            <input className="chk" type="checkbox" checked={it.done} onChange={()=>toggleItem(p.id,it.id)} style={it.done?{accentColor:"#7c98ff"}:{}}/>
                            <div className="itemMain">
                              <input className={`itemText${it.done?" done":""}`} value={it.text} onChange={(e)=>updateItemText(p.id,it.id,e.target.value)}/>
                            </div>
                            <div className="itemMeta">{formatStamp(it.createdAt)}</div>
                            <button className="xBtn" onClick={()=>deleteItem(p.id,it.id)}>×</button>
                          </li>
                        </React.Fragment>
                      );
                    })}
                    {dropHint?.panelId===p.id&&dropHint?.beforeItemId===null&&<div className="dropLine"/>}
                    <li className="endDropZone" onDragOver={(e)=>{e.preventDefault();onItemDragOver(p.id,null);}} onDrop={()=>onItemDrop(p.id,null)}/>
                  </ul>

                  {p.isSpecial&&(()=>{ const sum=extractPanelSum(p.items); if(sum===null)return null; return<div className="sumBar"><span className="sumLabel">합계</span><span className="sumValue">{formatNumber(sum)}</span></div>; })()}
                </article>
              );
            })}
          </section>
        </div>
      </div>

      {dotsPanel&&<PanelDotsMenu panel={dotsPanel} categories={categories} onSetCategory={(catId)=>setPanelCategory(dotsPanel.id,catId)} onDelete={()=>deletePanel(dotsPanel.id)} onClose={()=>setDotsMenuPanelId(null)}/>}
      {toast&&<div className="toast">{toast}</div>}
    </main>
  );
}
