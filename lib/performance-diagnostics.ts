/**
 * Opt-in client diagnostics for reproducing navigation and Firestore lag.
 * No network telemetry, no account names, no employee locations, no credentials.
 * Enable locally with localStorage.setItem("momentum-performance-diagnostics","on").
 */
export const PERFORMANCE_DIAGNOSTICS_FLAG="momentum-performance-diagnostics";
export const PERFORMANCE_DIAGNOSTICS_KEY="momentum-performance-timings";
export type PerformanceTimingSample={
  at:string;
  operation:"startup-directory"|"startup-firestore-prime"|"startup-workspace-ready"|"navigation-paint"|"navigation-commit"|"invoice-switch-paint"|"firestore-batch-read"|"firestore-single-read"|"firestore-list-read"|"firestore-batch-permission-fallback"|"firestore-poll"|"firestore-commit"|"firestore-write-build"|"storage-journal";
  durationMs:number;
  count?:number;
  page?:string;
};

const enabled=()=>{
  if(typeof window==="undefined")return false;
  try{return window.localStorage.getItem(PERFORMANCE_DIAGNOSTICS_FLAG)==="on";}
  catch{return false;}
};

export function recordPerformanceSample(
  sample:Omit<PerformanceTimingSample,"at">,
){
  if(!enabled())return;
  try{
    const raw=window.localStorage.getItem(PERFORMANCE_DIAGNOSTICS_KEY);
    const parsed=raw?JSON.parse(raw):[];
    const old=Array.isArray(parsed)?parsed:[];
    const entry:PerformanceTimingSample={
      ...sample,at:new Date().toISOString(),
      durationMs:Math.round(sample.durationMs*100)/100,
    };
    window.localStorage.setItem(PERFORMANCE_DIAGNOSTICS_KEY,
      JSON.stringify([...old.slice(-199),entry]));
  }catch{/* Diagnostics must not affect business writes or navigation. */}
}

let pendingNavigation:{page:string;started:number}|null=null;

/** Measures navigation paint, not server/data readiness. */
export function traceNavigationPaint(page:string){
  if(!enabled())return;
  const started=performance.now();
  pendingNavigation={page,started};
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    recordPerformanceSample({
      operation:"navigation-paint",
      page,
      durationMs:performance.now()-started,
    });
  }));
}

/** Capture React's commit of the requested module, separately from the first paint. */
export function traceNavigationCommit(page:string){
  if(!enabled()||pendingNavigation?.page!==page)return;
  const started=pendingNavigation.started;
  pendingNavigation=null;
  recordPerformanceSample({
    operation:"navigation-commit",
    page,
    durationMs:performance.now()-started,
  });
}
