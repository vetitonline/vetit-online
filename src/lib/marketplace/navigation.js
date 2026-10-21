import {resolveIndianLocale} from '../i18n/locales.js';
// Destinations, not seller-created categories. English is the reviewed default;
// add reviewed locale copy here without changing route or permission decisions.
const copy={en:[
 ['products','Shop products','Published marketplace listings','/products','essentials.webp','essentials'],
 ['animals','Pets & livestock','Browse admin-managed categories','/shop','livestock.webp','livestock'],
 ['services','Local services','Find pet and veterinary care','/services','dog.webp','dogs'],
 ['appointments','Your appointments','View bookings and provider schedules','/appointments','cat.webp','cats'],
]};
export function marketplaceDestinations(language='en'){
 const locale=resolveIndianLocale(language,Object.keys(copy));
 return copy[locale.language].map(([key,title,description,href,image,art])=>({key,title,description,href,image:'/images/discovery/'+image,art}));
}
export function marketplaceNavigation(key){
 if(key==='appointments')return{tab:null,path:'/appointments',clearFilters:false};
 if(key==='services')return{tab:'services',path:null,clearFilters:false};
 if(key==='products'||key==='animals')return{tab:'shop',path:null,clearFilters:true};
 throw new Error('Unsupported marketplace destination');
}
