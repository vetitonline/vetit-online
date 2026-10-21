export function attachProductImageFallback(image,fallback){
 const fail=()=>{image.hidden=true;fallback.hidden=false;};
 image.addEventListener('error',fail,{once:true});
 // Cached failures may happen before the Astro script initializes.
 if(image.complete&&image.naturalWidth===0)fail();
 return ()=>image.removeEventListener('error',fail);
}
