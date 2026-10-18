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
  async function getAllSchedules(ownerId){
    const rows=[],pageSize=500;
    for(let offset=0;offset<1000000;offset+=pageSize){
      const {data,error}=await supabase.from("Apiary_Recurring_Expenses").select("*")
        .eq("user_id",ownerId).eq("automatic_posting",true)
        .order("next_due_date",{ascending:true}).order("id",{ascending:true})
        .range(offset,offset+pageSize-1);
      if(error)return {data:null,error};
      if(!Array.isArray(data))return {data:null,error:new Error("Unexpected recurring schedule page")};
      rows.push(...data);
      if(data.length<pageSize)return {data:rows,error:null};
    }
    return {data:null,error:new Error("Recurring schedule list exceeds safe paging limit")};
  }
  const currency=amount=>"$"+Number(amount||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  function el(tag,content,className){
    const element=document.createElement(tag);
    if(content!==undefined)element.textContent=content;
    if(className)element.className=className;
    return element;
  }

  // Scheduler dates use America/New_York (the timezone of automatic postings).
  function nyToday(){
    const parts=new Intl.DateTimeFormat("en-US",{
      timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(new Date());
    const part=kind=>parts.find(p=>p.type===kind)?.value;
    return part("year")+"-"+part("month")+"-"+part("day");
  }
  function validateScheduleUpdate(original,fields,today=nyToday()){
    const description=String(fields.description||"").trim();
    const category=String(fields.category||"").trim();
    const vendor=String(fields.vendor||"").trim();
    const payment_method=String(fields.payment_method||"").trim();
    const notes=String(fields.notes||"").trim();
    const amountText=String(fields.amount??"").trim();
    const frequency=fields.frequency;
    const due=fields.next_due_date;
    if(!description||description.length>240)throw new Error("Description must be 1 to 240 characters.");
    if(!category||category.length>120)throw new Error("Category must be 1 to 120 characters.");
    if(!/^\d+(?:\.\d{1,2})?$/.test(amountText)||
        !Number.isFinite(Number(amountText))||Number(amountText)>9999999999.99)
      throw new Error("Amount must be a nonnegative number with up to two decimal places.");
    if(!["monthly","quarterly","yearly"].includes(frequency))
      throw new Error("Choose monthly, quarterly, or yearly repetition.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(due||"")||
        Number.isNaN(Date.parse(due+"T00:00:00Z"))||
        new Date(due+"T00:00:00Z").toISOString().slice(0,10)!==due)
      throw new Error("Choose a valid next due date.");
    if(due<=today)throw new Error("Choose a future next due date, after today.");
    const payload={
      description,category,vendor:vendor||null,amount:Number(amountText),
      payment_method:payment_method||null,notes:notes||null,
      frequency,next_due_date:due,updated_at:new Date().toISOString()
    };
    // If the billing date changes, it becomes the new anchor day. The
    // scheduler uses the anchor's day-of-month for subsequent entries.
    if(due!==original.next_due_date)payload.anchor_date=due;
    return payload;
  }
  function scheduleEditForm(schedule){
    const form=el("form",undefined,"record recurring-edit-form");
    const title=el("strong","Edit future automatic expenses");
    const advice=el("p","Changes apply only to future automatic entries. Past expense records and attached receipts do not change. Changing Next due date also sets the billing day for future repetitions.","muted");
    form.append(title,advice);
    const fields=el("div",undefined,"two-col"),controls={};
    function field(labelText,key,type,value,opts={}){
      const container=el("div"),label=el("label",labelText);
      const input=document.createElement(type==="textarea"?"textarea":type==="select"?"select":"input");
      if(type==="select"){
        for(const [v,caption] of [["monthly","Monthly"],["quarterly","Quarterly"],["yearly","Yearly"]]){
          const option=document.createElement("option");option.value=v;option.textContent=caption;input.append(option);
        }
      }else if(type!=="textarea")input.type=type;
      input.value=value===null||value===undefined?"":String(value);
      if(opts.required)input.required=true;
      if(opts.maxLength)input.maxLength=opts.maxLength;
      if(opts.min!==undefined)input.min=String(opts.min);
      if(opts.max!==undefined)input.max=String(opts.max);
      if(opts.step!==undefined)input.step=String(opts.step);
      controls[key]=input;
      label.append(input);container.append(label);fields.append(container);
    }
    field("Description","description","text",schedule.description,{required:true,maxLength:240});
    field("Category","category","text",schedule.category,{required:true,maxLength:120});
    field("Vendor","vendor","text",schedule.vendor);
    field("Amount ($)","amount","number",schedule.amount,{required:true,min:0,max:9999999999.99,step:"0.01"});
    field("Frequency","frequency","select",schedule.frequency,{required:true});
    field("Next due date","next_due_date","date",schedule.next_due_date,{required:true});
    field("Payment method","payment_method","text",schedule.payment_method);
    field("Notes","notes","textarea",schedule.notes);
    form.append(fields);
    const buttons=el("div",undefined,"record-actions");
    const save=el("button","Save Future Schedule");
    save.type="submit";
    const cancel=el("button","Cancel","secondary");
    cancel.type="button";
    const feedback=el("p","","section-status");feedback.setAttribute("role","status");
    cancel.addEventListener("click",()=>form.remove());
    buttons.append(save,cancel);
    form.append(buttons,feedback);
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      if(save.disabled)return;
      try{
        const values=Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value]));
        const payload=validateScheduleUpdate(schedule,values);
        if(!window.confirm("Update future entries for "+schedule.description+
            "? Previously recorded expenses and their receipts will not change."))return;
        save.disabled=true;cancel.disabled=true;
        feedback.textContent="Saving future schedule...";
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError||!user)throw new Error("Please sign in again.");
        // Optimistic concurrency guard: never overwrite a schedule that the
        // background scheduler or another open tab has already advanced.
        const {data,error}=await supabase.from("Apiary_Recurring_Expenses")
          .update(payload)
          .eq("id",schedule.id)
          .eq("user_id",user.id)
          .eq("automatic_posting",true)
          .eq("updated_at",schedule.updated_at)
          .eq("next_due_date",schedule.next_due_date)
          .select("id");
        if(error)throw error;
        if(!data?.length)throw new Error("The schedule changed since you opened it. Refresh Automatic Expenses before editing again.");
        await refresh();
        message.textContent="Future schedule updated. Past expense entries and receipts were not changed.";
      }catch(err){
        feedback.textContent="Could not update future schedule: "+(err?.message||String(err));
        save.disabled=false;cancel.disabled=false;
      }
    });
    return form;
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
      const edit=el("button","Edit Future Schedule","secondary");
      edit.type="button";
      edit.addEventListener("click",()=>{
        const previous=box.querySelector(".recurring-edit-form");
        if(previous){previous.remove();return;}
        // A schedule can only have one edit form per card.
        box.append(scheduleEditForm(s));
      });
      buttons.append(edit,toggle);
      box.append(buttons);
      list.append(box);
    }
  }
  async function refresh(){
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user){list.textContent="Sign in to see your automatic expenses.";return;}
    const {data,error}=await getAllSchedules(user.id);
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
