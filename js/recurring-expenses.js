// Review-first recurring expenses. Schedules are reminders; only the confirmed RPC posts an expense.
export function setupRecurringExpenses({supabase,expenseSection,categorySource,paymentSource,getHives,uploadReceipts,receiptFiles,refreshExpenses}){
  const panel=document.createElement("section");
  panel.id="recurringExpensesSection";panel.className="management";
  panel.innerHTML='<h4>Recurring expenses</h4><p class="muted">Schedule reminders for monthly, quarterly or annual bills. Nothing is recorded as an expense without your confirmation.</p><p id="recurringMessage" class="status" role="status" aria-live="polite"></p><h4 id="recurringFormHeading">Add recurring payment</h4><div class="two-col"><div><label for="recurringDescription">Description</label><input id="recurringDescription" maxlength="240" placeholder="Website hosting"></div><div><label for="recurringCategory">Category</label><select id="recurringCategory"></select></div><div><label for="recurringVendor">Vendor</label><input id="recurringVendor" maxlength="200"></div><div><label for="recurringAmount">Expected amount ($)</label><input id="recurringAmount" type="number" min="0" step="0.01"></div><div><label for="recurringFrequency">Frequency</label><select id="recurringFrequency"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></div><div><label for="recurringDue">Next due date</label><input id="recurringDue" type="date"></div><div><label for="recurringPaymentMethod">Payment method</label><select id="recurringPaymentMethod"></select></div><div><label for="recurringHive">Hive (optional)</label><select id="recurringHive"></select></div></div><label for="recurringNotes">Notes</label><textarea id="recurringNotes" maxlength="2000"></textarea><p id="recurringLockedHint" class="muted" hidden>To change the frequency or billing date, pause this schedule and create a new one.</p><button type="button" id="saveRecurring">Save recurring payment</button><button type="button" class="secondary" id="cancelRecurringEdit" hidden>Cancel edit</button><h4>Scheduled payments</h4><div id="recurringList">Sign in to view schedules.</div><section id="recurringReview" hidden><h4>Review payment</h4><p id="recurringReviewDetails"></p><div class="two-col"><div><label for="recurringPaidDate">Payment date</label><input id="recurringPaidDate" type="date"></div><div><label for="recurringPaidAmount">Actual amount ($)</label><input id="recurringPaidAmount" type="number" min="0" step="0.01"></div></div><label for="recurringFiles">Receipt (optional)</label><input id="recurringFiles" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"><p class="muted">The payment only enters your financial history after you confirm. If a receipt upload fails, use Expense History to attach it rather than posting the payment twice.</p><button type="button" id="recordRecurring">Record confirmed payment</button><button type="button" class="secondary" id="cancelRecurringReview">Cancel review</button></section>';
  expenseSection.insertBefore(panel,expenseSection.querySelector("#expenseTotals")?.previousElementSibling||null);
  const $=id=>panel.querySelector("#"+id),info=s=>{$("recurringMessage").textContent=s;};
  let schedules=[],editId=null,review=null;
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
  const validDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const[y,m,d]=s.split("-").map(Number);const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()+1===m&&date.getUTCDate()===d;};
  const validAmount=s=>/^\d+(?:\.\d{1,2})?$/.test(s)&&Number.isFinite(Number(s))&&Number(s)<=9999999999.99;
  const money=v=>"$"+Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  function options(){
    const prev={category:$("recurringCategory").value,payment:$("recurringPaymentMethod").value,hive:$("recurringHive").value};
    const categories=Array.from(categorySource.options).filter(o=>o.value);
    $("recurringCategory").replaceChildren(new Option("Choose category",""),...categories.map(o=>new Option(o.text,o.value)));
    $("recurringCategory").value=prev.category||"Web Hosting & Subscriptions";
    $("recurringPaymentMethod").replaceChildren(...Array.from(paymentSource.options).map(o=>new Option(o.text,o.value)));
    $("recurringPaymentMethod").value=prev.payment||"";
    $("recurringHive").replaceChildren(new Option("Entire apiary / Shared expense",""),...getHives().map(h=>new Option("Hive "+h.hive_number+": "+(h.hive_name||"Unnamed"),String(h.id))));
    $("recurringHive").value=[...$("recurringHive").options].some(o=>o.value===prev.hive)?prev.hive:"";
  }
  function reset(){
    editId=null;options();
    for(const k of ["recurringDescription","recurringVendor","recurringAmount","recurringNotes"])$(k).value="";
    $("recurringDue").value=today();$("recurringFrequency").value="monthly";
    $("recurringDue").disabled=$("recurringFrequency").disabled=false;
    $("recurringLockedHint").hidden=true;
    $("recurringFormHeading").textContent="Add recurring payment";
    $("saveRecurring").textContent="Save recurring payment";
    $("cancelRecurringEdit").hidden=true;
  }
  function edit(r){
    reset();editId=r.id;
    const vals={recurringDescription:r.description,recurringVendor:r.vendor,recurringAmount:r.amount,recurringNotes:r.notes,recurringCategory:r.category,recurringPaymentMethod:r.payment_method,recurringHive:r.hive_id,recurringDue:r.next_due_date,recurringFrequency:r.frequency};
    for(const [id,v]of Object.entries(vals))$(id).value=v==null?"":String(v);
    $("recurringDue").disabled=$("recurringFrequency").disabled=true;
    $("recurringLockedHint").hidden=false;
    $("recurringFormHeading").textContent="Edit recurring payment";
    $("saveRecurring").textContent="Save schedule changes";
    $("cancelRecurringEdit").hidden=false;
    $("recurringFormHeading").scrollIntoView({block:"center"});
  }
  function closeReview(){review=null;$("recurringReview").hidden=true;$("recurringFiles").value="";}
  function startReview(r){
    closeReview();
    review={id:r.id,due:r.next_due_date,name:r.description,amount:r.amount};
    $("recurringReviewDetails").textContent=r.description+" · due "+r.next_due_date+" · expected "+money(r.amount)+". No expense has been posted.";
    $("recurringPaidDate").value=today();$("recurringPaidAmount").value=Number(r.amount).toFixed(2);
    $("recurringReview").hidden=false;
    $("recurringReview").scrollIntoView({block:"center"});
    info("Review the actual payment date, amount and any receipt before confirming.");
  }
  function elt(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;return el;}
  function render(){
    const box=$("recurringList");box.replaceChildren();
    const active=schedules.filter(r=>r.active);
    box.append(elt("p",active.length+" active · "+active.filter(r=>r.next_due_date<=today()).length+" due/overdue. Unconfirmed bills are excluded from totals.","muted"));
    if(!schedules.length){box.append(elt("p","No recurring payments scheduled."));return;}
    for(const r of [...schedules].sort((a,b)=>a.next_due_date.localeCompare(b.next_due_date))){
      const card=elt("div",undefined,"record");
      card.append(elt("strong",r.description+" · "+money(r.amount)));
      const status=!r.active?"Paused":r.next_due_date<today()?"Overdue":r.next_due_date===today()?"Due today":"Upcoming";
      card.append(elt("small","Next due: "+r.next_due_date+" · "+r.frequency+" · "+status));
      card.append(elt("small","Category: "+r.category+(r.vendor?" · Vendor: "+r.vendor:"")));
      if(r.notes)card.append(elt("small","Notes: "+r.notes));
      const buttons=elt("div",undefined,"record-actions");
      const btn=(label,action,disabled=false)=>{const b=elt("button",label);b.type="button";b.disabled=disabled;b.addEventListener("click",action);buttons.append(b);return b;};
      btn("Review payment",()=>startReview(r),!r.active);
      btn("Edit schedule",()=>edit(r));
      const pause=btn(r.active?"Pause":"Resume",async()=>{
        if(!window.confirm((r.active?"Pause":"Resume")+' recurring payment "'+r.description+'"?'))return;
        pause.disabled=true;
        try{
          const{data:{user},error:authError}=await supabase.auth.getUser();
          if(authError||!user)throw new Error("Please sign in again.");
          const{data,error}=await supabase.from("Apiary_Recurring_Expenses").update({active:!r.active,updated_at:new Date().toISOString()}).eq("id",r.id).eq("user_id",user.id).select("id");
          if(error)throw error;if(!data?.length)throw new Error("Schedule not updated.");
          closeReview();await refresh();info("Schedule "+(r.active?"paused.":"resumed."));
        }catch(e){info("Schedule change failed: "+e.message);pause.disabled=false;}
      });pause.classList.add("secondary");
      card.append(buttons);box.append(card);
    }
  }
  async function refresh(){
    options();
    const{data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user){$("recurringList").textContent="Sign in to view recurring payments.";return;}
    const{data,error}=await supabase.from("Apiary_Recurring_Expenses").select("*").eq("user_id",user.id).order("next_due_date",{ascending:true});
    if(error){$("recurringList").textContent="Recurring expense database setup is not finished.";info("Recurring schedules unavailable: "+error.message);return;}
    schedules=data||[];render();
  }
  $("saveRecurring").addEventListener("click",async()=>{
    const description=$("recurringDescription").value.trim(),category=$("recurringCategory").value,amount=$("recurringAmount").value.trim();
    if(!description||!category||!validAmount(amount)||(!editId&&!validDate($("recurringDue").value))){info("Enter a description, category, valid amount and next due date.");return;}
    const save=$("saveRecurring");save.disabled=true;
    try{
      const{data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user)throw new Error("Please sign in again.");
      const payload={description,category,amount:Number(amount),vendor:$("recurringVendor").value.trim()||null,payment_method:$("recurringPaymentMethod").value||null,hive_id:$("recurringHive").value?Number($("recurringHive").value):null,notes:$("recurringNotes").value.trim()||null};
      const result=editId
        ? await supabase.from("Apiary_Recurring_Expenses").update({...payload,updated_at:new Date().toISOString()}).eq("id",editId).eq("user_id",user.id).select("id")
        : await supabase.from("Apiary_Recurring_Expenses").insert({...payload,user_id:user.id,frequency:$("recurringFrequency").value,anchor_date:$("recurringDue").value,next_due_date:$("recurringDue").value}).select("id");
      if(result.error)throw result.error;if(!result.data?.length)throw new Error("Save not confirmed.");
      reset();closeReview();await refresh();info("Schedule saved. No expense was recorded.");
    }catch(e){info("Could not save schedule: "+e.message);}
    finally{save.disabled=false;}
  });
  $("recordRecurring").addEventListener("click",async()=>{
    if(!review)return;
    const amount=$("recurringPaidAmount").value.trim(),paidDate=$("recurringPaidDate").value;
    if(!validAmount(amount)||!validDate(paidDate)){info("Enter a valid date and paid amount.");return;}
    let files;try{files=receiptFiles($("recurringFiles").files);}catch(e){info(e.message);return;}
    const pending={...review};
    if(!window.confirm("Record "+pending.name+" for "+money(amount)+" paid "+paidDate+" as a REAL expense?"))return;
    const button=$("recordRecurring");button.disabled=true;
    let id=null;
    try{
      const{data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user)throw new Error("Please sign in again.");
      const{data,error}=await supabase.rpc("record_recurring_expense",{p_template_id:pending.id,p_expected_due_date:pending.due,p_paid_date:paidDate,p_actual_amount:Number(amount)});
      if(error)throw error;if(!data)throw new Error("Payment record was not confirmed by the server.");
      id=data;closeReview();
      let receiptError=null;
      if(files.length)try{await uploadReceipts(files,id,user);}catch(e){receiptError=e;}
      let refreshError=null;
      try{await refreshExpenses();await refresh();}catch(e){refreshError=e;}
      info("Expense #"+id+" recorded after your confirmation. "+(receiptError?"Receipt upload FAILED: "+receiptError.message+". Attach it using Expense History, do not post the expense again.":files.length?"Receipt attached.":"No receipt attached.")+(refreshError?" Refresh the page to see updated history.":""));
    }catch(e){
      info(id?"Expense #"+id+" was recorded; do not retry. "+e.message:"Could not confirm the payment: "+e.message+". Refresh the schedules before trying again.");
    }finally{button.disabled=false;}
  });
  $("cancelRecurringReview").addEventListener("click",()=>{closeReview();info("Review cancelled. No expense recorded.");});
  $("cancelRecurringEdit").addEventListener("click",()=>{reset();info("Edit cancelled.");});
  reset();
  return{refresh};
}
