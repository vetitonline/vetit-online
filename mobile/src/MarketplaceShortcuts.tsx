import React from 'react';
import {View,Text,Pressable} from 'react-native';
import {marketplaceDestinations,type MarketplaceDestinationKey} from '../../src/lib/marketplace/navigation.js';
import {ProductPhoto} from './ProductPhoto';
export function MarketplaceShortcuts({onNavigate,imageBaseUrl,language='en'}:{onNavigate:(key:MarketplaceDestinationKey)=>void;imageBaseUrl:string;language?:string}){
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:12,marginVertical:16}}>
  {marketplaceDestinations(language).map(tile=><Pressable key={tile.key} accessibilityRole="button" accessibilityLabel={tile.title}
   onPress={()=>onNavigate(tile.key)} style={{flexBasis:'46%',flexGrow:1,minWidth:140,borderWidth:1,borderColor:'#ded8e8',borderRadius:14,overflow:'hidden'}}>
   <ProductPhoto uri={imageBaseUrl.replace(/\/$/,'')+tile.image} label={tile.title} fallback={tile.title} style={{width:'100%',height:88}}/>
   <Text style={{fontWeight:'700',padding:10}}>{tile.title}</Text><Text style={{paddingHorizontal:10,paddingBottom:12}}>{tile.description}</Text>
  </Pressable>)}
 </View>;
}
