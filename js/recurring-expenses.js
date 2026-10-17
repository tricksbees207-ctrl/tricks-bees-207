// Automatic recurring expense register. The normal expense form creates the first record.
// A private database scheduler posts future records without reminders or manual review.
export function setupRecurringExpenses({supabase,expenseSection}){
  const panel=document.createElement("section");
  panel.id="recurringExpensesSection";
  panel.className="management";
  panel.innerHTML='<h4>Automatic Expenses</h4><p class="muted">Future expenses are recorded automatically on their scheduled date, without a reminder or confirmation. This does not charge any payment method. Original receipts are not copied to future records.</p><p id="recurringMessage" class="section-status" role="status" aria-live="polite"></p><div id="recurringList">Loading automatic schedules...</div>';
  expenseSection.append(panel);
  const list=panel.querySelector("#recurringList");
  const message=panel.querySelector("#recurringMessage");
  let schedules=[];
  const currency=amount=>"$"+Number(amount||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  function el(tag,content,className){
    const element=document.createElement(tag);
    if(content!==undefined)element.textContent=content;
    if(className)element.className=className;
    return element;
  }
  function render(){
    list.replaceChildren();
    if(!schedules.length){
      list.append(el("p","No automatic expense schedules yet. Check Repeat this expense when saving an expense."));
      return;
    }
    for(const s of schedules){
      const box=el("div",undefined,"record");
      box.append(el("strong",s.description+" · "+currency(s.amount)));
      box.append(el("small",s.frequency+" · Next: "+s.next_due_date+" · "+(s.active?"Automatic":"Paused")));
      if(s.vendor)box.append(el("small","Vendor: "+s.vendor));
      const buttons=el("div",undefined,"record-actions");
      const toggle=el("button",s.active?"Pause repetition":"Resume repetition");
      toggle.type="button";
      toggle.className="secondary";
      toggle.addEventListener("click",async()=>{
        if(!window.confirm((s.active?"Stop":"Resume")+" automatic future entries for "+s.description+"?"))return;
        toggle.disabled=true;
        try{
          const {data:{user},error:authError}=await supabase.auth.getUser();
          if(authError||!user)throw new Error("Please sign in.");
          const {data,error}=await supabase.from("Apiary_Recurring_Expenses")
            .update({active:!s.active,updated_at:new Date().toISOString()})
            .eq("id",s.id).eq("user_id",user.id).eq("automatic_posting",true).select("id");
          if(error||!data?.length)throw error||new Error("Schedule was not updated.");
          await refresh();
          message.textContent="Automatic repetition "+(s.active?"paused.":"resumed.");
        }catch(e){message.textContent="Could not change schedule: "+e.message;toggle.disabled=false;}
      });
      buttons.append(toggle);
      box.append(buttons);
      list.append(box);
    }
  }
  async function refresh(){
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user){list.textContent="Sign in to see your automatic expenses.";return;}
    const {data,error}=await supabase.from("Apiary_Recurring_Expenses")
      .select("*").eq("user_id",user.id).eq("automatic_posting",true)
      .order("next_due_date",{ascending:true});
    if(error){list.textContent="Automatic schedules unavailable: "+error.message;return;}
    schedules=data||[];
    render();
  }
  async function enableFromExpense(expenseId,frequency){
    const {data,error}=await supabase.rpc("enable_auto_recurring_expense",{
      p_expense_id:expenseId,p_frequency:frequency
    });
    if(error)throw error;
    if(!data)throw new Error("Automatic schedule was not confirmed.");
    await refresh();
    return data;
  }
  async function pauseFromExpense(scheduleId){
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user)throw new Error("Please sign in.");
    const {data,error}=await supabase.from("Apiary_Recurring_Expenses")
      .update({active:false,updated_at:new Date().toISOString()})
      .eq("id",scheduleId).eq("user_id",user.id).eq("automatic_posting",true).select("id");
    if(error||!data?.length)throw error||new Error("Automatic schedule not found.");
    await refresh();
  }
  function isAutomatic(scheduleId){
    return schedules.some(s=>String(s.id)===String(scheduleId));
  }
  function frequencyFor(scheduleId){
    return schedules.find(s=>String(s.id)===String(scheduleId))?.frequency||"monthly";
  }
  return{refresh,enableFromExpense,pauseFromExpense,isAutomatic,frequencyFor};
}
