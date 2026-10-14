// Colony split follow-up dashboard. Does not create or delete splits.
export function setupSplitFollowups({supabase,make,tile,formatDate,dayDifference,localToday,getHives,getSelectedHiveId,loadManagement}) {
  const $=id=>document.getElementById(id);
  let request=0;
  const refresh=async()=>{
    const token=++request;
    const message=$("splitDashboardMessage"),summary=$("splitDashboardSummary");
    const pendingHost=$("splitDashboardPending"),doneHost=$("splitDashboardCompleted");
    if(!message||!summary||!pendingHost||!doneHost)return;
    message.textContent="Loading split follow-ups...";
    const {data,error}=await supabase.from("Hive_Splits").select("*").order("split_date",{ascending:false});
    if(token!==request)return;
    summary.replaceChildren();pendingHost.replaceChildren();doneHost.replaceChildren();
    if(error){
      message.textContent="Unable to load split follow-ups: "+error.message;
      pendingHost.textContent="Split follow-ups unavailable.";doneHost.textContent="Split follow-ups unavailable.";
      return;
    }
    const records=data||[],pending=records.filter(r=>!r.follow_up_completed),completed=records.filter(r=>r.follow_up_completed);
    const scheduled=pending.filter(r=>r.follow_up_date).sort((a,b)=>a.follow_up_date.localeCompare(b.follow_up_date));
    const unscheduled=pending.filter(r=>!r.follow_up_date);
    const overdue=scheduled.filter(r=>dayDifference(r.follow_up_date)<0).length;
    const soon=scheduled.filter(r=>{const d=dayDifference(r.follow_up_date);return d>=0&&d<=7;}).length;
    summary.append(tile("Recorded splits",records.length),tile("Overdue split follow-ups",overdue),tile("Due within 7 days",soon),tile("No follow-up date",unscheduled.length));
    const names=new Map(getHives().map(h=>[String(h.id),`Hive ${h.hive_number}: ${h.hive_name||"Unnamed"}`]));
    const label=id=>id?names.get(String(id))||"Hive ID "+id:"Unassigned";
    if(!pending.length)pendingHost.append(make("p","No pending split follow-ups."));
    for(const r of [...scheduled,...unscheduled]){
      const days=r.follow_up_date?dayDifference(r.follow_up_date):null;
      const status=days===null?"No follow-up date":days<0?`${Math.abs(days)} day(s) overdue`:days===0?"Due today":`Due in ${days} day(s)`;
      const card=make("div",undefined,"reminder "+(days!==null&&days<0?"overdue":days!==null&&days<=7?"soon":""));
      card.append(make("strong",`${label(r.hive_id)} → ${label(r.daughter_hive_id)} · ${status}`));
      card.append(make("small",`Split: ${formatDate(r.split_date)} · Follow-up due: ${formatDate(r.follow_up_date)}`));
      const form=make("div",undefined,"followup-complete-form");
      const dateLabel=make("label","Completed on"),date=document.createElement("input");
      date.type="date";date.value=localToday();dateLabel.append(date);
      const notesLabel=make("label","Follow-up results (optional)"),notes=document.createElement("textarea");
      notes.rows=2;notes.placeholder="Queen laying, eggs, brood, stores...";notesLabel.append(notes);
      const button=make("button","Mark Split Follow-Up Completed");button.type="button";
      const feedback=make("p","","section-status");feedback.setAttribute("role","status");
      button.addEventListener("click",async()=>{
        if(!date.value||date.value<r.split_date||date.value>localToday()){
          feedback.textContent="Completion date must be on or after the split and cannot be in the future.";return;
        }
        button.disabled=true;feedback.textContent="Saving completion...";
        try{
          const {data:updated,error:updateError}=await supabase.from("Hive_Splits")
            .update({follow_up_completed:true,follow_up_completed_date:date.value,follow_up_notes:notes.value.trim()||null})
            .eq("id",r.id).eq("hive_id",r.hive_id).select("id");
          if(updateError)throw updateError;
          if(!updated?.length)throw new Error("No record updated. Check database permissions.");
          await refresh();
          if(String(getSelectedHiveId())===String(r.hive_id))await loadManagement(r.hive_id);
        }catch(err){feedback.textContent="Unable to complete follow-up: "+err.message;button.disabled=false;}
      });
      form.append(dateLabel,notesLabel,button,feedback);card.append(form);pendingHost.append(card);
    }
    completed.sort((a,b)=>(b.follow_up_completed_date||"").localeCompare(a.follow_up_completed_date||""));
    if(!completed.length)doneHost.append(make("p","No completed split follow-ups yet."));
    for(const r of completed.slice(0,15)){
      const card=make("div",undefined,"reminder");
      card.append(make("strong",`${label(r.hive_id)} → ${label(r.daughter_hive_id)} · Completed ${formatDate(r.follow_up_completed_date)}`));
      card.append(make("small",`Split: ${formatDate(r.split_date)} · Due: ${formatDate(r.follow_up_date)}`));
      if(r.follow_up_notes)card.append(make("small","Results: "+r.follow_up_notes));
      doneHost.append(card);
    }
    message.textContent=`Updated ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}. Edit a split from its parent hive to reopen a completed follow-up.`;
  };
  $("refreshSplitDashboard")?.addEventListener("click",refresh);
  return refresh;
}
