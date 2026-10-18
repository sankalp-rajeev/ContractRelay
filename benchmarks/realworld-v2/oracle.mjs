export async function mechanicalOracle(entry,input,output,independent) {
  if(!/^[a-z0-9-]+$/.test(entry.id))throw new Error('INVALID_CASE_ID');
  const oracle=await import(`./${entry.id}/oracle.mjs`);
  return oracle.mechanicalOracle(entry,input,output,independent);
}
