// Real destinations only: discovery cards are never fabricated seller listings.
const destinations=[
 {title:'Explore Pet Essentials',href:'/products',image:'essentials',cta:'See all products'},
 {title:'Pet & Vet Services',href:'/services',image:'dogs',cta:'Find local services'},
 {title:'Shop by pet or livestock',href:'/shop',image:'livestock',cta:'Browse the marketplace'},
];
export function featuredDiscoveryCards(state,count){
 if(state!=='available'||!Number.isInteger(count)||count<1||count>=4)return [];
 return destinations.slice(0,4-count).map(card=>({...card}));
}
