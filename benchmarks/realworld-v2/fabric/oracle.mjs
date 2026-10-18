export function mechanicalOracle(_entry,_input,output,independent) {
  const payload=output.results??output;
  return typeof payload.apiSpecification==='string'&&independent?.spec!==undefined
    &&JSON.stringify(JSON.parse(payload.apiSpecification))===JSON.stringify(JSON.parse(independent.spec));
}
