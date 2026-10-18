import {mechanicalOracle as priorOracle} from '../realworld-v2/oracle.mjs';
import {sessionOracle} from './session-collab-v3/oracle.mjs';
export async function mechanicalOracle(entry,input,output,independent) {
 return entry.runtimeKind==='session-collab'?sessionOracle(input,output,independent):priorOracle({...entry,id:entry.project},input,output,independent);
}
