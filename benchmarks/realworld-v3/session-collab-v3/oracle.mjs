// Independent fixture facts; neither native return values nor new responses are
// used to derive safe/blocked membership or active ownership.
export function sessionOracle(input,output,state) {
 if(!output||typeof output!=='object'||!state?.tables||state.side_effect_count!==0)return false;
 const sessions=new Map(state.tables.sessions.map(row=>[row.id,row]));
 const active=state.tables.claims.filter(row=>row.status==='active'&&row.session_id!==input.session_id&&sessions.get(row.session_id)?.status==='active');
 const conflicts=state.tables.claim_files.filter(row=>input.files.includes(row.file_path)&&active.some(claim=>claim.id===row.claim_id));
 const blocked=input.files.filter(file=>conflicts.some(row=>row.file_path===file));
 const safe=input.files.filter(file=>!blocked.includes(file));
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(output.has_conflicts!==Boolean(blocked.length)||output.safe!==!blocked.length||output.can_edit!==Boolean(safe.length))return false;
 if(!same(output.file_status,{safe,blocked}))return false;
 if(output.recommendation!==(blocked.length===0?'proceed_all':safe.length?'proceed_safe_only':'abort'))return false;
 if(output.has_in_progress_todo!==false||output.todos_status!==null)return false;
 if(blocked.length) {
  const owners=[...new Set(conflicts.map(row=>active.find(claim=>claim.id===row.claim_id).session_id))];
  if(output.conflicts?.length!==owners.length)return false;
  for(const owner of owners) {
   const expected=conflicts.filter(row=>active.find(claim=>claim.id===row.claim_id).session_id===owner).map(row=>row.file_path);
   const actual=output.conflicts.find(row=>row.session_id===owner);
   if(!actual||actual.session_name!==sessions.get(owner).name||!same(actual.files,expected)||actual.symbols?.length!==0)return false;
  }
 }
 return true;
}
