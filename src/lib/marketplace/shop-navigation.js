// Species/category are route-owned; query filters cannot replace that scope.
export function shopCatalogParams(search,animal,category){
 const params=new URLSearchParams(search);params.set('animal',animal);params.delete('product');
 if(category)params.set('category',category);else params.delete('category');
 return params;
}
export function buildShopCatalogUrl(animal,category,search=new URLSearchParams(),page){
 const params=new URLSearchParams();
 for(const key of ['q','min','max','sort','pageSize']){const value=search.get(key);if(value!==null&&value!=='')params.set(key,value);}
 if(page!==undefined)params.set('page',String(page));
 return `/shop/${encodeURIComponent(animal)}${category?'/'+encodeURIComponent(category):''}${params.size?'?'+params:''}`;
}
