import React from 'react';
import {View,Text,Pressable} from 'react-native';
import type {ProductAnimal,ProductCategory} from '../../src/lib/marketplace/catalog-types.js';
import {categoriesForSpecies} from '../../src/lib/marketplace/category-navigation.js';
import {discoveryImagePath} from '../../src/lib/marketplace/discovery-images.js';
import {ProductPhoto} from './ProductPhoto';

// Only server-owned animals/categories are displayed. Editorial images do not
// represent products, availability, prices or seller-supplied photographs.
export function SpeciesDiscovery({animals,categories,imageBaseUrl,selectedSlug,onSelect}:{
 animals:ProductAnimal[];categories:ProductCategory[];imageBaseUrl:string;
 selectedSlug?:string;onSelect:(animal:ProductAnimal)=>void;
}){
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:12,marginBottom:16}}>
  {animals.map(animal=>{
   const available=categoriesForSpecies(categories,animal.id);
   const leaves=available.filter(category=>!available.some(child=>child.parentId===category.id));
   return <Pressable key={animal.id} accessibilityRole="button" accessibilityLabel={animal.label}
    accessibilityState={{selected:animal.slug===selectedSlug}} onPress={()=>onSelect(animal)}
    style={{flexBasis:'46%',flexGrow:1,minWidth:136,borderWidth:1,borderColor:animal.slug===selectedSlug?'#f27d32':'#d9c9ed',borderRadius:14,overflow:'hidden',backgroundColor:'#fbf9ff'}}>
    <ProductPhoto uri={imageBaseUrl.replace(/\/$/,'')+discoveryImagePath(animal.slug)} label={animal.label}
     fallback={animal.label} style={{width:'100%',height:112}}/>
    <Text style={{padding:10,fontWeight:'700',color:'#3f1f68'}}>{animal.label}</Text>
    {!!leaves.length&&<Text numberOfLines={2} style={{paddingHorizontal:10,paddingBottom:12,color:'#716a7d'}}>{leaves.slice(0,3).map(category=>category.label).join(' · ')}</Text>}
   </Pressable>;
  })}
 </View>;
}
