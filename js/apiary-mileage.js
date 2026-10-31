// Owner-only mileage tracking. No mileage data is public.
export function setupMileageLog({supabase}) {
  const $ = id => document.getElementById(id);
  const section = $('mileageSection');
  if (!section) return;
  section.innerHTML = `
    <h3>Mileage Log</h3>
    <p class="muted">Record business trips, including round trips. Enter total business miles once; do not enter the same return journey twice. Personal miles are excluded.</p>
    <div class="two-col">
      <div><label for="mileageDate">Trip date</label><input type="date" id="mileageDate"></div>
      <div><label for="mileagePurpose">Business purpose</label><input id="mileagePurpose" placeholder="Pick up bee supplies"></div>
      <div><label for="mileageFrom">Starting location</label><input id="mileageFrom" placeholder="Home apiary"></div>
      <div><label for="mileageTo">Destination / route</label><input id="mileageTo" placeholder="Supplier, then home"></div>
      <div><label for="mileageStart">Starting odometer (optional)</label><input id="mileageStart" type="number" min="0" step="0.1"></div>
      <div><label for="mileageEnd">Ending odometer (optional)</label><input id="mileageEnd" type="number" min="0" step="0.1"></div>
      <div><label for="mileageMiles">Total business miles</label><input id="mileageMiles" type="number" min="0.1" max="10000" step="0.1"></div>
    </div>
    <label for="mileageNotes">Notes / stops (optional)</label><textarea id="mileageNotes" placeholder="Round trip, any personal detours excluded"></textarea>
    <p class="muted">If both odometer readings are entered, total miles fills automatically. Adjust total business miles when the trip included personal driving.</p>
    <div class="toolbar"><button type="button" id="mileageSave">Save Mileage</button><button type="button" id="mileageCancel" class="secondary" hidden>Cancel Edit</button></div>
    <p id="mileageMessage" role="status" aria-live="polite"></p>
    <h4>Yearly Mileage Summary</h4>
    <label for="mileageYear">View year</label><select id="mileageYear"><option value="all">All years</option></select>
    <div id="mileageTotal" class="profile-overview" aria-live="polite">Loading…</div>
    <button type="button" id="mileageExport" class="secondary">Export Mileage (CSV)</button>
    <h4>Trip History</h4><div id="mileageHistory"></div>`;
  let rows=[], editing=null, busy=false;
  const fields=['mileageDate','mileagePurpose','mileageFrom','mileageTo','mileageStart','mileageEnd','mileageMiles','mileageNotes'];
  const localToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  $('mileageDate').value=localToday();
  function autoMiles(){
    const a=$('mileageStart').value,b=$('mileageEnd').value;
    if(a!==''&&b!==''&&Number(b)>=Number(a))
      $('mileageMiles').value=(Number(b)-Number(a)).toFixed(1);
  }
  $('mileageStart').addEventListener('change',autoMiles);
  $('mileageEnd').addEventListener('change',autoMiles);
  function reset(){
    editing=null; fields.forEach(id=>$(id).value='');
    $('mileageDate').value=localToday();
    $('mileageSave').textContent='Save Mileage';
    $('mileageCancel').hidden=true;
  }
  $('mileageCancel').addEventListener('click',()=>{reset();$('mileageMessage').textContent='Edit canceled.';});
  async function getUser(){
    const {data,error}=await supabase.auth.getUser();
    if(error||!data?.user)throw Error('Please sign in again.');
    return data.user;
  }
  async function refresh(){
    const msg=$('mileageMessage');
    try {
      const user=await getUser();
      const all=[];
      for(let offset=0;offset<100000;offset+=500){
        const {data,error}=await supabase.from('Apiary_Mileage').select('*').eq('user_id',user.id).order('trip_date',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
        if(error)throw error;
        all.push(...(data||[]));
        if((data||[]).length<500)break;
      }
      rows=all;
      const years=[...new Set(rows.map(r=>r.trip_date.slice(0,4)))].sort().reverse();
      const prev=$('mileageYear').value;
      $('mileageYear').replaceChildren(new Option('All years','all'),...years.map(y=>new Option(y,y)));
      $('mileageYear').value=years.includes(prev)?prev:'all';
      render();
      msg.textContent='Mileage history updated.';
    }catch(e){msg.textContent='Mileage could not load: '+e.message;$('mileageHistory').textContent='History unavailable.';}
  }
  function filtered(){return rows.filter(r=>$('mileageYear').value==='all'||r.trip_date.startsWith($('mileageYear').value+'-'));}
  function render(){
    const selected=filtered(), total=selected.reduce((n,r)=>n+Number(r.business_miles),0);
    $('mileageTotal').textContent=selected.length+' trip(s) · '+total.toFixed(1)+' business miles. Tax deductions are not calculated here.';
    const host=$('mileageHistory');host.replaceChildren();
    if(!selected.length){host.textContent='No mileage trips recorded for this period.';return;}
    for(const r of selected){
      const card=document.createElement('div');card.className='record';
      const title=document.createElement('strong');title.textContent=r.trip_date+' · '+Number(r.business_miles).toFixed(1)+' miles · '+r.purpose;
      const route=document.createElement('small');route.textContent=r.origin+' → '+r.destination;
      card.append(title,route);
      if(r.start_odometer!=null&&r.end_odometer!=null){const od=document.createElement('small');od.textContent='Odometer: '+r.start_odometer+' to '+r.end_odometer;card.append(od);}
      if(r.notes){const note=document.createElement('small');note.textContent='Notes: '+r.notes;card.append(note);}
      const actions=document.createElement('div');actions.className='record-actions';
      const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.className='secondary';
      edit.addEventListener('click',()=>{
        editing=r.id;
        const vals={mileageDate:r.trip_date,mileagePurpose:r.purpose,mileageFrom:r.origin,mileageTo:r.destination,mileageStart:r.start_odometer,mileageEnd:r.end_odometer,mileageMiles:r.business_miles,mileageNotes:r.notes};
        Object.entries(vals).forEach(([id,v])=>$(id).value=v??'');
        $('mileageSave').textContent='Save Changes';$('mileageCancel').hidden=false;
        $('mileageMessage').textContent='Editing saved trip.';
        $('mileageSave').scrollIntoView({behavior:'smooth',block:'center'});
      });
      const del=document.createElement('button');del.type='button';del.textContent='Delete';del.className='secondary';
      del.addEventListener('click',async()=>{
        if(busy||!confirm('Permanently delete this mileage trip?'))return;
        busy=true;
        try{const user=await getUser();const {data,error}=await supabase.from('Apiary_Mileage').delete().eq('id',r.id).eq('user_id',user.id).select('id');if(error)throw error;if(!data?.length)throw Error('No trip deleted.');if(editing===r.id)reset();await refresh();$('mileageMessage').textContent='Mileage trip deleted.';}
        catch(e){$('mileageMessage').textContent='Deletion failed: '+e.message;}finally{busy=false;}
      });
      actions.append(edit,del);card.append(actions);host.append(card);
    }
  }
  $('mileageYear').addEventListener('change',render);
  $('mileageSave').addEventListener('click',async()=>{
    if(busy)return;
    const miles=Number($('mileageMiles').value),start=$('mileageStart').value,end=$('mileageEnd').value;
    if(!$('mileageDate').value||!$('mileagePurpose').value.trim()||!$('mileageFrom').value.trim()||!$('mileageTo').value.trim()||!$('mileageMiles').value||!Number.isFinite(miles)||miles<=0||miles>10000){$('mileageMessage').textContent='Enter date, purpose, start, route, and positive business miles (up to 10,000).';return;}
    if((start==='')!==(end==='')){$('mileageMessage').textContent='Enter both odometer readings or leave both blank.';return;}
    if(start!==''&&(Number(end)<Number(start)||miles>Number(end)-Number(start)+0.05)){$('mileageMessage').textContent='Check odometer readings. Business miles cannot exceed the trip distance.';return;}
    const payload={trip_date:$('mileageDate').value,purpose:$('mileagePurpose').value.trim(),origin:$('mileageFrom').value.trim(),destination:$('mileageTo').value.trim(),start_odometer:start===''?null:Number(start),end_odometer:end===''?null:Number(end),business_miles:miles,notes:$('mileageNotes').value.trim()||null};
    busy=true;$('mileageSave').disabled=true;$('mileageMessage').textContent='Saving…';
    try{
      const user=await getUser();let result;
      if(editing!==null)result=await supabase.from('Apiary_Mileage').update(payload).eq('id',editing).eq('user_id',user.id).select('id');
      else result=await supabase.from('Apiary_Mileage').insert({...payload,user_id:user.id}).select('id');
      if(result.error)throw result.error;
      if(!result.data?.length)throw Error('Save was not confirmed.');
      reset();await refresh();$('mileageMessage').textContent='Mileage saved successfully.';
    }catch(e){$('mileageMessage').textContent='Save failed: '+e.message;}
    finally{busy=false;$('mileageSave').disabled=false;}
  });
  $('mileageExport').addEventListener('click',()=>{
    const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const data=[['Date','From','Destination / route','Business purpose','Starting odometer','Ending odometer','Business miles','Notes'],...filtered().map(r=>[r.trip_date,r.origin,r.destination,r.purpose,r.start_odometer,r.end_odometer,r.business_miles,r.notes])];
    const csv=data.map(line=>line.map(quote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='tricks-bees-mileage-'+$('mileageYear').value+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return {refresh};
}