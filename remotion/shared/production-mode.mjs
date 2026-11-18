export const isAuthoredProcess=p=>['local-process','model-process'].includes(p.productionMode);
export const isModelProcess=p=>p.productionMode==='model-process';
