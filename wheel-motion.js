(function(root){
  'use strict';
  const active=new Set();
  const wrap=angle=>((angle%360)+360)%360;
  function brakingPlan(angle,period,index,count){
    const target=wrap(-(index+.5)*360/count);
    const distance=540+wrap(target-wrap(angle)-540);
    // Match initial braking speed (2*distance/duration) to linear cruising.
    return {from:angle,to:angle+distance,duration:distance*period/180,target};
  }
  function start(disc,{period=700,reduced=false}={}){
    disc.style.transition='none';disc.style.transform='rotate(0deg)';
    const cruise=reduced?null:disc.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:period,iterations:Infinity,easing:'linear'});
    let braking=null,cancelled=false;
    const motion={
      cancel(){cancelled=true;cruise?.cancel();braking?.cancel();active.delete(motion);},
      async stop(index,count,isCurrent=()=>true){
        if(cancelled||!isCurrent()){motion.cancel();return false;}
        const angle=Number(cruise?.currentTime||0)*360/period;
        const plan=brakingPlan(angle,period,index,count);
        disc.style.transform=`rotate(${angle}deg)`;cruise?.cancel();
        if(!reduced){
          braking=disc.animate([{transform:`rotate(${plan.from}deg)`},{transform:`rotate(${plan.to}deg)`}],
            {duration:plan.duration,easing:'cubic-bezier(0.3333333333,0.6666666667,0.6666666667,1)',fill:'forwards'});
          try{await braking.finished;}catch{motion.cancel();return false;}
        }
        if(cancelled||!isCurrent()){motion.cancel();return false;}
        disc.style.transform=`rotate(${plan.target}deg)`;braking?.cancel();active.delete(motion);return true;
      }
    };
    active.add(motion);return motion;
  }
  const api={brakingPlan,start,cancelAll(){for(const motion of [...active])motion.cancel();}};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.DouxWheel=api;
})(typeof window==='undefined'?globalThis:window);
